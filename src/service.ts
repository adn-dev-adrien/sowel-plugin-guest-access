// ============================================================
// What an access means — the one place the rules are applied
//
// Both surfaces go through here: the owner's page and the guest's phone. They
// never touch the store directly, which is what keeps « a suspended access
// cannot open the gate » from being true in one of them and forgotten in the
// other.
//
// Nothing here knows about HTTP, and nothing here knows about guestFlow. A
// stay arrives as a plain object; where it came from is `guestflow.ts`'s
// business.
// ============================================================

import type { Access, AccessDevice, JournalEntry, RefusalReason, TimeWindow } from "./model.js";
import {
  CODE_LOCK_AFTER_FAILURES,
  CODE_LOCK_MS,
  DEVICE_COUNT_NOTICE,
  ENROL_ATTEMPT_WINDOW_MS,
  MAX_ENROL_ATTEMPTS_PER_IP,
} from "./model.js";
import { formatCode, generateCode, generateDeviceToken, hashToken, normalizeCode, randomId } from "./codes.js";
import { AccessStore } from "./store.js";
import { DEFAULT_GUEST_PATH, invitationUrl } from "./guest-url.js";
import type { Gate, PressOutcome } from "./gate.js";
import {
  decide,
  effectiveWindow,
  hasEnded,
  validateEarlyOpen,
  validateExtension,
  validateRange,
  validateTimeWindows,
  type Refusal,
} from "./validity.js";
import { parseWallClock } from "./paris.js";

export interface ServiceLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/** A stay as guestFlow publishes it. */
export interface StayFeedItem {
  revision: number;
  reservationId: number;
  reservationNumber: string | null;
  property: string | null;
  guestName: string | null;
  /** Instants; guestFlow owns the wall-clock arithmetic of its own reservations. */
  startsAt: string | null;
  endsAt: string | null;
  /** `cancelled` and `deleted` revoke; anything else configures. */
  state: "active" | "cancelled" | "deleted";
}

export interface EnrolResult {
  ok: boolean;
  reason?: "bad_code" | "locked" | "too_many_attempts" | "revoked" | "expired";
  token?: string;
  access?: Access;
}

export interface Notifier {
  /** Fired when an access passes six phones. Information, never a block. */
  devicesOverNotice(access: Access): void;
}

export class GuestAccessService {
  private readonly store: AccessStore;
  private readonly gate: Gate;
  private readonly logger: ServiceLogger;
  private readonly notifier: Notifier | null;
  /** Failed enrolments, per IP and per submitted code. In memory: a restart
   *  clearing them costs one attempt window, and persisting them would mean
   *  writing a file on every wrong keystroke. */
  private readonly attemptsByIp = new Map<string, number[]>();
  private readonly failuresByCode = new Map<string, number[]>();

  constructor(opts: {
    store: AccessStore;
    gate: Gate;
    logger: ServiceLogger;
    notifier?: Notifier;
  }) {
    this.store = opts.store;
    this.gate = opts.gate;
    this.logger = opts.logger;
    this.notifier = opts.notifier ?? null;
  }

  // ── The owner ──────────────────────────────────────────────

  list(): Access[] {
    return this.store.list();
  }

  get(id: string): Access | undefined {
    return this.store.get(id);
  }

  journal(filter: { accessId?: string; limit?: number } = {}): JournalEntry[] {
    return this.store.journal(filter);
  }

  createManual(
    input: { label?: unknown; validFrom?: unknown; validUntil?: unknown; timeWindows?: unknown },
    actor: string,
    now = new Date(),
  ): { access?: Access; refusal?: Refusal } {
    const label = typeof input.label === "string" ? input.label.trim() : "";
    // Required, and not out of tidiness: an access named « — » is one nobody
    // dares delete in six months.
    if (!label) return { refusal: { field: "label", code: "required" } };

    const from = input.validFrom ? parseWallClock(input.validFrom) : null;
    const to = input.validUntil ? parseWallClock(input.validUntil) : null;
    if (input.validFrom && !from) return { refusal: { field: "validFrom", code: "bad_date" } };
    if (input.validUntil && !to) return { refusal: { field: "validUntil", code: "bad_date" } };

    const rangeRefusal = validateRange(from, to);
    if (rangeRefusal) return { refusal: rangeRefusal };

    const windows = input.timeWindows ?? [];
    const windowRefusal = validateTimeWindows(windows);
    if (windowRefusal) return { refusal: windowRefusal };

    const access: Access = {
      id: randomId(),
      kind: "manual",
      label,
      code: this.mintCode(now),
      source: null,
      stayWindow: null,
      validFrom: from ? from.toISOString() : null,
      validUntil: to ? to.toISOString() : null,
      earlyOpenedAt: null,
      extendedUntil: null,
      timeWindows: windows as TimeWindow[],
      suspendedAt: null,
      revokedAt: null,
      devices: [],
      createdAt: now.toISOString(),
      createdBy: actor,
      updatedAt: now.toISOString(),
      lastUsedAt: null,
      useCount: 0,
    };
    this.store.insert(access);
    this.record(access, "created", { actor });
    this.publishSummary();
    return { access };
  }

