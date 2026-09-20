// ============================================================
// The guestFlow connector — both ways, and always outbound
//
// guestFlow holds the reservations; this house holds the accesses. The
// connector is what keeps the two in step, and its shape follows one rule:
// **the house calls, the house is never called.** guestFlow is the machine
// exposed on the internet; it holds no credential over this house and opens no
// connection towards it, so a compromise of the booking application cannot
// command anything here.
//
// Two directions, one loop:
//
//   • PULL — a feed of stays, read from a cursor. Creations, date changes and
//     cancellations all arrive as revisions of the same reservation, so a
//     restart resumes where it left off and a replayed page changes nothing
//     (`service.applyStay` is idempotent on the revision).
//   • PUSH — the invitation of every stay access: the code, the link, the state.
//     guestFlow stores that copy and reads it when it composes the J-7 email,
//     shows the SAS QR or draws the fiche card. It therefore never has to reach
//     this house to know what to print — which is the whole reason the emails
//     no longer wait on anything.
//
// And when there is no guestFlow at all — no address configured, or the machine
// is down — everything else keeps working: the accesses are here, the page is
// here, the guests' phones talk to this house. That is the point of the move.
// ============================================================

import { createHash, createHmac } from "node:crypto";
import type { Access } from "./model.js";
import type { GuestAccessService, StayFeedItem } from "./service.js";
import { isAcceptableUrl } from "./url-guard.js";
import { effectiveWindow } from "./validity.js";

