// ============================================================
// The Paris wall clock
//
// Every hour the owner types and every hour a guest reads is a wall-clock hour
// in Europe/Paris. Instants are what is stored. The two transitions a year are
// the whole reason this file exists: « valid until 11:00 » must mean 11:00 on
// both sides of the last Sunday in October, and « 08:00 → 20:00 » must be the
// same eight-to-eight in February and in July.
//
// No dependency: Intl knows the rules, and the only trick needed is to invert
// it — going from a wall clock back to an instant is a fixed point, reached in
// two passes because an offset can only change by an hour.
// ============================================================

export const PARIS = "Europe/Paris";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function partsOf(instant: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of PARTS.formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  // `en-GB` renders midnight as 24 rather than 00 in some runtimes.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Paris' offset from UTC at that instant, in milliseconds. */
export function offsetMs(instant: Date): number {
  const p = partsOf(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/** What a Paris clock read at that instant. */
export function wallClockAt(instant: Date): WallClock {
  const p = partsOf(instant);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute };
}

/**
 * The instant a Paris clock read `wall`.
 *
 * Two passes: the first guess assumes the offset in force at the naive instant,
 * the second corrects it if that guess landed on the other side of a
 * transition. An hour that does not exist (02:30 on the spring Sunday) resolves
 * forward, and an hour that happens twice resolves to the first — deterministic
 * either way, which is what matters for a door.
 */
export function instantOfWallClock(wall: WallClock): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  let instant = naive - offsetMs(new Date(naive));
  instant = naive - offsetMs(new Date(instant));
  return new Date(instant);
}

/** `2026-09-04T18:00` (Paris) → the instant. Returns null on anything else. */
export function parseWallClock(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const wall = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
  };
  if (wall.month < 1 || wall.month > 12 || wall.day < 1 || wall.day > 31) return null;
  if (wall.hour > 23 || wall.minute > 59) return null;
  return instantOfWallClock(wall);
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** The value an `<input type="datetime-local">` shows for that instant. */
export function toWallClockInput(iso: string | null): string {
  if (!iso) return "";
  const w = wallClockAt(new Date(iso));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Minutes since Paris midnight, for the time-of-day windows. */
export function minutesOfDay(instant: Date): number {
  const w = wallClockAt(instant);
  return w.hour * 60 + w.minute;
}

/** `08:30` → 510. Null when it is not a time of day. */
export function parseHhMm(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatHhMm(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
