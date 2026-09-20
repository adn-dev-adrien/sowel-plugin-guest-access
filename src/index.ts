/**
 * Sowel Plugin — Accès invités
 *
 * The whole guest gate access, in the house. The accesses, their codes, their
 * hours, the journal, the owner's page and the guests' own page all live here;
 * guestFlow is one optional source of stays, reached outbound, and the system
 * keeps working when it is not there at all.
 *
 * That is the change from v0.3, and it is an inversion rather than a move: the
 * booking application used to hold the accesses and this house went and asked
 * for the requests. Everything that made that arrangement necessary — guestFlow
 * is exposed on the internet, a Sowel API token actuates every equipment there
 * is — is answered better by the house holding the rules and nobody holding a
 * token: the guest's phone talks to Sowel's own anonymous tree (core spec 180),
 * this plugin decides, and the recipe still holds the trigger.
 */

import { AccessStore } from "./store.js";
import { Gate, DEVICE_ID, type GateState, type RecipeOutcome } from "./gate.js";
import { GuestAccessService } from "./service.js";
import { GuestFlowConnector, type ConnectorConfig } from "./guestflow.js";
import { createAdminApi } from "./admin-api.js";
import { createPublicApi } from "./public-api.js";
import { isAcceptableUrl } from "./url-guard.js";
import type {
  Device,
  IntegrationSettingDef,
  IntegrationStatus,
  PluginHttpRequest,
  PluginHttpResponse,
} from "./plugin-contract.js";
import type { Access } from "./model.js";

export { isAcceptableUrl };

