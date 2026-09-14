/**
 * Sowel Plugin: Guest Access
 *
 * The house's half of the guest gate access (specs/portier-channel.md). It brings the gate
 * commands of the gîte and lodge guests into Sowel — and it does nothing else: it never touches
 * the gate. A recipe binds to the device exposed here, decides, and answers through an order.
 *
 * The trust model is the point. Portier holds the accesses and decides who may open; it opens no
 * connection towards this house and holds no credential over it. The house opens the channel
 * itself and answers a challenge with a key that never travels, so the house network keeps
 * accepting nothing from outside.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeHouseKey } from "./frame-signature.js";
import { COMMAND_STATUSES, DEVICE_ID, GATE_STATES, PortierChannel } from "./portier-channel.js";
import type {
  CommandStatus,
  DeviceManager,
  EventBus,
  GateState,
  Logger,
  SocketFactory,
} from "./portier-channel.js";
import { isAcceptableUrl } from "./url-guard.js";

interface SettingsManager {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

interface Device {
  id: string;
  integrationId: string;
  sourceDeviceId: string;
  name: string;
}

interface PluginDeps {
  logger: Logger;
  eventBus: EventBus;
  settingsManager: SettingsManager;
  deviceManager: DeviceManager;
  pluginDir: string;
}

/** Not part of Sowel's deps: lets a test hand in a fake socket. */
interface PluginOptions {
  socketFactory?: SocketFactory;
}

type IntegrationStatus = "connected" | "disconnected" | "not_configured" | "error";

interface IntegrationSettingDef {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "boolean";
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
}

interface IntegrationPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly apiVersion?: number;
  getStatus(): IntegrationStatus;
  isConfigured(): boolean;
  getSettingsSchema(): IntegrationSettingDef[];
  start(options?: { pollOffset?: number }): Promise<void>;
  stop(): Promise<void>;
  executeOrder(
    device: Device,
    orderKeyOrDispatchConfig: string | Record<string, unknown>,
    value: unknown,
  ): Promise<void>;
}

const INTEGRATION_ID = "guest-access";
const SETTINGS_PREFIX = `integration.${INTEGRATION_ID}.`;

export const DEFAULT_PING_MINUTES = 10;
const MIN_PING_MINUTES = 1;
const MAX_PING_MINUTES = 30;

/**
 * Not a form setting: the request counter's last value, kept so the counter goes on counting up
 * after a restart. Started again from 0, the first command after a restart would publish a value
 * below the one the recipe last saw, and the recipe — which only fires on a counter going up —
 * would silently miss that guest.
 */
const REQUEST_COUNT_KEY = "requests_count";

/** Same as the manifest's `settings` (a test holds them equal). */
const SETTINGS_SCHEMA: IntegrationSettingDef[] = [
  {
    key: "portier_url",
    label: "Portier channel URL",
    type: "text",
    required: true,
    placeholder: "wss://portier.<internal zone>/house/v1",
  },
  { key: "house_key", label: "House key", type: "password", required: true },
  {
    key: "ping_minutes",
    label: "Channel ping (minutes, 1 to 30)",
    type: "number",
    required: false,
    defaultValue: String(DEFAULT_PING_MINUTES),
  },
];

/**
 * A whole number of minutes from 1 to 30; unset means the default. Anything else is `null`: the
 * plugin then uses the default rather than send a `pingSeconds` Portier would replace with 600
 * while this side pings on another rhythm.
 */
export function parsePingMinutes(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PING_MINUTES;
  if (!/^\d+$/.test(raw.trim())) return null;
  const minutes = Number(raw.trim());
  return minutes >= MIN_PING_MINUTES && minutes <= MAX_PING_MINUTES ? minutes : null;
}

