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
  ENROL_ALERT_AT,
  ENROL_DELAY_MAX_MS,
  ENROL_FAILURE_BUDGET,
  ENROL_FAILURE_WINDOW_MS,
  DEVICE_COUNT_NOTICE,
} from "./model.js";
import { formatCode, generateCode, generateDeviceToken, hashToken, normalizeCode, randomId } from "./codes.js";
import { AccessStore } from "./store.js";
import { DEFAULT_GUEST_PATH, invitationUrl } from "./guest-url.js";
import type { PressOutcome } from "./gate.js";
import type { Gates } from "./gates.js";
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
  reason?: "bad_code" | "locked" | "revoked" | "expired";
  token?: string;
  access?: Access;
  /**
   * How long the caller must hold this answer back before sending it.
   *
   * Only ever set on a FAILURE. The service stays synchronous — the waiting is
   * the transport's job — and a correct code never carries one.
   */
  delayMs?: number;
}

export interface Notifier {
  /** Fired when an access passes six phones. Information, never a block. */
  devicesOverNotice(access: Access): void;
  /** Someone is working through codes. Information, and the only way the owner
   *  ever learns it: nothing else about a wrong code leaves the journal. */
  guessingDetected?(failures: number, windowMinutes: number): void;
}

export class GuestAccessService {
  private readonly store: AccessStore;
  private readonly gates: Gates;
  private readonly logger: ServiceLogger;
  private readonly notifier: Notifier | null;
  /** Failed enrolments: all of them, and per submitted code. In memory — a
   *  restart clearing them costs one window, and persisting them would mean
   *  writing a file on every wrong keystroke. The per-IP map that used to sit
   *  here is gone: see ENROL_FAILURE_BUDGET for why it measured nothing. */
  private failures: number[] = [];
  private alertedAt = 0;
  private readonly failuresByCode = new Map<string, number[]>();

