// ============================================================
// Guest Access — the channel the house holds open to Portier
// (specs/portier-channel.md; Portier's specs/contract.md §6 prevails)
//
// Portier holds the accesses and decides who may open; it opens no connection
// towards this house. So the house opens ONE WebSocket to Portier, proves itself
// by answering a challenge with the house key — the key never travels — and
// keeps it open. Portier pushes each command down it the instant a guest slides;
// the recipe's outcome and the gate contact go back up the same way.
//
// What follows from that:
//
//   • every frame is signed and bound to its connection by the challenge nonce,
//     with a sequence number per direction. A bad signature, a gap or a repeat
//     closes the channel with 4400: nothing unverified reaches the recipe;
//   • the house keeps its own brakes, whatever Portier says: a deadline read in
//     Portier's clock (a pulse past it never reaches the recipe), one command in
//     flight at a time, and a ceiling of 30 pulses in a rolling hour;
//   • nothing is buffered. A pulse that could not be handed over is lost, and
//     the guest has already read « maison injoignable »: the gate must never
//     move minutes after they gave up;
//   • the plugin never touches the gate. It bumps a counter; the recipe decides
//     and answers through an order on this plugin's device.
// ============================================================

import { buildFrame, signAuth, verifyFrame } from "./frame-signature.js";
import type { SignedFrame } from "./frame-signature.js";

