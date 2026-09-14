// ============================================================
// Guest Access — the long-poll that brings guest requests home
//
// GuestFlow holds the guests, their stay windows and their codes; it holds no
// credential over this house, and it opens no connection towards it. So the
// house comes and asks: this poller keeps one HTTP request open for ~25 s at a
// time, and GuestFlow answers the instant a guest presses their button.
//
// Everything about the shape follows from that inversion:
//
//   • the request carries the state of the gate contact (`?state=`), because
//     GuestFlow cannot see it and needs it to label the guest's button. The
//     same call is the HEARTBEAT: no poll for a minute and GuestFlow greys the
//     button out rather than letting a guest press into the void;
//   • one request is served at a time, and it is the recipe that decides what
//     to do with it — this plugin never touches the gate;
//   • the outcome travels back through an ORDER on our own device, which the
//     recipe sends when it is done. That is the only way a recipe can speak to
//     an integration, and it is enough.
//
// Nothing is persisted. On a restart the poller reconnects and GuestFlow's table
// is still the source of truth; a request that was in flight times out there
// and the guest is told.
// ============================================================

import { verifyRequest, signResult, SeenRequests } from "./gate-signature.js";

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

/** What GuestFlow hands over, one at a time (its spec §4.3), signed (§4.4). */
export interface GateRequest {
  id: number;
  reservationId: number | null;
  reservationNumber: string | null;
  propertyName: string | null;
  requestedAt: string | null;
  signedAt?: unknown;
  signature?: unknown;
}

export type GateState = "open" | "closed" | "unknown";
export type RequestOutcome = "opened" | "already_open" | "refused" | "error";

export const DEVICE_ID = "guest-access";
export const REQUESTS_KEY = "requests";

/** The device the recipe binds to. One per instance — there is one gate. */
export function describeDevice(): Record<string, unknown> {
  return {
    friendlyName: "Accès invités",
    manufacturer: "GuestFlow",
    model: "Guest gate access",
    data: [
      // A monotonic counter, and that is deliberate: `equipment.data.changed`
      // re-fires with unchanged values, so a boolean or a timestamp would make
      // the recipe's trigger guess. A counter never repeats a value.
      { key: REQUESTS_KEY, type: "number", category: "generic" },
      { key: "last_request_at", type: "text", category: "generic" },
      { key: "last_stay", type: "text", category: "generic" },
      { key: "link", type: "boolean", category: "generic" },
    ],
    orders: [
      // What the recipe answers when it has acted. `already_open` is kept in the
      // vocabulary even though nothing sends it today — GuestFlow accepts it,
      // and a future recipe may want to say it.
      {
        key: "result",
        type: "enum",
        category: "generic",
        enumValues: ["opened", "already_open", "refused", "error"],
      },
      // The gate contact, pushed by the recipe (a plugin cannot read another
      // integration's device). GuestFlow uses it to label the guest's button.
      {
        key: "gate_state",
        type: "enum",
        category: "generic",
        enumValues: ["open", "closed", "unknown"],
      },
    ],
  };
}

interface PollerOptions {
  integrationId: string;
  baseUrl: string;
  apiKey: string;
  /** The second factor — never sent, only used to sign and verify (§4.4). */
  signingSecret: string;
  waitSeconds: number;
  deviceManager: DeviceManager;
  eventBus: EventBus;
  logger: Logger;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests, so a failure backoff does not really sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/**
 * The floor between two polls.
 *
 * In the normal case the loop is paced by the server: it holds the connection for
 * `wait` seconds and this is never reached. The floor exists for the case where
 * something answers INSTANTLY — a reverse proxy that does not support a held
 * connection, a `wait` misread as 0, a middlebox closing idle sockets — where the
 * loop would otherwise hammer GuestFlow as fast as the network allows. Found by a
 * test whose fake answered immediately and ate four gigabytes.
 */
const MIN_POLL_INTERVAL_MS = 1_000;

export class GatePoller {
  private readonly opts: Required<
    Pick<PollerOptions, "integrationId" | "baseUrl" | "apiKey" | "signingSecret" | "waitSeconds">
  > &
    PollerOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  private running = false;
  private loop: Promise<void> | null = null;
  private abort: AbortController | null = null;

  /** The request handed to Sowel and not yet answered. */
  private inFlight: GateRequest | null = null;
  /** What the recipe last told us about the contact. */
  private gateState: GateState = "unknown";
  private requestCount = 0;
  /** Ids already honoured: a replayed answer must not pulse the gate a second time. */
  private readonly seen = new SeenRequests();
  private retryMs = RETRY_MIN_MS;
  /** `null` until the first assertion: a device must be declared available or not,
   *  and a poller that never manages to connect must still say so (spec 116). */
  private connected: boolean | null = null;

  constructor(options: PollerOptions) {
    this.opts = options as GatePoller["opts"];
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  }

  isConnected(): boolean {
    return this.connected === true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.opts.deviceManager.upsertFromDiscovery(
      this.opts.integrationId,
      this.opts.integrationId,
      describeDevice(),
    );
    // Declared offline up front, on purpose: until a poll has come back, this
    // house has NOT been in touch with GuestFlow, and the UI should say that
    // rather than show a device of unknown availability.
    this.markLink(false);
    this.loop = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort?.abort();
    this.abort = null;
    try {
      await this.loop;
    } catch {
      /* the loop never rethrows; this is belt and braces */
    }
    this.loop = null;
    this.markLink(false);
  }