  edit(
    id: string,
    input: Record<string, unknown>,
    actor: string,
  ): { access?: Access; refusal?: Refusal; missing?: true } {
    const access = this.store.get(id);
    if (!access) return { missing: true };

    const patch: Partial<Access> = {};

    if (typeof input.label === "string") {
      const label = input.label.trim();
      if (!label) return { refusal: { field: "label", code: "required" } };
      patch.label = label;
    }

    if ("timeWindows" in input) {
      const refusal = validateTimeWindows(input.timeWindows);
      if (refusal) return { refusal };
      patch.timeWindows = input.timeWindows as TimeWindow[];
    }

    // A stay's own window belongs to the reservation; what the owner may write
    // on it is an override, and an override can only widen (validity.ts).
    if ("earlyOpenedAt" in input) {
      const value = input.earlyOpenedAt ? parseWallClock(input.earlyOpenedAt) : null;
      if (input.earlyOpenedAt && !value) {
        return { refusal: { field: "earlyOpenedAt", code: "bad_date" } };
      }
      const refusal = validateEarlyOpen(access, value);
      if (refusal) return { refusal };
      patch.earlyOpenedAt = value ? value.toISOString() : null;
    }

    if ("extendedUntil" in input) {
      const value = input.extendedUntil ? parseWallClock(input.extendedUntil) : null;
      if (input.extendedUntil && !value) {
        return { refusal: { field: "extendedUntil", code: "bad_date" } };
      }
      const refusal = validateExtension(access, value);
      if (refusal) return { refusal };
      patch.extendedUntil = value ? value.toISOString() : null;
    }

    if (access.kind === "manual" && ("validFrom" in input || "validUntil" in input)) {
      const from = input.validFrom ? parseWallClock(input.validFrom) : null;
      const to = input.validUntil ? parseWallClock(input.validUntil) : null;
      if (input.validFrom && !from) return { refusal: { field: "validFrom", code: "bad_date" } };
      if (input.validUntil && !to) return { refusal: { field: "validUntil", code: "bad_date" } };
      const refusal = validateRange(from, to);
      if (refusal) return { refusal };
      patch.validFrom = from ? from.toISOString() : null;
      patch.validUntil = to ? to.toISOString() : null;
    }

    const updated = this.store.update(id, patch);
    if (!updated) return { missing: true };
    // Named, not just « edited »: « why is this access open until Tuesday »
    // must have an answer.
    this.record(updated, "edited", { actor, reason: Object.keys(patch).join(",") || "nothing" });
    this.publishSummary();
    return { access: updated };
  }

  suspend(id: string, actor: string): Access | undefined {
    const updated = this.store.update(id, { suspendedAt: new Date().toISOString() });
    if (updated) {
      this.record(updated, "suspended", { actor });
      this.publishSummary();
    }
    return updated;
  }

  resume(id: string, actor: string): Access | undefined {
    const updated = this.store.update(id, { suspendedAt: null });
    if (updated) {
      this.record(updated, "resumed", { actor });
      this.publishSummary();
    }
    return updated;
  }

  revoke(id: string, actor: string): Access | undefined {
    const updated = this.store.update(id, { revokedAt: new Date().toISOString(), devices: [] });
    if (updated) {
      this.record(updated, "revoked", { actor });
      this.publishSummary();
    }
    return updated;
  }

  delete(id: string, actor: string): boolean {
    const access = this.store.get(id);
    if (!access) return false;
    const removed = this.store.remove(id);
    if (removed) {
      // The journal deliberately outlives the access: « who came in that night »
      // must survive a tidy-up.
      this.record(access, "deleted", { actor });
      this.publishSummary();
    }
    return removed;
  }

  /**
   * A new code and link. Phones already set up keep working — this is for the
   * guest who lost the email, not for the phone that must be cut off.
   */
  newInvitation(id: string, actor: string, now = new Date()): Access | undefined {
    const updated = this.store.update(id, { code: this.mintCode(now) });
    if (updated) this.record(updated, "invitation", { actor });
    return updated;
  }

  /**
   * A new code AND every phone dropped. This is the one for a lost phone: each
   * one has to be set up again, from the new invitation.
   */
  regenerate(id: string, actor: string, now = new Date()): Access | undefined {
    const updated = this.store.update(id, { code: this.mintCode(now), devices: [] });
    if (updated) this.record(updated, "regenerated", { actor });
    return updated;
  }