export interface Logger {
  info(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface DeviceManager {
  upsertFromDiscovery(integrationId: string, source: string, discovered: unknown): void;
  updateDeviceData(
    integrationId: string,
    sourceDeviceId: string,
    payload: Record<string, unknown>,
  ): void;
  updateDeviceStatus(integrationId: string, sourceDeviceId: string, status: string): void;
}

export interface EventBus {
  emit(event: Record<string, unknown>): void;
}

export type GateState = "open" | "closed" | "unknown";
export type CommandStatus = "opened" | "refused" | "error";

export const GATE_STATES: readonly GateState[] = ["open", "closed", "unknown"];
export const COMMAND_STATUSES: readonly CommandStatus[] = ["opened", "refused", "error"];

/**
 * The device's identity in Sowel. The core keys a discovered device by its `friendlyName` — it
 * becomes `source_device_id` — and finds it again by that exact string on every data update,
 * status change and order. v0.3 declared « Accès invités » but published under `guest-access`,
 * so its updates matched no device. Using the declared name as the id keeps the device row an
 * installed v0.3 created, and every equipment bound to it.
 */
export const DEVICE_ID = "Accès invités";
export const REQUESTS_KEY = "requests";

/** The device the recipe binds to. One per instance — there is one gate. */
export function describeDevice(): Record<string, unknown> {
  return {
    friendlyName: DEVICE_ID,
    manufacturer: "Portier",
    model: "Guest gate access",
    data: [
      // A monotonic counter, and that is deliberate: `equipment.data.changed` re-fires with
      // unchanged values, so a boolean or a timestamp would make the recipe's trigger guess.
      { key: REQUESTS_KEY, type: "number", category: "generic" },
      { key: "last_request_at", type: "text", category: "generic" },
      { key: "last_stay", type: "text", category: "generic" },
      { key: "link", type: "boolean", category: "generic" },
    ],
    orders: [
      // What the recipe answers when it has acted, sent back to Portier as a `result` frame.
      { key: "result", type: "enum", category: "generic", enumValues: [...COMMAND_STATUSES] },
      // The gate contact, pushed by the recipe (a plugin cannot read another integration's
      // device). Portier shows it in the owner's list; it never reaches a guest.
      { key: "gate_state", type: "enum", category: "generic", enumValues: [...GATE_STATES] },
    ],
  };
}

/**
 * The part of a WebSocket this channel uses — the browser-style API of Node's built-in client
 * (Node 22 and later), so a test can hand in a fake without any network.
 */
export interface ChannelSocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string) => ChannelSocket;

/** Delays between attempts; the last one repeats. */
export const BACKOFF_SECONDS: readonly number[] = [1, 2, 5, 10, 30, 60];
/** A connection that held this long starts the back-off sequence again. */
export const HOLD_RESETS_BACKOFF_MS = 60_000;
/** Challenge and frame timestamps are accepted within this distance (contract §1). */
export const CLOCK_TOLERANCE_MS = 120_000;
export const PONG_TIMEOUT_MS = 10_000;
/**
 * Not in the contract: a socket that opens but never completes the handshake (a proxy that
 * accepts and forwards nothing) would otherwise hold the channel down forever without a retry.
 * Portier itself closes after 5 s without a valid auth, so a live one is far inside this.
 */
export const HANDSHAKE_TIMEOUT_MS = 15_000;
export const CEILING_PER_HOUR = 30;
const HOUR_MS = 3_600_000;

export const CLOSE_NORMAL = 1000;
/** Never sent: what a close without a code is recorded as. */
const CLOSE_ABNORMAL = 1006;
export const CLOSE_BAD_FRAME = 4400;
export const CLOSE_KEY_REFUSED = 4401;
export const CLOSE_REPLACED = 4409;

/** Logged on a 4401, word for word (spec §3.1). */
export const KEY_REFUSED_MESSAGE = "clé de la maison refusée par Portier";

export interface ChannelOptions {
  integrationId: string;
  /** Checked by the URL guard before the channel is built. */
  url: string;
  /** The decoded 32 bytes. */
  houseKey: Buffer;
  /** 1 to 30, checked by the plugin before the channel is built. */
  pingMinutes: number;
  pluginVersion: string;
  deviceManager: DeviceManager;
  eventBus: EventBus;
  logger: Logger;
  /** The counter's last value, so it keeps counting up across a restart. */
  initialRequestCount?: number;
  /** Called with the new counter value before it is published. */
  onRequestCount?: (count: number) => void;
  /** Injected in tests. Defaults to Node's built-in WebSocket. */
  socketFactory?: SocketFactory;
}

type Phase = "idle" | "connecting" | "authenticating" | "ready";
type Timer = ReturnType<typeof setTimeout>;

interface InFlight {
  commandId: string;
  /** In Portier's clock. */
  deadline: number;
}

function nativeSocketFactory(url: string): ChannelSocket {
  const Native = (globalThis as { WebSocket?: new (url: string) => unknown }).WebSocket;
  if (typeof Native !== "function") {
    throw new Error("this Node.js has no built-in WebSocket (Node 22 or later is required)");
  }
  return new Native(url) as ChannelSocket;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function cancel(timer: Timer | null): null {
  if (timer) clearTimeout(timer);
  return null;
}

export class PortierChannel {
  private readonly opts: ChannelOptions;
  private readonly factory: SocketFactory;

  private running = false;
  private socket: ChannelSocket | null = null;
  private phase: Phase = "idle";
  /** The challenge nonce: inside every frame signature of this connection. */
  private nonce = "";
  /** Portier's clock minus this house's, measured at the challenge. */
  private offsetMs = 0;
  private sentSeq = 0;
  private receivedSeq = 0;
  private readyAt: number | null = null;
  private backoffIndex = 0;
  private keyRefused = false;

  private reconnectTimer: Timer | null = null;
  private handshakeTimer: Timer | null = null;
  private pingTimer: Timer | null = null;
  private pongTimer: Timer | null = null;

  /** The pulse handed to the recipe and not yet answered. */
  private inFlight: InFlight | null = null;
  /** When the pulses of the last hour were handed to the recipe (house clock). */
  private acceptedAt: number[] = [];
  private requestCount: number;
  /** What the recipe last said about the contact. */
  private gateState: { state: GateState; at: string } | null = null;
  /** `null` until the first assertion: a device must be declared available or not (spec 116). */
  private connected: boolean | null = null;

  constructor(options: ChannelOptions) {
    this.opts = options;
    this.factory = options.socketFactory ?? nativeSocketFactory;
    const initial = Number(options.initialRequestCount ?? 0);
    this.requestCount = Number.isFinite(initial) && initial > 0 ? Math.floor(initial) : 0;
  }

  /** True only between `ready` and the close. */
  isConnected(): boolean {
    return this.phase === "ready";
  }

  /** True from a 4401 close until the next `ready`. */
  isKeyRefused(): boolean {
    return this.keyRefused;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.opts.deviceManager.upsertFromDiscovery(
      this.opts.integrationId,
      this.opts.integrationId,
      describeDevice(),
    );
    // Declared down up front, on purpose: until `ready`, this house is NOT in touch with Portier.
    this.markLink(false);
    this.connect();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.reconnectTimer = cancel(this.reconnectTimer);
    this.closeLocally(CLOSE_NORMAL, "plugin stopped");
  }

  /**
   * The recipe's outcome, for the command in flight. Portier sends one pulse at a time, so the
   * outcome can only belong to that one. An outcome with nothing in flight is dropped with a
   * warning rather than guessed at: resolving the wrong command would tell a guest their gate
   * opened when it did not.
   */
  report(status: CommandStatus): void {
    const command = this.inFlight;
    if (!command) {
      this.opts.logger.warn({ status }, "Outcome reported with no command in flight — ignored");
      return;
    }
    this.inFlight = null;
    const sent = this.sendFrame("result", { commandId: command.commandId, status, detail: "" });
    if (!sent) {
      this.opts.logger.warn(
        { commandId: command.commandId, status },
        "Channel to Portier is closed — the outcome is lost",
      );
      return;
    }
    this.opts.logger.info({ commandId: command.commandId, status }, "Outcome sent to Portier");
  }

  /**
   * The recipe pushing the gate contact. It goes up at once when the channel is ready. The latest
   * one is also sent again after each `ready`: it is a state, not a command, and the recipe only
   * pushes on a change — without it the owner's list would be blind after every reconnect.
   */
  setGateState(state: GateState): void {
    this.gateState = { state, at: new Date().toISOString() };
    this.sendGateState();
  }

  // ------------------------------------------------------------------
  // Connection
  // ------------------------------------------------------------------

  private connect(): void {
    this.reconnectTimer = null;
    if (!this.running) return;

    let socket: ChannelSocket;
    try {
      socket = this.factory(this.opts.url);
    } catch (err: unknown) {
      this.opts.logger.error({ err: errorMessage(err) }, "Could not open the channel to Portier");
      this.afterClose(CLOSE_ABNORMAL);
      return;
    }

    this.socket = socket;
    this.phase = "connecting";
    socket.onopen = () => {
      if (this.socket === socket) {
        this.opts.logger.debug({}, "Socket to Portier open — waiting for the challenge");
      }
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.onMessage(event?.data);
    };
    socket.onerror = () => {
      /* the close event follows, and it carries what matters */
    };
    socket.onclose = (event) => {
      if (this.socket === socket) {
        this.onRemoteClose(Number(event?.code ?? CLOSE_ABNORMAL), String(event?.reason ?? ""));
      }
    };
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;
      this.opts.logger.warn(
        { timeoutMs: HANDSHAKE_TIMEOUT_MS },
        "Portier did not complete the handshake in time — closing",
      );
      this.closeLocally(CLOSE_NORMAL, "handshake timeout");
    }, HANDSHAKE_TIMEOUT_MS);
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return this.refuse("not a text frame");
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return this.refuse("not JSON");
    }
    if (!isRecord(message)) return this.refuse("not a JSON object");

