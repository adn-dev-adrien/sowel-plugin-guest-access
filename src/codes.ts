// ============================================================
// The code a guest types, and the token their phone keeps
//
// Two different secrets with two different lives, which is why they are stored
// differently. The CODE is read out over the telephone, printed in an email and
// typed with a thumb in the rain: it is short, it avoids every letter that can
// be misheard, and it is kept in clear because a hash cannot be dictated. The
// TOKEN is handed to a phone and never seen by a human: it is long, random, and
// only its hash is stored.
// ============================================================

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH } from "./model.js";

/** `4K7M9QT2` — 40 bits, no I, L, O or U. */
export function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * What the guest typed, reduced to what the code could be.
 *
 * Dashes and spaces go, case goes, and the four letters the alphabet excludes
 * are folded onto the characters they are mistaken for. That last part is not
 * politeness: `O` for `0` is what a guest reading their own handwriting types,
 * and answering « code incorrect » to a correct code produces a phone call.
 */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/** `4K7M-9QT2`, the way it is shown and dictated. */
export function formatCode(code: string | null): string {
  if (!code) return "";
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Constant-time equality on two already-normalized codes. */
export function codeMatches(candidate: string, stored: string | null): boolean {
  if (!stored) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(normalizeCode(stored), "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** The secret a phone keeps. 256 bits — nobody types this one. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function randomId(): string {
  return randomBytes(12).toString("hex");
}