  // ── guestFlow ──────────────────────────────────────────────

  /**
   * A stay, as published by guestFlow.
   *
   * Idempotent on the revision: the connector may replay a page of the feed
   * after a restart, and replaying a stay must not mint a new code for a guest
   * who already has one in an email.
   */
  applyStay(item: StayFeedItem, now = new Date()): { access?: Access; skipped?: string } {
    const existing = this.store.findByReservation(item.reservationId);

    if (item.state !== "active") {
      if (!existing || existing.revokedAt) return { skipped: "already_gone" };
      const updated = this.store.update(existing.id, {
        revokedAt: now.toISOString(),
        devices: [],
        source: { ...existing.source!, revision: item.revision },
      });
      if (updated) {
        this.record(updated, "stay_cancelled", { actor: "guestflow", reason: item.state });
        this.publishSummary();
      }
      return { access: updated };
    }

    if (!item.startsAt || !item.endsAt) return { skipped: "no_window" };

    const source = {
      system: "guestflow" as const,
      reservationId: item.reservationId,
      reservationNumber: item.reservationNumber,
      property: item.property,
      revision: item.revision,
    };
    const label = item.guestName?.trim() || `Séjour ${item.reservationNumber ?? item.reservationId}`;
    const stayWindow = { from: item.startsAt, to: item.endsAt };

    if (!existing) {
      const access: Access = {
        id: randomId(),
        kind: "stay",
        label,
        code: this.mintCode(now),
        source,
        stayWindow,
        validFrom: null,
        validUntil: null,
        earlyOpenedAt: null,
        extendedUntil: null,
        timeWindows: [],
        suspendedAt: null,
        revokedAt: null,
        devices: [],
        createdAt: now.toISOString(),
        createdBy: "guestflow",
        updatedAt: now.toISOString(),
        lastUsedAt: null,
        useCount: 0,
      };
      this.store.insert(access);
      this.record(access, "created", { actor: "guestflow" });
      this.publishSummary();
      return { access };
    }

    if (existing.source && item.revision <= existing.source.revision) {
      return { skipped: "stale_revision" };
    }

    const changed =
      existing.stayWindow?.from !== stayWindow.from ||
      existing.stayWindow?.to !== stayWindow.to ||
      existing.label !== label;

    // A reservation reinstated in guestFlow lifts the revocation here, and the
    // same code works again — which is what the owner asked for.
    const updated = this.store.update(existing.id, {
      label,
      source,
      stayWindow,
      revokedAt: null,
      code: existing.code ?? this.mintCode(now),
    });
    if (updated && (changed || existing.revokedAt)) {
      this.record(updated, "stay_updated", { actor: "guestflow" });
      this.publishSummary();
    }
    return { access: updated };
  }

  // ── The guest ──────────────────────────────────────────────

  /** A phone being set up, from a code typed or carried by the link. */
  enrol(code: string, ip: string, userAgent: string, now = new Date()): EnrolResult {
    if (this.tooManyAttempts(ip, now)) return { ok: false, reason: "too_many_attempts" };

    const candidate = normalizeCode(code);
    if (this.codeLocked(candidate, now)) return { ok: false, reason: "locked" };

    const access = candidate ? this.store.findByCode(candidate) : undefined;
    if (!access) {
      this.noteFailure(ip, candidate, now);
      // Journalled without the code: what is worth knowing is that someone is
      // trying, not what they tried.
      this.store.record({ at: now.toISOString(), accessId: null, label: "—", kind: "bad_code", actor: "guest" });
      return { ok: false, reason: "bad_code" };
    }

    if (access.revokedAt) return { ok: false, reason: "revoked" };
    if (hasEnded(access, now)) return { ok: false, reason: "expired" };

    const token = generateDeviceToken();
    const device: AccessDevice = {
      id: randomId(),
      tokenHash: hashToken(token),
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      userAgent: userAgent.slice(0, 120),
    };
    const updated = this.store.update(access.id, { devices: [...access.devices, device] });
    if (!updated) return { ok: false, reason: "bad_code" };
    this.record(updated, "enrolled", { actor: "guest" });

    if (updated.devices.length > DEVICE_COUNT_NOTICE) this.notifier?.devicesOverNotice(updated);

    return { ok: true, token, access: updated };
  }

  /** What the phone is allowed to know about itself. */
  session(token: string, now = new Date()): { access: Access; decision: ReturnType<typeof decide> } | null {
    const found = this.store.findByDeviceToken(token);
    if (!found) return null;
    return { access: found.access, decision: this.decideFor(found.access, now) };
  }

