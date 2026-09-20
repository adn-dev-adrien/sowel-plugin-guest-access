// ============================================================
// Whether an access may command the gate, right now
//
// One function answers it, and every refusal carries its own reason — « ça ne
// marche pas » in front of a gate at night is what produces a telephone call.
//
// The order is deliberate: what the owner decided (revoked, suspended) comes
// before what the calendar says, and the hours come last, because a guest
// outside their hours is told when they may come back rather than that their
// code is wrong.
// ============================================================

import type { Access, RefusalReason, TimeWindow } from "./model.js";
import {
  MAX_OPENS_PER_ACCESS_PER_HOUR,
  MAX_OPENS_PER_GATE_PER_HOUR,
} from "./model.js";
import { formatHhMm, minutesOfDay, parseHhMm } from "./paris.js";

export interface EffectiveWindow {
  from: Date | null;
  to: Date | null;
}

const time = (iso: string | null | undefined): Date | null => (iso ? new Date(iso) : null);
const earliest = (a: Date | null, b: Date | null): Date | null =>
  a && b ? (a <= b ? a : b) : (a ?? b);
const latest = (a: Date | null, b: Date | null): Date | null =>
  a && b ? (a >= b ? a : b) : (a ?? b);

/**
 * The window in force, overrides included.
 *
 * **An override can only ever widen.** That is what lets guestFlow rewrite a
 * stay's dates whenever the reservation moves without ever shortening an access
 * behind the owner's back: « ouvrir dès » can only pull the start earlier and
 * « prolonger jusqu'au » can only push the end later. Cutting an access short
 * is « suspendre », which is a different act with a different name.
 */
export function effectiveWindow(access: Access): EffectiveWindow {
  if (access.kind === "stay") {
    const stay = access.stayWindow;
    return {
      from: earliest(time(stay?.from ?? null), time(access.earlyOpenedAt)),
      to: latest(time(stay?.to ?? null), time(access.extendedUntil)),
    };
  }
  return {
    from: earliest(time(access.validFrom), time(access.earlyOpenedAt)),
    to: latest(time(access.validUntil), time(access.extendedUntil)),
  };
}

export type Decision =
  | { ok: true }
  | { ok: false; reason: RefusalReason; activeAt?: string; nextOpeningAt?: string };

export interface Counters {
  /** Opens by this access in the last hour. */
  accessOpensLastHour: number;
  /** Opens through the gate, all accesses, in the last hour. */
  gateOpensLastHour: number;
}

/** Is the access live at all — not suspended, not revoked, inside its window? */
export function decide(access: Access, now: Date, counters: Counters): Decision {
  if (access.revokedAt) return { ok: false, reason: "revoked" };
  if (access.suspendedAt) return { ok: false, reason: "suspended" };

  const window = effectiveWindow(access);
  if (window.from && now < window.from) {
    return { ok: false, reason: "not_yet_active", activeAt: window.from.toISOString() };
  }
  if (window.to && now > window.to) return { ok: false, reason: "expired" };

  const hours = hourCheck(access.timeWindows, now);
  if (!hours.ok) return hours;

  // Both ceilings, because one compromised access must not starve the other
  // lodging: the per-access one protects the gate from its own guest, the
  // per-gate one protects the other guests from this access.
  if (counters.accessOpensLastHour >= MAX_OPENS_PER_ACCESS_PER_HOUR) {
    return { ok: false, reason: "too_many_opens" };
  }
  if (counters.gateOpensLastHour >= MAX_OPENS_PER_GATE_PER_HOUR) {
    return { ok: false, reason: "too_many_opens" };
  }

  return { ok: true };
}

/** Inside one of the day's windows? Empty means any hour. */
export function hourCheck(windows: TimeWindow[], now: Date): Decision {
  if (!windows.length) return { ok: true };
  const minutes = minutesOfDay(now);
  const parsed = windows
    .map((w) => ({ from: parseHhMm(w.from), to: parseHhMm(w.to) }))
    .filter((w): w is { from: number; to: number } => w.from !== null && w.to !== null);

  if (!parsed.length) return { ok: true };
  if (parsed.some((w) => minutes >= w.from && minutes < w.to)) return { ok: true };

  const starts = parsed.map((w) => w.from).sort((a, b) => a - b);
  const next = starts.find((start) => start > minutes) ?? starts[0];
  return { ok: false, reason: "outside_hours", nextOpeningAt: formatHhMm(next) };
}

// ── What the owner may write ────────────────────────────────────────────

export type Refusal = { field: string; code: string } | null;

/**
 * The refusals the editor shows while the owner types.
 *
 * Every one of them is a sentence the owner would otherwise discover in front
 * of a gate, so they are returned as codes the page turns into French rather
 * than as booleans.
 */
export function validateTimeWindows(windows: unknown): Refusal {
  if (!Array.isArray(windows)) return { field: "timeWindows", code: "not_a_list" };
  const parsed: Array<{ from: number; to: number }> = [];
  for (const window of windows) {
    const from = parseHhMm((window as TimeWindow)?.from);
    const to = parseHhMm((window as TimeWindow)?.to);
    if (from === null || to === null) return { field: "timeWindows", code: "bad_time" };
    // Midnight-crossing is refused rather than guessed: « 22:00 → 02:00 » reads
    // as two different intentions depending on who is asked.
    if (to <= from) return { field: "timeWindows", code: "end_before_start" };
    parsed.push({ from, to });
  }
  parsed.sort((a, b) => a.from - b.from);
  for (let i = 1; i < parsed.length; i++) {
    // Two overlapping rules make the effective one unguessable.
    if (parsed[i].from < parsed[i - 1].to) return { field: "timeWindows", code: "overlap" };
  }
  return null;
}

export function validateRange(from: Date | null, to: Date | null): Refusal {
  if (from && to && to <= from) return { field: "validUntil", code: "end_before_start" };
  return null;
}

/** « Ouvrir dès » must be before the start it advances, or it is not an early opening. */
export function validateEarlyOpen(access: Access, earlyOpenedAt: Date | null): Refusal {
  if (!earlyOpenedAt) return null;
  const start = access.kind === "stay" ? time(access.stayWindow?.from ?? null) : time(access.validFrom);
  if (start && earlyOpenedAt >= start) return { field: "earlyOpenedAt", code: "not_earlier" };
  return null;
}

/**
 * « Prolonger jusqu'au » must exceed the end it extends. Anything else is an
 * early revocation, and for that there is « Suspendre ».
 */
export function validateExtension(access: Access, extendedUntil: Date | null): Refusal {
  if (!extendedUntil) return null;
  const end = access.kind === "stay" ? time(access.stayWindow?.to ?? null) : time(access.validUntil);
  if (end && extendedUntil <= end) return { field: "extendedUntil", code: "not_later" };
  return null;
}

/** Has the access fallen out of the list on its own? */
export function hasEnded(access: Access, now: Date): boolean {
  const window = effectiveWindow(access);
  return !!window.to && now > window.to;
}