export interface ConnectorLogger {
  info(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface ConnectorConfig {
  baseUrl: string;
  apiKey: string;
  signingSecret: string;
  pollSeconds: number;
  guestBaseUrl: string | null;
}

export interface ConnectorState {
  configured: boolean;
  linked: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  cursor: number;
  pendingPushes: number;
}

interface StaysResponse {
  cursor?: unknown;
  hasMore?: unknown;
  stays?: unknown;
}

const MIN_POLL_SECONDS = 15;
const MAX_POLL_SECONDS = 3600;
const PAGE_LIMIT = 200;
/** Back-off while guestFlow is unreachable, so an outage is not hammered. */
const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 15 * 60_000;

/**
 * The signature both halves compute.
 *
 * The canonical string IS the contract — reordering a field here while
 * guestFlow keeps its own order means every call fails in production with both
 * unit suites still green, which is why the vectors are pinned on both sides.
 */
export function canonicalString(
  method: string,
  pathWithQuery: string,
  timestamp: number,
  body: string,
): string {
  return [
    method.toUpperCase(),
    pathWithQuery,
    String(timestamp),
    createHash("sha256").update(body, "utf8").digest("hex"),
  ].join("\n");
}

export function sign(canonical: string, secret: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export class GuestFlowConnector {
  private readonly service: GuestAccessService;
  private readonly logger: ConnectorLogger;
  private readonly fetchImpl: typeof fetch;
  private readonly readCursor: () => number;
  private readonly writeCursor: (cursor: number) => void;

  private config: ConnectorConfig | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private syncing = false;
  private inFlightSync: Promise<void> | null = null;
  private retryMs = RETRY_MIN_MS;
  private linked = false;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  /** Reservations whose invitation guestFlow has not acknowledged yet. */
  private dirty = new Set<number>();

  constructor(opts: {
    service: GuestAccessService;
    logger: ConnectorLogger;
    readCursor: () => number;
    writeCursor: (cursor: number) => void;
    fetchImpl?: typeof fetch;
  }) {
    this.service = opts.service;
    this.logger = opts.logger;
    this.readCursor = opts.readCursor;
    this.writeCursor = opts.writeCursor;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  state(): ConnectorState {
    return {
      configured: !!this.config,
      linked: this.linked,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      cursor: this.readCursor(),
      pendingPushes: this.dirty.size,
    };
  }

  /** Starting without a configuration is not an error: guestFlow is optional. */
  start(config: ConnectorConfig | null): void {
    this.config = config;
    this.running = true;
    this.linked = false;

    if (!config) {
      this.service.setGuestflowLinked(false);
      this.logger.info({}, "No guestFlow configured — guest access runs on its own");
      return;
    }
    if (!isAcceptableUrl(config.baseUrl)) {
      this.lastError = "insecure_url";
      this.logger.error(
        { baseUrl: config.baseUrl },
        "Refusing to reach guestFlow: it must be served over HTTPS (plain HTTP only towards localhost)",
      );
      this.config = null;
      return;
    }

    // Everything already here is pushed once at start: guestFlow may have been
    // reinstalled, restored from a backup, or simply never told.
    for (const access of this.service.list()) {
      if (access.source?.system === "guestflow") this.dirty.add(access.source.reservationId);
    }

    void this.syncNow();
    const every = Math.min(Math.max(config.pollSeconds, MIN_POLL_SECONDS), MAX_POLL_SECONDS);
    this.timer = setInterval(() => void this.syncNow(), every * 1000);
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.linked = false;
  }

  /** An access changed here, so guestFlow's copy is stale. */
  markDirty(access: Access | undefined): void {
    if (access?.source?.system === "guestflow") this.dirty.add(access.source.reservationId);
  }

  /**
   * One pull, then one push. Never two at a time.
   *
   * A caller arriving while a sync is in flight WAITS for it rather than being
   * handed the state as it was: the « Synchroniser » button on the owner's page
   * is pressed precisely when something has just changed, and answering with
   * the previous answer would look like the button did nothing.
   */
  async syncNow(): Promise<ConnectorState> {
    if (!this.config || !this.running) return this.state();
    if (this.inFlightSync) {
      await this.inFlightSync;
      return this.state();
    }
    this.inFlightSync = this.runSync();
    try {
      await this.inFlightSync;
    } finally {
      this.inFlightSync = null;
    }
    return this.state();
  }

  private async runSync(): Promise<void> {
    this.syncing = true;
    try {
      await this.pullStays();
      await this.pushInvitations();
      this.linked = true;
      this.lastError = null;
      this.lastSyncAt = new Date().toISOString();
      this.retryMs = RETRY_MIN_MS;
      this.service.setGuestflowLinked(true);
    } catch (err) {
      this.linked = false;
      this.lastError = err instanceof Error ? err.message : String(err);
      this.service.setGuestflowLinked(false);
      this.logger.warn({ err }, "guestFlow is not answering — retrying");
      this.scheduleRetry();
    } finally {
      this.syncing = false;
    }
  }

  // ── Pull ───────────────────────────────────────────────────

  private async pullStays(): Promise<void> {
    let cursor = this.readCursor();
    for (let page = 0; page < 20; page++) {
      const path = `/public/v1/gate/stays?since=${cursor}&limit=${PAGE_LIMIT}`;
      const body = (await this.call("GET", path)) as StaysResponse;
      const stays = Array.isArray(body.stays) ? (body.stays as StayFeedItem[]) : [];

      for (const stay of stays) {
        const result = this.service.applyStay(stay);
        if (result.access) this.dirty.add(stay.reservationId);
        if (typeof stay.revision === "number" && stay.revision > cursor) cursor = stay.revision;
      }

      if (typeof body.cursor === "number" && body.cursor > cursor) cursor = body.cursor;
      this.writeCursor(cursor);

      if (!stays.length || body.hasMore !== true) break;
    }
  }

  // ── Push ───────────────────────────────────────────────────

  private async pushInvitations(): Promise<void> {
    if (!this.dirty.size) return;
    const wanted = [...this.dirty];
    const invitations = wanted
      .map((reservationId) => this.invitationFor(reservationId))
      .filter((i): i is ReturnType<GuestFlowConnector["invitationFor"]> & object => i !== null);

    if (!invitations.length) {
      this.dirty.clear();
      return;
    }

    await this.call("POST", "/public/v1/gate/invitations", { invitations });
    // Cleared only once guestFlow has answered: a failed push must be retried,
    // or a guest's email goes out with a code that no longer opens anything.
    for (const reservationId of wanted) this.dirty.delete(reservationId);
    this.logger.info({ count: invitations.length }, "Invitations pushed to guestFlow");
  }

  private invitationFor(reservationId: number) {
    const access = this.service
      .list()
      .find((a) => a.source?.system === "guestflow" && a.source.reservationId === reservationId);
    if (!access) {
      // Deleted here on purpose: guestFlow must stop showing a code that opens
      // nothing, and its fiche then offers « recréer ».
      return { reservationId, state: "deleted" as const };
    }
    const invitation = this.service.invitation(access, this.config?.guestBaseUrl ?? null);
    const window = effectiveWindow(access);
    return {
      reservationId,
      accessId: access.id,
      state: stateOf(access),
      code: invitation.code || null,
      url: invitation.url,
      validFrom: window.from ? window.from.toISOString() : null,
      validUntil: window.to ? window.to.toISOString() : null,
      devices: access.devices.length,
      lastUsedAt: access.lastUsedAt,
      updatedAt: access.updatedAt,
    };
  }

  // ── The wire ───────────────────────────────────────────────

  private async call(method: string, pathWithQuery: string, payload?: unknown): Promise<unknown> {
    const config = this.config;
    if (!config) throw new Error("not_configured");

    const body = payload === undefined ? "" : JSON.stringify(payload);
    const timestamp = Date.now();
    const signature = sign(
      canonicalString(method, pathWithQuery, timestamp, body),
      config.signingSecret,
    );

    const controller = new AbortController();
    const guard = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetchImpl(
        `${config.baseUrl.replace(/\/+$/, "")}${pathWithQuery}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "X-Gate-Timestamp": String(timestamp),
            "X-Gate-Signature": signature,
          },
          ...(body ? { body } : {}),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`guestFlow answered ${response.status}`);
      const text = await response.text();
      return text ? (JSON.parse(text) as unknown) : {};
    } finally {
      clearTimeout(guard);
    }
  }

  private scheduleRetry(): void {
    if (!this.running) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    const timer = setTimeout(() => void this.syncNow(), delay);
    timer.unref?.();
  }
}

/** The one word guestFlow shows on a fiche. */
export function stateOf(access: Access, now = new Date()): string {
  if (access.revokedAt) return "revoked";
  if (access.suspendedAt) return "suspended";
  const window = effectiveWindow(access);
  if (window.to && now > window.to) return "ended";
  if (window.from && now < window.from) return "scheduled";
  return "active";
}