  constructor(opts: {
    store: AccessStore;
    gates: Gates;
    logger: ServiceLogger;
    notifier?: Notifier;
  }) {
    this.store = opts.store;
    this.gates = opts.gates;
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
    input: {
      label?: unknown;
      validFrom?: unknown;
      validUntil?: unknown;
      timeWindows?: unknown;
      gates?: unknown;
    },
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

    // Unsaid means the first gate — what a caller from before gates were
    // plural meant, and what a house with one gate always means.
    const gates = input.gates === undefined ? [this.gates.primary().record.id] : this.checkGates(input.gates);
    if (!Array.isArray(gates)) return { refusal: gates };

    const access: Access = {
      id: randomId(),
      kind: "manual",
      label,
      gates,
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

    if ("gates" in input) {
      const gates = this.checkGates(input.gates);
      if (!Array.isArray(gates)) return { refusal: gates };
      patch.gates = gates;
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

  /**
   * A new code and link — the one gesture behind what used to be two buttons.
   * `cutPhones` is what told them apart: a lost email keeps the phones, a lost
   * phone does not.
   */
  changeCode(id: string, actor: string, cutPhones: boolean, now = new Date()): Access | undefined {
    return cutPhones ? this.regenerate(id, actor, now) : this.newInvitation(id, actor, now);
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
        // A stay opens the first gate; the owner adds the others by hand, and
        // a later revision of the stay never takes them back.
        gates: [this.gates.primary().record.id],
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
  enrol(code: string, _ip: string, userAgent: string, now = new Date()): EnrolResult {
    // The code is looked up FIRST, and the budget only ever reaches a failure.
    //
    // The order is the whole protection. To benefit from skipping the budget
    // you must already hold a working code — which is to say, not be guessing.
    // The reverse order is what let five wrong codes, from anywhere, refuse
    // every legitimate guest for ten minutes.
    const candidate = normalizeCode(code);

    const access = candidate ? this.store.findByCode(candidate) : undefined;
    if (!access) {
      if (this.codeLocked(candidate, now)) {
        return { ok: false, reason: "locked", delayMs: this.failureDelayMs(now) };
      }
      const delayMs = this.failureDelayMs(now);
      this.noteFailure(candidate, now);
      // Journalled without the code: what is worth knowing is that someone is
      // trying, not what they tried.
      this.store.record({ at: now.toISOString(), accessId: null, label: "—", kind: "bad_code", actor: "guest" });
      return { ok: false, reason: "bad_code", delayMs };
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
    gateId?: string,
  ): Promise<{ outcome: PressOutcome; access?: Access; decision?: ReturnType<typeof decide> }> {
    const found = this.store.findByDeviceToken(token);
    if (!found) return { outcome: "revoked" };

    const access = found.access;
    // Unsaid is only unambiguous when the access opens one gate. A gate that
    // is not on the access is refused before anything else is looked at: the
    // code is a key to THESE gates, not to the house.
    const target = gateId ?? (access.gates.length === 1 ? access.gates[0] : undefined);
    const gate = target && access.gates.includes(target) ? this.gates.get(target) : undefined;
    if (!target || !gate) {
      this.record(access, "refused", { actor: "guest", reason: "not_this_gate", gate: target });
      return { outcome: "not_this_gate", access };
    }

    const decision = this.decideFor(access, now, target);
    if (!decision.ok) {
      this.record(access, "refused", { actor: "guest", reason: decision.reason, gate: target });
      return { outcome: decision.reason, access, decision };
    }

    const outcome = await gate.press({
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
      this.record(access, "opened", { actor: "guest", gate: target });
    } else {
      this.store.update(access.id, { devices });
      this.record(access, outcome === "no_answer" || outcome === "gate_error" ? "failed" : "refused", {
        actor: "guest",
        reason: outcome,
        gate: target,
      });
    }
    return { outcome, access, decision };
  }

  /**
   * The rules for this access, and — when a gate is named — that gate's own
   * ceiling. Without a gate (the phone asking what it may do) the quietest
   * of its gates stands in: the page must not announce a refusal that one of
   * the gates would not make. Each press is judged again on its own gate.
   */
  decideFor(access: Access, now: Date, gateId?: string) {
    const hourAgo = new Date(now.getTime() - 3600_000);
    const gateIds = gateId ? [gateId] : access.gates;
    const gateOpens = gateIds.map((g) => this.store.countOpens(hourAgo, undefined, g));
    return decide(access, now, {
      accessOpensLastHour: this.store.countOpens(hourAgo, access.id),
      gateOpensLastHour: gateOpens.length ? Math.min(...gateOpens) : 0,
    });
  }

  /** The gates an access opens that still exist, in the owner's order. */
  gatesOf(access: Access): string[] {
    return this.gates.ids().filter((id) => access.gates.includes(id));
  }

  // ── Housekeeping and summary ───────────────────────────────

  purge(now = new Date()): { codes: number; journal: number } {
    return this.store.purge(now);
  }

  activeCount(now = new Date(), gateId?: string): number {
    return this.store
      .list()
      .filter((a) => (!gateId || a.gates.includes(gateId)) && this.decideForCount(a, now)).length;
  }

  /** Each gate's device counts the accesses that open IT. */
  publishSummary(guestflowLinked?: boolean): void {
    const now = new Date();
    for (const { record, gate } of this.gates.list()) {
      gate.publishSummary({
        activeAccesses: this.activeCount(now, record.id),
        guestflowLinked: guestflowLinked ?? this.lastGuestflowLinked,
      });
    }
  }

  /** Accesses still able to open something, by the gates they list. */
  liveAccessGates(now = new Date()): string[][] {
    return this.store
      .list()
      .filter((a) => !a.revokedAt && !hasEnded(a, now))
      .map((a) => a.gates);
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
    extra: { actor?: string; reason?: string; gate?: string } = {},
  ): void {
    this.store.record({ accessId: access.id, label: access.label, kind, ...extra });
  }

  /** At least one gate, every one of them known, each once. */
  private checkGates(raw: unknown): string[] | NonNullable<Refusal> {
    if (!Array.isArray(raw) || raw.some((g) => typeof g !== "string")) {
      return { field: "gates", code: "not_a_list" };
    }
    const known = this.gates.ids();
    if (raw.some((g) => !known.includes(g))) return { field: "gates", code: "unknown_gate" };
    const gates = known.filter((id) => raw.includes(id));
    // An access that opens nothing is an access nobody can tell is broken.
    if (!gates.length) return { field: "gates", code: "no_gate" };
    return gates;
  }

  /**
   * How long a FAILING answer is held back, given the failures already in the
   * window. Doubling, capped — and capped well under the 30 s the core allows a
   * public call, so a held answer is never mistaken for a plugin that hung.
   */
  private failureDelayMs(now: Date): number {
    const over = this.recentFailures(now).length - ENROL_FAILURE_BUDGET;
    if (over < 0) return 0;
    return Math.min(ENROL_DELAY_MAX_MS, 1000 * Math.pow(2, over));
  }

  private recentFailures(now: Date): number[] {
    const from = now.getTime() - ENROL_FAILURE_WINDOW_MS;
    this.failures = this.failures.filter((t) => t >= from);
    return this.failures;
  }

  private codeLocked(code: string, now: Date): boolean {
    if (!code) return false;
    const from = now.getTime() - CODE_LOCK_MS;
    const failures = (this.failuresByCode.get(code) ?? []).filter((t) => t >= from);
    this.failuresByCode.set(code, failures);
    return failures.length >= CODE_LOCK_AFTER_FAILURES;
  }

  private noteFailure(code: string, now: Date): void {
    const at = now.getTime();
    this.recentFailures(now).push(at);
    if (code) this.failuresByCode.set(code, [...(this.failuresByCode.get(code) ?? []), at]);

    // Told once per window, not once per wrong code: an alert that repeats
    // forty times is an alert nobody reads to the end.
    const count = this.failures.length;
    if (count >= ENROL_ALERT_AT && at - this.alertedAt > ENROL_FAILURE_WINDOW_MS) {
      this.alertedAt = at;
      this.store.record({
        at: now.toISOString(), accessId: null, label: "—", kind: "guessing", actor: "guest",
      });
      this.notifier?.guessingDetected?.(count, Math.round(ENROL_FAILURE_WINDOW_MS / 60000));
    }
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