interface Logger {
  info(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

interface SettingsManager {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

interface EventBus {
  emit(event: Record<string, unknown>): void;
}

interface DeviceManager {
  upsertFromDiscovery(integrationId: string, source: string, discovered: unknown): void;
  updateDeviceData(
    integrationId: string,
    sourceDeviceId: string,
    payload: Record<string, unknown>,
  ): void;
  updateDeviceStatus(integrationId: string, sourceDeviceId: string, status: string): void;
}

interface PluginDeps {
  logger: Logger;
  eventBus: EventBus;
  settingsManager: SettingsManager;
  deviceManager: DeviceManager;
  pluginDir: string;
  /** Core spec 180 — survives updates. Everything below is kept there. */
  dataDir: string;
}

const INTEGRATION_ID = "guest-access";
const SETTINGS_PREFIX = `integration.${INTEGRATION_ID}.`;
const CURSOR_KEY = `${SETTINGS_PREFIX}stay_cursor`;
const PUBLIC_FLAG_KEY = `plugins.${INTEGRATION_ID}.public_enabled`;
const DEFAULT_POLL_SECONDS = 60;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

const OUTCOMES: RecipeOutcome[] = ["opened", "already_open", "refused", "error"];
const GATE_STATES: GateState[] = ["open", "closed", "unknown"];

/** `key` when the core passes a bare order key, `key`/`orderKey` with a dispatch config. */
function orderKeyOf(orderKeyOrDispatchConfig: string | Record<string, unknown>): string {
  if (typeof orderKeyOrDispatchConfig === "string") return orderKeyOrDispatchConfig;
  const config = orderKeyOrDispatchConfig || {};
  const candidate = config.orderKey ?? config.key ?? config.alias;
  return typeof candidate === "string" ? candidate : "";
}

class GuestAccessPlugin {
  readonly id = INTEGRATION_ID;
  readonly name = "Guest Access";
  readonly description =
    "Gate access for the guests of the gîte and the lodge — accesses, codes and journal held here";
  readonly icon = "DoorOpen";
  readonly apiVersion = 2;

  private readonly deps: PluginDeps;
  private readonly store: AccessStore;
  private readonly gate: Gate;
  private readonly service: GuestAccessService;
  private readonly connector: GuestFlowConnector;
  private readonly admin: (r: PluginHttpRequest) => Promise<PluginHttpResponse>;
  private readonly guest: (r: PluginHttpRequest) => Promise<PluginHttpResponse>;
  private purgeTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(deps: PluginDeps) {
    this.deps = deps;
    this.store = new AccessStore(deps.dataDir, deps.logger);
    this.gate = new Gate({
      integrationId: INTEGRATION_ID,
      deviceManager: deps.deviceManager,
      logger: deps.logger,
    });
    this.service = new GuestAccessService({
      store: this.store,
      gate: this.gate,
      logger: deps.logger,
      notifier: {
        // Information, never a block: a cap would lock a legitimate
        // brother-in-law out at 23 h. An alarm is what Sowel already shows the
        // owner, and it resolves itself when they have seen it.
        devicesOverNotice: (access: Access) => {
          deps.eventBus.emit({
            type: "system.alarm.raised",
            alarmId: `guest-access:devices:${access.id}`,
            level: "warning",
            source: INTEGRATION_ID,
            message: `${access.devices.length} téléphones sur l'accès de ${access.label}`,
          });
        },
      },
    });
    this.connector = new GuestFlowConnector({
      service: this.service,
      logger: deps.logger,
      readCursor: () => Number(deps.settingsManager.get(CURSOR_KEY) ?? 0) || 0,
      writeCursor: (cursor) => deps.settingsManager.set(CURSOR_KEY, String(cursor)),
    });

    this.admin = createAdminApi({
      service: this.service,
      connector: this.connector,
      gate: this.gate,
      guestBaseUrl: () => this.guestBaseUrl(),
      publicTreeOpen: () => deps.settingsManager.get(PUBLIC_FLAG_KEY) === "true",
      onChanged: (access) => {
        this.connector.markDirty(access);
        void this.connector.syncNow();
      },
    });
    this.guest = createPublicApi({
      service: this.service,
      guestBaseUrl: () => this.guestBaseUrl(),
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Always true, and that is the feature: nothing has to be configured for a
   * guest to be let in. Without guestFlow the accesses are hand-made; without a
   * public address the code still works, typed.
   */
  isConfigured(): boolean {
    return true;
  }

  getStatus(): IntegrationStatus {
    return this.started ? "connected" : "disconnected";
  }

  getSettingsSchema(): IntegrationSettingDef[] {
    return [
      {
        key: "guest_base_url",
        label: "Public address of Sowel (for the guests' link)",
        type: "text",
        required: false,
        placeholder: "https://sowel.adn-dev.fr",
      },
      {
        key: "guestflow_base_url",
        label: "GuestFlow URL (optional)",
        type: "text",
        required: false,
        placeholder: "https://guestflow.adn-dev.fr",
      },
      { key: "guestflow_api_key", label: "GuestFlow gate API key", type: "password", required: false },
      {
        key: "guestflow_signing_secret",
        label: "GuestFlow signing secret",
        type: "password",
        required: false,
      },
      {
        key: "guestflow_poll_seconds",
        label: "How often to read guestFlow (s)",
        type: "number",
        required: false,
        defaultValue: String(DEFAULT_POLL_SECONDS),
      },
    ];
  }

  async start(): Promise<void> {
    this.gate.start();
    this.started = true;
    this.connector.start(this.connectorConfig());
    this.service.publishSummary();

    this.purgeTimer = setInterval(() => {
      const purged = this.service.purge();
      if (purged.codes || purged.journal) {
        this.deps.logger.info(purged, "Guest access housekeeping");
      }
    }, PURGE_EVERY_MS);
    this.purgeTimer.unref?.();
    this.service.purge();

    if (this.deps.settingsManager.get(PUBLIC_FLAG_KEY) !== "true") {
      // Worth a line at start: everything else works, and the guests' page is
      // the one thing that will answer 404 until somebody opens the door.
      this.deps.logger.warn(
        {},
        "Guest access is running, but its public page is shut — open it in Plugins → Accès invités",
      );
    }
    this.deps.eventBus.emit({
      type: "system.integration.connected",
      integrationId: INTEGRATION_ID,
    });
    this.deps.logger.info({}, "Guest access started");
  }

  async stop(): Promise<void> {
    this.connector.stop();
    this.gate.stop();
    if (this.purgeTimer) clearInterval(this.purgeTimer);
    this.purgeTimer = null;
    this.started = false;
    this.deps.eventBus.emit({
      type: "system.integration.disconnected",
      integrationId: INTEGRATION_ID,
    });
    this.deps.logger.info({}, "Guest access stopped");
  }

  async refresh(): Promise<void> {
    await this.connector.syncNow();
  }

  // ── The recipe's two orders ────────────────────────────────

  async executeOrder(
    device: Device,
    orderKeyOrDispatchConfig: string | Record<string, unknown>,
    value: unknown,
  ): Promise<void> {
    if (device && device.sourceDeviceId && device.sourceDeviceId !== DEVICE_ID) {
      throw new Error(`Unknown device: ${device.sourceDeviceId}`);
    }
    const key = orderKeyOf(orderKeyOrDispatchConfig);
    const text = typeof value === "string" ? value : String(value ?? "");

    if (key === "result") {
      if (!OUTCOMES.includes(text as RecipeOutcome)) throw new Error(`Unknown outcome: ${text}`);
      this.gate.reportResult(text as RecipeOutcome);
      return;
    }
    if (key === "gate_state") {
      if (!GATE_STATES.includes(text as GateState)) throw new Error(`Unknown gate state: ${text}`);
      this.gate.setGateState(text as GateState);
      return;
    }
    throw new Error(`Unsupported order: ${key || "(none)"}`);
  }

  // ── The two HTTP surfaces (core spec 180) ──────────────────

  async handlePageRequest(request: PluginHttpRequest): Promise<PluginHttpResponse> {
    return this.admin(request);
  }

  async handlePublicRequest(request: PluginHttpRequest): Promise<PluginHttpResponse> {
    return this.guest(request);
  }

  // ── Settings ───────────────────────────────────────────────

  private setting(key: string): string | undefined {
    const raw = this.deps.settingsManager.get(`${SETTINGS_PREFIX}${key}`);
    return raw && raw.trim() ? raw.trim() : undefined;
  }

  private guestBaseUrl(): string | null {
    const raw = this.setting("guest_base_url");
    if (!raw) return null;
    return isAcceptableUrl(raw) ? raw.replace(/\/+$/, "") : null;
  }

  /** All three, or no connector: a half-configured channel is not a channel. */
  private connectorConfig(): ConnectorConfig | null {
    const baseUrl = this.setting("guestflow_base_url");
    const apiKey = this.setting("guestflow_api_key");
    const signingSecret = this.setting("guestflow_signing_secret");
    if (!baseUrl || !apiKey || !signingSecret) return null;
    const pollSeconds = Number(this.setting("guestflow_poll_seconds") ?? DEFAULT_POLL_SECONDS);
    return {
      baseUrl,
      apiKey,
      signingSecret,
      pollSeconds: Number.isFinite(pollSeconds) ? pollSeconds : DEFAULT_POLL_SECONDS,
      guestBaseUrl: this.guestBaseUrl(),
    };
  }
}

export function createPlugin(deps: PluginDeps): GuestAccessPlugin {
  return new GuestAccessPlugin(deps);
}
