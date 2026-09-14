// ============================================================
// The second factor on the GuestFlow ↔ Sowel channel
// (guestFlow's specs/guest-gate-access.md §4.4 — keep the payloads in sync)
//
// The API key proves THIS HOUSE to GuestFlow. Nothing proved GuestFlow to the
// house, and this plugin polls over plain HTTP on the LAN: anyone able to answer
// as that address — an ARP spoof from a compromised device, a guest on the same
// wifi — could hand back a forged request, and the recipe would pulse the gate.
// No key needed, because the key travels away from the house, never towards it.
//
// So the answer is signed, with a secret that never appears on the wire. Whoever
// reads a thousand calls still cannot forge the next one — which is exactly what
// a bearer token cannot say for itself.
//
// The canonical payloads below ARE the contract. Reordering a field here while
// guestFlow keeps its own order means every signature fails in production, with
// both unit suites still green — hence the pinned tests on both sides.
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";

export const WINDOW_MS = 2 * 60 * 1000;

/** How many honoured request ids to remember. A replay is only possible inside the
 *  freshness window, so a few hundred is plenty — and it is bounded, unlike a
 *  high-water mark, which would refuse everything after a restore from backup. */
const SEEN_LIMIT = 1000;

export function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function matches(candidate: unknown, expected: string): boolean {
  const a = Buffer.from(typeof candidate === "string" ? candidate : "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function isFresh(timestamp: unknown, now = Date.now(), windowMs = WINDOW_MS): boolean {
  const at = Number(timestamp);
  if (!Number.isFinite(at)) return false;
  return Math.abs(now - at) <= windowMs;
}

export interface SignedRequest {
  id: number;
  reservationId: number | null;
  signedAt?: unknown;
  signature?: unknown;
}

export type VerifyOutcome = { ok: true } | { ok: false; reason: string };

/** Verifies a request handed over by GuestFlow. Never throws. */
export function verifyRequest(
  request: SignedRequest,
  secret: string,
  now = Date.now(),
  windowMs = WINDOW_MS,
): VerifyOutcome {
  if (!secret) return { ok: false, reason: "no signing secret configured" };
  if (!request.signature) return { ok: false, reason: "missing signature" };
  if (!isFresh(request.signedAt, now, windowMs)) return { ok: false, reason: "stale or missing timestamp" };

  const payload = [
    String(request.id),
    String(request.signedAt),
    request.reservationId == null ? "" : String(request.reservationId),
  ].join(".");
  if (!matches(request.signature, sign(payload, secret))) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

/** The headers the house adds to the outcome it reports. */
export function signResult(
  id: number,
  status: string,
  secret: string,
  now = Date.now(),
): { "X-Gate-Timestamp": string; "X-Gate-Signature": string } {
  return {
    "X-Gate-Timestamp": String(now),
    "X-Gate-Signature": sign([String(id), status, String(now)].join("."), secret),
  };
}

/** Bounded memory of the request ids already honoured — a replay must not open a gate twice. */
export class SeenRequests {
  private readonly seen = new Set<number>();
  private readonly order: number[] = [];

  has(id: number): boolean {
    return this.seen.has(id);
  }

  remember(id: number): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.order.push(id);
    while (this.order.length > SEEN_LIMIT) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  get size(): number {
    return this.seen.size;
  }
}
