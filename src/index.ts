/**
 * Sowel Plugin: Guest Access
 *
 * The house's half of the guest gate access (guestFlow's specs/guest-gate-access.md).
 * It brings the open requests of the gîte and lodge guests into Sowel — and it
 * does nothing else: it never touches the gate. A recipe binds to the device
 * exposed here, decides, and answers through an order.
 *
 * The trust model is the point. GuestFlow is the machine exposed on the
 * internet; it holds no credential over this house and opens no connection
 * towards it. This plugin goes and asks (a long poll, outbound), which is why a
 * compromise of the booking app cannot command anything here.
 */

import { GatePoller, DEVICE_ID } from "./gate-poller.js";
import type { DeviceManager, EventBus, Logger, GateState, RequestOutcome } from "./gate-poller.js";

interface SettingsManager {
  get(key: string): string | undefined;
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
const DEFAULT_WAIT_SECONDS = 25;

const OUTCOMES: RequestOutcome[] = ["opened", "already_open", "refused", "error"];

/**
 * Plain HTTP is refused towards anything but this machine.
 *
 * The signature makes a sniffed channel survivable — the secret never travels — but it encrypts
 * nothing: the stay code, the lodging and the guest's name would cross the LAN in clear, on a
 * network that also carries whatever a guest brings. GuestFlow is served over TLS under its public
 * name, so there is no reason left to accept anything else.
 *
 * `localhost` stays allowed: that is a developer running both halves on one machine, where there is
 * no wire to listen to.
 */
export function isAcceptableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}
const GATE_STATES: GateState[] = ["open", "closed", "unknown"];

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
    "Brings the gate-opening requests of the gîte and lodge guests from GuestFlow into Sowel";
  readonly icon = "DoorOpen";
  readonly apiVersion = 2;

  private logger: Logger;
  private eventBus: EventBus;
  private settingsManager: SettingsManager;
  private deviceManager: DeviceManager;
  private poller: GatePoller | null = null;
  private status: IntegrationStatus = "disconnected";

  constructor(deps: PluginDeps) {
    this.logger = deps.logger;
    this.eventBus = deps.eventBus;
    this.settingsManager = deps.settingsManager;
    this.deviceManager = deps.deviceManager;
  }

  getStatus(): IntegrationStatus {
    if (!this.isConfigured()) return "not_configured";
    if (!this.poller) return this.status;
    return this.poller.isConnected() ? "connected" : "error";
  }

  /**
   * All three, or nothing. The signing secret is not optional hardening: without it the plugin
   * cannot tell GuestFlow's answer from anyone else's on the LAN, and an answer is what makes the
   * recipe pulse the gate (§4.4). An integration showing « not configured » is a problem someone
   * fixes; one silently accepting forged requests is not.
   */
  isConfigured(): boolean {
    return !!this.getSetting("base_url") && !!this.getSetting("api_key") && !!this.getSetting("signing_secret");
  }

  getSettingsSchema(): IntegrationSettingDef[] {
    return [
      {
        key: "base_url",
        label: "GuestFlow URL",
        type: "text",
        required: true,
        placeholder: "https://guestflow.adn-dev.fr",
      },
      { key: "api_key", label: "GuestFlow gate API key", type: "password", required: true },
      {
        key: "signing_secret",
        label: "GuestFlow signing secret",
        type: "password",
        required: true,
      },
      {
        key: "wait_seconds",
        label: "Long-poll duration (s)",
        type: "number",
        required: false,
        defaultValue: String(DEFAULT_WAIT_SECONDS),
      },
    ];
  }

  async start(): Promise<void> {
    if (!this.isConfigured()) {
      this.status = "not_configured";
      return;
    }
    const baseUrl = this.getSetting("base_url")!;
    if (!isAcceptableUrl(baseUrl)) {
      this.status = "error";
      this.logger.error(
        { baseUrl },
        "Refusing to start: GuestFlow must be reached over HTTPS (use its public name, "
          + "https://guestflow.adn-dev.fr). Plain HTTP is only accepted towards localhost.",
      );
      return;
    }

    const waitSeconds = Number(this.getSetting("wait_seconds") ?? DEFAULT_WAIT_SECONDS);
    this.poller = new GatePoller({
      integrationId: INTEGRATION_ID,
      baseUrl,
      apiKey: this.getSetting("api_key")!,
      signingSecret: this.getSetting("signing_secret")!,
      // A wait longer than the reverse proxy's read timeout would be cut mid-air
      // every time; shorter than a second would be a busy loop.
      waitSeconds: Number.isFinite(waitSeconds) ? Math.min(Math.max(waitSeconds, 1), 55) : DEFAULT_WAIT_SECONDS,
      deviceManager: this.deviceManager,
      eventBus: this.eventBus,
      logger: this.logger,
    });
    this.poller.start();
    this.status = "connected";
    this.logger.info({}, "Guest Access plugin started");
  }

  async stop(): Promise<void> {
    if (this.poller) {
      await this.poller.stop();
      this.poller = null;
    }
    this.status = "disconnected";
    this.eventBus.emit({ type: "system.integration.disconnected", integrationId: this.id });
    this.logger.info({}, "Guest Access plugin stopped");
  }

  /**
   * The two orders the recipe uses.
   *
   * `result` is an answer to a request, and it goes out over HTTP. `gate_state`
   * is the contact the recipe read for us — it costs nothing and travels on the
   * next poll. An unknown key throws, because a recipe sending one has a bug and
   * a silent no-op would hide it.
   */
  async executeOrder(
    device: Device,
    orderKeyOrDispatchConfig: string | Record<string, unknown>,
    value: unknown,
  ): Promise<void> {
    if (!this.poller) throw new Error("Guest Access plugin is not started");
    if (device && device.sourceDeviceId && device.sourceDeviceId !== DEVICE_ID) {
      throw new Error(`Unknown device: ${device.sourceDeviceId}`);
    }

    const key = orderKeyOf(orderKeyOrDispatchConfig);
    const text = typeof value === "string" ? value : String(value ?? "");

    if (key === "result") {
      if (!OUTCOMES.includes(text as RequestOutcome)) {
        throw new Error(`Unknown outcome: ${text}`);
      }
      await this.poller.report(text as RequestOutcome);
      return;
    }

    if (key === "gate_state") {
      if (!GATE_STATES.includes(text as GateState)) {
        throw new Error(`Unknown gate state: ${text}`);
      }
      this.poller.setGateState(text as GateState);
      return;
    }

    throw new Error(`Unsupported order: ${key || "(none)"}`);
  }

  private getSetting(key: string): string | undefined {
    const raw = this.settingsManager.get(`${SETTINGS_PREFIX}${key}`);
    return raw && raw.trim() ? raw.trim() : undefined;
  }
}

export function createPlugin(deps: PluginDeps): IntegrationPlugin {
  return new GuestAccessPlugin(deps);
}