  /** The recipe pushing the gate contact down to us. */
  setGateState(state: GateState): void {
    this.gateState = state;
  }

  /**
   * The recipe answering. The id is ours to remember: GuestFlow serves one
   * request at a time, so the outcome can only belong to the one in flight.
   * An answer with nothing in flight is dropped with a warning rather than
   * guessed at — resolving the wrong request would tell a guest their gate
   * opened when it did not.
   */
  async report(outcome: RequestOutcome, detail?: string): Promise<void> {
    const request = this.inFlight;
    if (!request) {
      this.opts.logger.warn({ outcome }, "Outcome reported with no request in flight — ignored");
      return;
    }
    this.inFlight = null;
    const response = await this.fetchImpl(
      `${this.base()}/requests/${encodeURIComponent(String(request.id))}/result`,
      {
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/json",
          // The second factor, the other way round: GuestFlow refuses an outcome it
          // cannot attribute to this house (§4.4).
          ...signResult(request.id, outcome, this.opts.signingSecret),
        },
        body: JSON.stringify(detail ? { status: outcome, detail } : { status: outcome }),
      },
    );
    if (!response.ok) {
      this.opts.logger.error(
        { status: response.status, requestId: request.id, outcome },
        "GuestFlow refused the outcome",
      );
      return;
    }
    this.opts.logger.info({ requestId: request.id, outcome }, "Outcome reported to GuestFlow");
  }

  private base(): string {
    return `${this.opts.baseUrl.replace(/\/+$/, "")}/public/v1/gate`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.opts.apiKey}` };
  }

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
    // No integration event for the initial "not yet in touch" assertion — it is a
    // starting point, not a disconnection, and the UI would flash an error.
    if (!first || up) {
      this.opts.eventBus.emit({
        type: up ? "system.integration.connected" : "system.integration.disconnected",
        integrationId: this.opts.integrationId,
      });
    }
  }

  /** One poll. Returns false when the loop should back off before trying again. */
  private async pollOnce(): Promise<boolean> {
    const url = `${this.base()}/requests?wait=${this.opts.waitSeconds}&state=${this.gateState}`;
    this.abort = new AbortController();
    // The server closes its side at `wait`; this only catches a connection that
    // hangs without answering at all.
    const guard = setTimeout(() => this.abort?.abort(), (this.opts.waitSeconds + 10) * 1000);

    try {
      const response = await this.fetchImpl(url, {
        headers: this.authHeaders(),
        signal: this.abort.signal,
      });
      if (!response.ok) {
        this.opts.logger.error({ status: response.status }, "GuestFlow refused the poll");
        this.markLink(false);
        return false;
      }

      const body = (await response.json()) as { request?: GateRequest | null };
      this.markLink(true);
      this.retryMs = RETRY_MIN_MS;

      const request = body && body.request ? body.request : null;
      if (!request) return true; // the quiet answer, and the common one

      // Before ANYTHING is published — the counter is what makes the recipe pulse the
      // gate, so an answer that cannot be attributed to GuestFlow must never reach it.
      const check = verifyRequest(request, this.opts.signingSecret);
      if (!check.ok) {
        this.opts.logger.error(
          { requestId: request.id, reason: check.reason },
          "Refused a gate request that could not be verified — nothing was published",
        );
        return true;
      }
      if (this.seen.has(request.id)) {
        this.opts.logger.warn(
          { requestId: request.id },
          "Refused a gate request already honoured — replay",
        );
        return true;
      }
      this.seen.remember(request.id);

      this.inFlight = request;
      this.requestCount += 1;
      const stay = [request.propertyName, request.reservationNumber].filter(Boolean).join(" · ");
      this.publish({
        [REQUESTS_KEY]: this.requestCount,
        last_request_at: request.requestedAt ?? new Date().toISOString(),
        last_stay: stay || "séjour inconnu",
      });
      this.opts.logger.info(
        { requestId: request.id, stay },
        "Gate request received from a guest",
      );
      return true;
    } catch (err: unknown) {
      // An abort during stop() is not a failure.
      if (!this.running) return true;
      this.opts.logger.error({ err } as Record<string, unknown>, "Poll failed");
      this.markLink(false);
      return false;
    } finally {
      clearTimeout(guard);
      this.abort = null;
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      const startedAt = Date.now();
      const ok = await this.pollOnce();
      if (!this.running) break;

      if (!ok) {
        await this.sleep(this.retryMs);
        // Backoff, capped: a guestFlow that is down for an hour must not be
        // hammered, and must be picked up within a minute of coming back.
        this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
        continue;
      }

      // A poll that came back instantly means the connection was not held. Pace
      // it, or one misconfigured proxy turns this into a denial of service
      // against the app that holds the bookings.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_POLL_INTERVAL_MS) await this.sleep(MIN_POLL_INTERVAL_MS - elapsed);
    }
  }
}