  /**
   * A guest pressed.
   *
   * The decision comes first and the gate second, so a refusal never moves the
   * counter — a suspended access must not make the recipe pulse and then be
   * told off.
   */
  async open(
    token: string,
    now = new Date(),
  ): Promise<{ outcome: PressOutcome; access?: Access; decision?: ReturnType<typeof decide> }> {
    const found = this.store.findByDeviceToken(token);
    if (!found) return { outcome: "revoked" };

    const access = found.access;
    const decision = this.decideFor(access, now);
    if (!decision.ok) {
      this.record(access, "refused", { actor: "guest", reason: decision.reason });
      return { outcome: decision.reason, access, decision };
    }

    const outcome = await this.gate.press({
      accessId: access.id,
      label: access.label,
      stay: [access.source?.property, access.source?.reservationNumber].filter(Boolean).join(" · "),
    });

    const devices = access.devices.map((d) =>
      d.id === found.deviceId ? { ...d, lastSeenAt: now.toISOString() } : d,
    );

    if (outcome === "opened") {
      this.store.update(access.id, {
        devices,
        lastUsedAt: now.toISOString(),
        useCount: access.useCount + 1,
      });
      this.record(access, "opened", { actor: "guest" });
    } else {
      this.store.update(access.id, { devices });
      this.record(access, outcome === "no_answer" || outcome === "gate_error" ? "failed" : "refused", {
        actor: "guest",
        reason: outcome,
      });
    }
    return { outcome, access, decision };
  }

  decideFor(access: Access, now: Date) {
    const hourAgo = new Date(now.getTime() - 3600_000);
    return decide(access, now, {
      accessOpensLastHour: this.store.countOpens(hourAgo, access.id),
      gateOpensLastHour: this.store.countOpens(hourAgo),
    });
  }

  // ── Housekeeping and summary ───────────────────────────────

  purge(now = new Date()): { codes: number; journal: number } {
    return this.store.purge(now);
  }

  activeCount(now = new Date()): number {
    return this.store.list().filter((a) => this.decideForCount(a, now)).length;
  }

  publishSummary(guestflowLinked?: boolean): void {
    this.gate.publishSummary({
      activeAccesses: this.activeCount(),
      guestflowLinked: guestflowLinked ?? this.lastGuestflowLinked,
    });
  }

  /** Remembered so a summary published from anywhere does not reset the link. */
  private lastGuestflowLinked = false;
  setGuestflowLinked(linked: boolean): void {
    this.lastGuestflowLinked = linked;
    this.publishSummary(linked);
  }

  // ── Internals ──────────────────────────────────────────────

  private decideForCount(access: Access, now: Date): boolean {
    if (access.revokedAt || access.suspendedAt) return false;
    const window = effectiveWindow(access);
    if (window.from && now < window.from) return false;
    if (window.to && now > window.to) return false;
    return true;
  }

  private mintCode(now: Date): string {
    // Drawn again on collision with anything that can still open the gate: the
    // code identifies the stay on its own, so two live accesses sharing one
    // would make the gate answer for the wrong guest.
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = generateCode();
      if (!this.store.isCodeTaken(code, now)) return code;
    }
    throw new Error("Could not mint a free access code");
  }

  private record(
    access: Access,
    kind: JournalEntry["kind"],
    extra: { actor?: string; reason?: string } = {},
  ): void {
    this.store.record({ accessId: access.id, label: access.label, kind, ...extra });
  }

  private tooManyAttempts(ip: string, now: Date): boolean {
    const from = now.getTime() - ENROL_ATTEMPT_WINDOW_MS;
    const attempts = (this.attemptsByIp.get(ip) ?? []).filter((t) => t >= from);
    this.attemptsByIp.set(ip, attempts);
    return attempts.length >= MAX_ENROL_ATTEMPTS_PER_IP;
  }

  private codeLocked(code: string, now: Date): boolean {
    if (!code) return false;
    const from = now.getTime() - CODE_LOCK_MS;
    const failures = (this.failuresByCode.get(code) ?? []).filter((t) => t >= from);
    this.failuresByCode.set(code, failures);
    return failures.length >= CODE_LOCK_AFTER_FAILURES;
  }

  private noteFailure(ip: string, code: string, now: Date): void {
    const at = now.getTime();
    this.attemptsByIp.set(ip, [...(this.attemptsByIp.get(ip) ?? []), at]);
    if (code) this.failuresByCode.set(code, [...(this.failuresByCode.get(code) ?? []), at]);
  }

  /** The invitation, as every surface shows it. */
  invitation(
    access: Access,
    guestBaseUrl: string | null,
    guestPath: string = DEFAULT_GUEST_PATH,
  ): { code: string; url: string | null } {
    return {
      code: formatCode(access.code),
      url: invitationUrl(guestBaseUrl, guestPath, access.code),
    };
  }
}
