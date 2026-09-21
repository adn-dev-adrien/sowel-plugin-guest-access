// ============================================================
// The device the recipe binds to, and what happens when a guest presses
//
// The plugin still does not touch the gate. It publishes a counter; the recipe
// (`sowel-recipe-guest-gate`) decides whether to pulse, and answers through an
// order on this same device. That separation is the reason the recipe exists:
// a recipe cannot restrict anything — it runs after — but it can be the only
// thing holding the trigger, and it gives the owner a switch that does not
// involve opening this page.
//
// What changed with the move: the request no longer arrives from guestFlow over
// a long poll. It arrives from the guest's own phone, on Sowel's public tree,
// and this file is what turns it into the counter the recipe watches — then
// waits, briefly, for the recipe's answer so the phone can be told.
// ============================================================

import type { RefusalReason } from "./model.js";

export interface Logger {
  info(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface DeviceManagerLike {
  upsertFromDiscovery(integrationId: string, source: string, discovered: unknown): void;
  updateDeviceData(
    integrationId: string,
    sourceDeviceId: string,
    payload: Record<string, unknown>,
  ): void;
  updateDeviceStatus(integrationId: string, sourceDeviceId: string, status: string): void;
}

export type GateState = "open" | "closed" | "unknown";
export type RecipeOutcome = "opened" | "already_open" | "refused" | "error";
export type PressOutcome = "opened" | RefusalReason;

/**
 * The device's identity in Sowel.
 *
 * The core keys a discovered device by its `friendlyName` — that string becomes
 * `source_device_id` — and finds it again by that exact string on every data
 * update, status change and order (`DeviceManager.upsertFromDiscovery`, then
 * `findDeviceBySource`). A lookup that misses is not an error anywhere: the
 * core returns early and the plugin is none the wiser.
 *
 * v0.3 declared « Accès invités » and published under `guest-access`, so none
 * of its updates matched a device: the counter never moved, no recipe was ever
 * triggered, and the recipe's `result` came back « Unknown device ». Declaring
 * the name as the id is what keeps the two in step — and it keeps the device
 * row an earlier install created, with every equipment bound to it.
 */
export const DEVICE_ID = "Accès invités";
export const REQUESTS_KEY = "requests";
/** An equipment name, not a paragraph — and it ends up in a page title. */
export const OPENING_LABEL_MAX = 60;

/** How long the phone waits for the house to answer before being told nothing came. */
const DEFAULT_ANSWER_MS = 10_000;
/** One fat-fingered tap, not two intentions (a guest may deliberately press twice). */
const DOUBLE_TAP_MS = 2_000;
/** Presses queued behind the one in flight. Beyond this, the phone is told to wait. */
const MAX_QUEUE = 3;

/**
 * The device, unchanged from v0.3 on purpose.
 *
 * The recipe binds to `requests`, `result` and `gate_state`, and an installation
 * that already did must keep working after this update — a rebinding in front of
 * a gate at 23 h is not an upgrade path. The two new readings are additive, and
 * an equipment that never rebinds simply does not show them.
 */
export function describeDevice(): Record<string, unknown> {
  return {
    friendlyName: DEVICE_ID,
    manufacturer: "Sowel",
    model: "Guest gate access",
    data: [
      // A monotonic counter, and deliberately so: `equipment.data.changed`
      // re-fires with unchanged values, so a boolean or a timestamp would make
      // the recipe's trigger guess. A counter never repeats a value.
      { key: REQUESTS_KEY, type: "number", category: "generic" },
      { key: "last_request_at", type: "text", category: "generic" },
      { key: "last_stay", type: "text", category: "generic" },
      // Kept under its old name: the link to guestFlow. It reads false when no
      // connector is configured, which is honest — there is no link.
      { key: "link", type: "boolean", category: "generic" },
      { key: "active_accesses", type: "number", category: "generic" },
      { key: "last_result", type: "text", category: "generic" },
    ],
    orders: [
      {
        key: "result",
        type: "enum",
        category: "generic",
        enumValues: ["opened", "already_open", "refused", "error"],
      },
      {
        key: "gate_state",
        type: "enum",
        category: "generic",
        enumValues: ["open", "closed", "unknown"],
      },
      // What opens, by the name its owner gave the equipment. Additive: an
      // equipment bound before this order existed simply never receives it,
      // and the page keeps its neutral word.
      { key: "opening_label", type: "text", category: "generic" },
    ],
  };
}

interface PressContext {
  accessId: string;
  label: string;
  stay: string;
}

interface InFlight {
  accessId: string;
  startedAt: number;
  settle: (outcome: PressOutcome) => void;
  promise: Promise<PressOutcome>;
  timer: NodeJS.Timeout;
}

export interface GateOptions {
  integrationId: string;
  deviceManager: DeviceManagerLike;
  logger: Logger;
  answerMs?: number;
}

export class Gate {
  private readonly opts: GateOptions;
  private readonly answerMs: number;
  private requestCount = 0;
  private inFlight: InFlight | null = null;
  private queue = 0;
  private gateState: GateState = "unknown";
  private openingLabel: string | null = null;
  private lastResult: string | null = null;
  private started = false;

  constructor(options: GateOptions) {
    this.opts = options;
    this.answerMs = options.answerMs ?? DEFAULT_ANSWER_MS;
  }

  start(): void {
    this.started = true;
    this.opts.deviceManager.upsertFromDiscovery(
      this.opts.integrationId,
      this.opts.integrationId,
      describeDevice(),
    );
    // The service is up the moment the plugin starts: unlike v0.3, nothing has
    // to be reached for a guest to be served. What may be missing is the link
    // to guestFlow, which is its own reading.
    this.opts.deviceManager.updateDeviceStatus(this.opts.integrationId, DEVICE_ID, "online");

    // The counter at rest, published before anyone can press.
    //
    // The recipe takes the counter as it stands for its starting point and only
    // fires on a value ABOVE it, so that a restart never opens the gate. On an
    // installation where the counter has never been published the reading is
    // null, that starting point is the guest's first press — and the first
    // guest ever to use a new installation is told the house did not answer,
    // standing at the gate.
    //
    // Publishing the resting value is also what re-bases the recipe after a
    // Sowel restart, when this counter starts from zero again: whichever of the
    // two reads the other first, both end up on the same number.
    this.publish({ [REQUESTS_KEY]: this.requestCount });
  }

  stop(): void {
    this.started = false;
    if (this.inFlight) this.settle("gate_error");
    this.opts.deviceManager.updateDeviceStatus(this.opts.integrationId, DEVICE_ID, "offline");
  }

  isStarted(): boolean {
    return this.started;
  }

  /** The gate contact, pushed down by the recipe. Shown to the owner only. */
  setGateState(state: GateState): void {
    this.gateState = state;
    this.publish({ /* nothing device-side; the owner reads it from the page */ });
  }

  getGateState(): GateState {
    return this.gateState;
  }

  /**
   * The name of what opens — « Portail », « Porte du garage » — pushed down by
   * the recipe, which is the only one that knows which equipment it drives.
   *
   * Not a setting: an owner who renames the equipment would otherwise have to
   * rename it twice, and the second place is the one nobody remembers. The
   * plugin still learns nothing about equipments; it is handed a string.
   */
  setOpeningLabel(raw: string): void {
    const label = raw.replace(/\s+/g, " ").trim().slice(0, OPENING_LABEL_MAX);
    this.openingLabel = label || null;
  }

  /** Null until the recipe has said — the page then falls back to a neutral word. */
  getOpeningLabel(): string | null {
    return this.openingLabel;
  }

  publishSummary(summary: { activeAccesses: number; guestflowLinked: boolean }): void {
    this.publish({
      active_accesses: summary.activeAccesses,
      link: summary.guestflowLinked,
    });
  }

  /**
   * The recipe answering.
   *
   * It can only belong to the press in flight — one goes out at a time. An
   * answer with nothing in flight is dropped with a warning rather than guessed
   * at: resolving the wrong press would tell a guest their gate opened when it
   * did not.
   */
  reportResult(outcome: RecipeOutcome): void {
    this.lastResult = outcome;
    if (!this.inFlight) {
      this.opts.logger.warn({ outcome }, "Outcome reported with no press in flight — ignored");
      return;
    }
    this.settle(
      outcome === "opened" || outcome === "already_open"
        ? "opened"
        : outcome === "refused"
          ? "refused_by_house"
          : "gate_error",
    );
  }

  /**
   * A guest pressed.
   *
   * Two presses from the same access within two seconds are the same press —
   * a thumb that slipped, or a request the phone retried. Two seconds and not
   * ten, because a guest is allowed to close the gate behind them and that is
   * a second, deliberate press.
   */
  async press(context: PressContext): Promise<PressOutcome> {
    if (
      this.inFlight &&
      this.inFlight.accessId === context.accessId &&
      Date.now() - this.inFlight.startedAt < DOUBLE_TAP_MS
    ) {
      return this.inFlight.promise;
    }

    if (this.queue >= MAX_QUEUE) return "gate_busy";

    this.queue++;
    try {
      while (this.inFlight) await this.inFlight.promise;
      return await this.dispatch(context);
    } finally {
      this.queue--;
    }
  }

  private dispatch(context: PressContext): Promise<PressOutcome> {
    this.requestCount += 1;
    let settle!: (outcome: PressOutcome) => void;
    const promise = new Promise<PressOutcome>((resolve) => {
      settle = resolve;
    });
    const timer = setTimeout(() => {
      this.opts.logger.error(
        { accessId: context.accessId },
        "No recipe answered the guest's press — is the recipe bound to this device?",
      );
      this.settle("no_answer");
    }, this.answerMs);
    // Node keeps the process alive for a pending timer; this one must not.
    timer.unref?.();

    this.inFlight = { accessId: context.accessId, startedAt: Date.now(), settle, promise, timer };

    // Published last, because this is the trigger: everything the recipe reads
    // must be in place before the counter moves.
    this.publish({
      last_request_at: new Date().toISOString(),
      last_stay: context.stay || context.label,
      [REQUESTS_KEY]: this.requestCount,
    });
    this.opts.logger.info(
      { accessId: context.accessId, stay: context.stay },
      "Guest asked for the gate",
    );

    return promise;
  }

  private settle(outcome: PressOutcome): void {
    const current = this.inFlight;
    if (!current) return;
    clearTimeout(current.timer);
    this.inFlight = null;
    this.publish({ last_result: outcome });
    current.settle(outcome);
  }

  private publish(payload: Record<string, unknown>): void {
    if (!Object.keys(payload).length) return;
    this.opts.deviceManager.updateDeviceData(this.opts.integrationId, DEVICE_ID, payload);
  }

  /** For the owner's page: what the house last said. */
  getLastResult(): string | null {
    return this.lastResult;
  }
}
