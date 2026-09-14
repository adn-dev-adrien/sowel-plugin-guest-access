// ============================================================
// Signed frames on the house channel (Portier contract §1 and §6)
//
// Three programs written separately must produce the same signature for the
// same frame. A reordered field, a timestamp in seconds instead of milliseconds
// or a key used as text instead of bytes breaks every command in production
// while each unit suite stays green. So the canonical strings live here, in one
// place, and a test pins them against Portier's contract vectors.
//
//   auth  = hex(HMAC(K_house, "auth|" + nonce + "|" + ts))
//   frame = hex(HMAC(K_house, nonce + "|" + dir + "|" + seq + "|" + ts + "|" + type + "|" + JSON.stringify(payload)))
//
// The connection nonce is inside every frame signature: a frame recorded on one
// connection is worthless on the next.
// ============================================================

import { createHmac, timingSafeEqual } from "node:crypto";

/** `p2h` for Portier → house, `h2p` for house → Portier. */
export type Direction = "p2h" | "h2p";

export interface SignedFrame {
  seq: number;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
  sig: string;
}

/** 32 random bytes written as base64url without padding: 43 characters. */
const HOUSE_KEY_TEXT = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE_HEX = /^[0-9a-f]{64}$/;

/**
 * The HMAC key is the DECODED 32 bytes, never the text (contract §1). Returns
 * null for anything else — a key pasted with its padding, truncated, or in
 * standard base64 — so the plugin refuses to start instead of signing with a
 * key Portier does not hold.
 */
export function decodeHouseKey(text: string): Buffer | null {
  const trimmed = text.trim();
  if (!HOUSE_KEY_TEXT.test(trimmed)) return null;
  const bytes = Buffer.from(trimmed, "base64url");
  return bytes.length === 32 ? bytes : null;
}

export function hmacHex(key: Buffer, text: string): string {
  return createHmac("sha256", key).update(text, "utf8").digest("hex");
}

export function authCanonical(nonce: string, ts: number): string {
  return `auth|${nonce}|${ts}`;
}

export function frameCanonical(
  nonce: string,
  dir: Direction,
  seq: number,
  ts: number,
  type: string,
  payload: Record<string, unknown>,
): string {
  return `${nonce}|${dir}|${seq}|${ts}|${type}|${JSON.stringify(payload)}`;
}

/** The answer to a challenge; `ts` is the challenge's own timestamp. */
export function signAuth(key: Buffer, nonce: string, ts: number): string {
  return hmacHex(key, authCanonical(nonce, ts));
}

/**
 * Builds a frame ready to serialise. The object's key order is the contract's
 * (`seq, ts, type, payload, sig`), and the payload is signed exactly as it will be
 * serialised — the caller writes its keys in the contract's order.
 */
export function buildFrame(
  key: Buffer,
  nonce: string,
  dir: Direction,
  seq: number,
  ts: number,
  type: string,
  payload: Record<string, unknown>,
): SignedFrame {
  return { seq, ts, type, payload, sig: hmacHex(key, frameCanonical(nonce, dir, seq, ts, type, payload)) };
}

/** Verifies a parsed frame: the payload is re-serialised as parsed (JSON.parse keeps key order). */
export function verifyFrame(key: Buffer, nonce: string, dir: Direction, frame: SignedFrame): boolean {
  return safeEqualHex(
    frame.sig,
    hmacHex(key, frameCanonical(nonce, dir, frame.seq, frame.ts, frame.type, frame.payload)),
  );
}

/** Constant-time comparison of a received signature with the expected lowercase hex. */
export function safeEqualHex(candidate: unknown, expected: string): boolean {
  if (typeof candidate !== "string" || !SIGNATURE_HEX.test(candidate)) return false;
  if (!SIGNATURE_HEX.test(expected)) return false;
  return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
}