/** The version Portier is told, read from the installed manifest. */
function readPluginVersion(pluginDir: string): string {
  try {
    const manifest = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof manifest.version === "string" && manifest.version ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
}

/** `key` when the core passes a bare order key, `key`/`orderKey` when it passes a dispatch config. */
function orderKeyOf(orderKeyOrDispatchConfig: string | Record<string, unknown>): string {
  if (typeof orderKeyOrDispatchConfig === "string") return orderKeyOrDispatchConfig;
  const config = orderKeyOrDispatchConfig || {};
  const candidate = config.orderKey ?? config.key ?? config.alias;
  return typeof candidate === "string" ? candidate : "";
}

class GuestAccessPlugin implements IntegrationPlugin {
  readonly id = INTEGRATION_ID;
  readonly name = "Guest Access";
  readonly description =
    "Holds a channel open to Portier and brings the gate commands of the gîte and lodge guests into Sowel";
  readonly icon = "DoorOpen";
  readonly apiVersion = 2;

  private readonly logger: Logger;
  private readonly eventBus: EventBus;
  private readonly settingsManager: SettingsManager;
  private readonly deviceManager: DeviceManager;
  private readonly pluginDir: string;
  private readonly socketFactory?: SocketFactory;
  private channel: PortierChannel | null = null;
  /** Set when start() refused the settings: that is an error to fix, not a link going down. */
  private refusedSettings = false;

  constructor(deps: PluginDeps, options: PluginOptions = {}) {
    this.logger = deps.logger;
    this.eventBus = deps.eventBus;
    this.settingsManager = deps.settingsManager;
    this.deviceManager = deps.deviceManager;
    this.pluginDir = deps.pluginDir;
    this.socketFactory = options.socketFactory;
  }

  getStatus(): IntegrationStatus {
    if (!this.isConfigured()) return "not_configured";
    if (this.refusedSettings) return "error";
    if (!this.channel) return "disconnected";
    if (this.channel.isConnected()) return "connected";
    return this.channel.isKeyRefused() ? "error" : "disconnected";
  }

  /** Both, or nothing: without the address or the key there is no channel to open (spec §3.6). */
  isConfigured(): boolean {
    return !!this.getSetting("portier_url") && !!this.getSetting("house_key");
  }

  getSettingsSchema(): IntegrationSettingDef[] {
    return SETTINGS_SCHEMA.map((setting) => ({ ...setting }));
  }

  async start(): Promise<void> {
    if (this.channel) return;
    this.refusedSettings = false;
    if (!this.isConfigured()) return;

    const url = this.getSetting("portier_url")!;
    if (!isAcceptableUrl(url)) {
      this.refusedSettings = true;
      this.logger.error(
        { url },
        "Refusing to start: the Portier channel must be a wss:// address (ws:// is only accepted towards localhost)",
      );
      return;
    }

    const houseKey = decodeHouseKey(this.getSetting("house_key")!);
    if (!houseKey) {
      this.refusedSettings = true;
      this.logger.error(
        {},
        "Refusing to start: the house key must be the base64url text of 32 bytes (43 characters), as Portier holds it",
      );
      return;
    }

    const rawPing = this.getSetting("ping_minutes");
    let pingMinutes = parsePingMinutes(rawPing);
    if (pingMinutes === null) {
      this.logger.warn(
        { ping_minutes: rawPing },
        `ping_minutes must be a whole number from ${MIN_PING_MINUTES} to ${MAX_PING_MINUTES} — using ${DEFAULT_PING_MINUTES}`,
      );
      pingMinutes = DEFAULT_PING_MINUTES;
    }

    this.channel = new PortierChannel({
      integrationId: INTEGRATION_ID,
      url,
      houseKey,
      pingMinutes,
      pluginVersion: readPluginVersion(this.pluginDir),
      deviceManager: this.deviceManager,
      eventBus: this.eventBus,
      logger: this.logger,
      initialRequestCount: Number(this.getSetting(REQUEST_COUNT_KEY) ?? 0),
      onRequestCount: (count) =>
        this.settingsManager.set(`${SETTINGS_PREFIX}${REQUEST_COUNT_KEY}`, String(count)),
      socketFactory: this.socketFactory,
    });
    this.channel.start();
    this.logger.info({ pingMinutes }, "Guest Access plugin started");
  }

  async stop(): Promise<void> {
    if (this.channel) {
      await this.channel.stop();
      this.channel = null;
    }
    this.eventBus.emit({ type: "system.integration.disconnected", integrationId: this.id });
    this.logger.info({}, "Guest Access plugin stopped");
  }

  /**
   * The two orders the recipe uses. `result` is the outcome of the command in flight and goes up
   * as a `result` frame; `gate_state` is the contact the recipe read for us. An unknown key or
   * value throws, because a recipe sending one has a bug and a silent no-op would hide it.
   */
  async executeOrder(
    device: Device,
    orderKeyOrDispatchConfig: string | Record<string, unknown>,
    value: unknown,
  ): Promise<void> {
    if (!this.channel) throw new Error("Guest Access plugin is not started");
    if (device && device.sourceDeviceId && device.sourceDeviceId !== DEVICE_ID) {
      throw new Error(`Unknown device: ${device.sourceDeviceId}`);
    }

    const key = orderKeyOf(orderKeyOrDispatchConfig);
    const text = typeof value === "string" ? value : String(value ?? "");

    if (key === "result") {
      if (!COMMAND_STATUSES.includes(text as CommandStatus)) {
        throw new Error(`Unknown outcome: ${text}`);
      }
      this.channel.report(text as CommandStatus);
      return;
    }

    if (key === "gate_state") {
      if (!GATE_STATES.includes(text as GateState)) {
        throw new Error(`Unknown gate state: ${text}`);
      }
      this.channel.setGateState(text as GateState);
      return;
    }

    throw new Error(`Unsupported order: ${key || "(none)"}`);
  }

  private getSetting(key: string): string | undefined {
    const raw = this.settingsManager.get(`${SETTINGS_PREFIX}${key}`);
    return raw && raw.trim() ? raw.trim() : undefined;
  }
}

export function createPlugin(deps: PluginDeps, options?: PluginOptions): IntegrationPlugin {
  return new GuestAccessPlugin(deps, options);
}