    switch (this.phase) {
      case "connecting":
        return this.onChallenge(message);
      case "authenticating":
        return this.onReady(message);
      case "ready":
        return this.onFrame(message);
      default:
        return;
    }
  }

  private onChallenge(message: Record<string, unknown>): void {
    const { type, nonce, ts } = message;
    if (type !== "challenge" || typeof nonce !== "string" || !nonce || !isTimestamp(ts)) {
      return this.refuse("expected a challenge");
    }
    const now = Date.now();
    if (Math.abs(ts - now) > CLOCK_TOLERANCE_MS) {
      this.opts.logger.error(
        { skewMs: ts - now },
        "Challenge refused: Portier's clock is more than 2 minutes away from this house's",
      );
      return this.closeLocally(CLOSE_BAD_FRAME, "clock skew");
    }

    this.nonce = nonce;
    this.offsetMs = ts - now;
    this.phase = "authenticating";
    this.sendRaw({
      type: "auth",
      sig: signAuth(this.opts.houseKey, nonce, ts),
      pluginVersion: this.opts.pluginVersion,
      pingSeconds: this.opts.pingMinutes * 60,
    });
  }

  private onReady(message: Record<string, unknown>): void {
    if (message.type !== "ready") return this.refuse("expected ready");
    this.handshakeTimer = cancel(this.handshakeTimer);
    this.phase = "ready";
    this.readyAt = Date.now();
    this.keyRefused = false;
    this.opts.logger.info(
      { offsetMs: this.offsetMs, pingMinutes: this.opts.pingMinutes },
      "Channel to Portier authenticated",
    );
    this.markLink(true);
    this.schedulePing();
    this.sendGateState();
  }

  private onFrame(message: Record<string, unknown>): void {
    const { seq, ts, type, payload, sig } = message;
    if (
      !isTimestamp(seq) ||
      !isTimestamp(ts) ||
      typeof type !== "string" ||
      !isRecord(payload) ||
      typeof sig !== "string"
    ) {
      return this.refuse("malformed frame");
    }
    // Signature first: nothing of an unverified frame is interpreted, its sequence included.
    const frame: SignedFrame = { seq, ts, type, payload, sig };
    if (!verifyFrame(this.opts.houseKey, this.nonce, "p2h", frame)) return this.refuse("bad signature");
    if (seq <= this.receivedSeq) return this.refuse("repeated sequence number");
    if (seq !== this.receivedSeq + 1) return this.refuse("sequence gap");
    if (Math.abs(ts - this.portierNow()) > CLOCK_TOLERANCE_MS) return this.refuse("stale timestamp");
    this.receivedSeq = seq;

    switch (type) {
      case "pong":
        this.pongTimer = cancel(this.pongTimer);
        return;
      case "pulse":
        return this.onPulse(payload);
      default:
        this.opts.logger.warn({ type }, "Unknown frame type from Portier — ignored");
    }
  }

  // ------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------

  private onPulse(payload: Record<string, unknown>): void {
    const { commandId, accessLabel, deadline } = payload;
    if (typeof commandId !== "string" || !commandId) {
      this.opts.logger.error({}, "Pulse without a command id — ignored");
      return;
    }

    // 1. The deadline, in Portier's clock. Past it, the gate does not move.
    const portierNow = this.portierNow();
    if (typeof deadline !== "number" || !Number.isFinite(deadline) || portierNow > deadline) {
      this.opts.logger.warn(
        { commandId, lateMs: typeof deadline === "number" ? portierNow - deadline : null },
        "Pulse past its deadline — answered expired, nothing handed to the recipe",
      );
      this.sendFrame("result", { commandId, status: "error", detail: "expired" });
      return;
    }

    // 2. One command in flight at a time. A command whose own deadline has passed no longer
    //    holds the place: Portier has answered the guest `no_answer` and moved on, and a recipe
    //    that never answers must not refuse every guest after it.
    if (this.inFlight) {
      if (portierNow <= this.inFlight.deadline) {
        this.opts.logger.warn(
          { commandId, inFlight: this.inFlight.commandId },
          "Pulse while a command is in flight — answered busy",
        );
        this.sendFrame("result", { commandId, status: "error", detail: "busy" });
        return;
      }
      this.opts.logger.warn(
        { commandId: this.inFlight.commandId },
        "The recipe did not answer the previous command before its deadline — dropped",
      );
      this.inFlight = null;
    }

    // 3. The house's own ceiling, whatever Portier says. Only pulses handed to the recipe count.
    const now = Date.now();
    this.acceptedAt = this.acceptedAt.filter((at) => now - at < HOUR_MS);
    if (this.acceptedAt.length >= CEILING_PER_HOUR) {
      this.opts.logger.warn(
        { commandId, ceiling: CEILING_PER_HOUR },
        "House ceiling reached for the rolling hour — answered refused",
      );
      this.sendFrame("result", { commandId, status: "refused", detail: "ceiling" });
      return;
    }

    // 4. Handed to the recipe: the counter is its trigger.
    this.acceptedAt.push(now);
    this.inFlight = { commandId, deadline };
    this.requestCount += 1;
    const stay =
      typeof accessLabel === "string" && accessLabel.trim() ? accessLabel.trim() : "séjour inconnu";
    try {
      this.opts.onRequestCount?.(this.requestCount);
    } catch (err: unknown) {
      this.opts.logger.warn({ err: errorMessage(err) }, "Could not remember the request counter");
    }
    this.opts.logger.info({ commandId, stay }, "Gate command received from a guest");
    this.publish({
      [REQUESTS_KEY]: this.requestCount,
      last_request_at: new Date(now).toISOString(),
      last_stay: stay,
    });
  }

  private sendGateState(): void {
    if (!this.gateState || this.phase !== "ready") return;
    this.sendFrame("gate_state", { state: this.gateState.state, at: this.gateState.at });
  }

  // ------------------------------------------------------------------
  // Keep-alive
  // ------------------------------------------------------------------

  private schedulePing(): void {
    this.pingTimer = cancel(this.pingTimer);
    this.pingTimer = setTimeout(() => this.ping(), this.opts.pingMinutes * 60_000);
  }

  private ping(): void {
    this.pingTimer = null;
    if (this.phase !== "ready") return;
    // Armed before the write, so an answer can never arrive before its timer exists.
    this.pongTimer = cancel(this.pongTimer);
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      this.opts.logger.warn(
        { timeoutMs: PONG_TIMEOUT_MS },
        "No pong from Portier in time — closing and reconnecting",
      );
      this.closeLocally(CLOSE_NORMAL, "pong late");
    }, PONG_TIMEOUT_MS);
    if (!this.sendFrame("ping", {})) return;
    this.schedulePing();
  }

  // ------------------------------------------------------------------
  // Frames
  // ------------------------------------------------------------------

  private portierNow(): number {
    return Date.now() + this.offsetMs;
  }

  private sendFrame(type: string, payload: Record<string, unknown>): boolean {
    if (this.phase !== "ready" || !this.socket) return false;
    this.sentSeq += 1;
    return this.sendRaw(
      buildFrame(this.opts.houseKey, this.nonce, "h2p", this.sentSeq, Date.now(), type, payload),
    );
  }

  private sendRaw(message: object): boolean {
    const socket = this.socket;
    if (!socket) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (err: unknown) {
      this.opts.logger.error({ err: errorMessage(err) }, "Could not write to the channel — closing");
      this.closeLocally(CLOSE_NORMAL, "send failed");
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Closing and reconnecting
  // ------------------------------------------------------------------

  private refuse(reason: string): void {
    this.opts.logger.error(
      { reason, code: CLOSE_BAD_FRAME },
      "Refused a message from Portier — closing the channel",
    );
    this.closeLocally(CLOSE_BAD_FRAME, reason);
  }

  /**
   * A close the house decides. The socket is let go at once rather than awaited: after a silent
   * break the peer never finishes the closing handshake, and waiting for it is exactly the dead
   * time the pong timeout exists to cut.
   */
  private closeLocally(code: number, reason: string): void {
    const socket = this.detach();
    if (socket) {
      try {
        socket.close(code, reason);
      } catch {
        /* already closing */
      }
    }
    this.afterClose(code);
  }

  private onRemoteClose(code: number, reason: string): void {
    this.detach();
    if (code === CLOSE_KEY_REFUSED) {
      this.keyRefused = true;
      this.opts.logger.error({ code }, KEY_REFUSED_MESSAGE);
    } else if (code === CLOSE_REPLACED) {
      this.opts.logger.warn({ code }, "Portier replaced this channel with a newer connection");
    } else {
      this.opts.logger.warn({ code, reason }, "Channel to Portier closed");
    }
    this.afterClose(code);
  }

  private detach(): ChannelSocket | null {
    const socket = this.socket;
    this.socket = null;
    this.handshakeTimer = cancel(this.handshakeTimer);
    this.pingTimer = cancel(this.pingTimer);
    this.pongTimer = cancel(this.pongTimer);
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    return socket;
  }

  private afterClose(code: number): void {
    const heldMs = this.readyAt === null ? 0 : Date.now() - this.readyAt;
    this.phase = "idle";
    this.nonce = "";
    this.sentSeq = 0;
    this.receivedSeq = 0;
    this.readyAt = null;
    if (this.inFlight) {
      // Nothing is buffered: the command belonged to that connection.
      this.opts.logger.warn(
        { commandId: this.inFlight.commandId },
        "Channel closed with a command in flight — its outcome cannot be sent",
      );
      this.inFlight = null;
    }
    this.markLink(false);
    if (!this.running) return;

    let delaySeconds: number;
    if (code === CLOSE_KEY_REFUSED) {
      // A refused key does not fix itself in a second: straight to the longest delay.
      this.backoffIndex = BACKOFF_SECONDS.length - 1;
      delaySeconds = BACKOFF_SECONDS[this.backoffIndex];
    } else {
      if (heldMs >= HOLD_RESETS_BACKOFF_MS) this.backoffIndex = 0;
      delaySeconds = BACKOFF_SECONDS[this.backoffIndex];
      this.backoffIndex = Math.min(this.backoffIndex + 1, BACKOFF_SECONDS.length - 1);
    }
    this.opts.logger.info({ delaySeconds }, "Reconnecting to Portier");
    this.reconnectTimer = cancel(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delaySeconds * 1000);
  }

  // ------------------------------------------------------------------
  // Device
  // ------------------------------------------------------------------

  private publish(payload: Record<string, unknown>): void {
    this.opts.deviceManager.updateDeviceData(this.opts.integrationId, DEVICE_ID, payload);
  }

  private markLink(up: boolean): void {
    if (this.connected === up) return;
    const first = this.connected === null;
    this.connected = up;
    this.publish({ link: up });
    this.opts.deviceManager.updateDeviceStatus(
      this.opts.integrationId,
      DEVICE_ID,
      up ? "online" : "offline",
    );
    // No integration event for the initial « not yet in touch » assertion — it is a starting
    // point, not a disconnection, and the UI would flash an error.
    if (!first || up) {
      this.opts.eventBus.emit({
        type: up ? "system.integration.connected" : "system.integration.disconnected",
        integrationId: this.opts.integrationId,
      });
    }
  }
}
