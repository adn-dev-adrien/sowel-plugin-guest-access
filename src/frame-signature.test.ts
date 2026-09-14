import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  authCanonical,
  buildFrame,
  decodeHouseKey,
  frameCanonical,
  safeEqualHex,
  signAuth,
  verifyFrame,
} from "./frame-signature.js";
import type { SignedFrame } from "./frame-signature.js";

// Portier's contract vectors, house channel part (specs/contract-vectors.house.json). Portier and
// this plugin are written separately: a reordered field or a key used as text instead of bytes
// breaks every command in production while both unit suites stay green. These vectors are what
// proves this side made no choice of its own.
const vectors = JSON.parse(
  readFileSync(new URL("../specs/contract-vectors.house.json", import.meta.url), "utf8"),
);
const KEY = decodeHouseKey(vectors.K_house)!;
const NONCE: string = vectors.house_auth.challenge.nonce;

describe("the house key (contract §1)", () => {
  it("is the decoded 32 bytes of the base64url text — here 0x40 to 0x5f", () => {
    expect(KEY).not.toBeNull();
    expect([...KEY]).toEqual(Array.from({ length: 32 }, (_, i) => 0x40 + i));
  });

  it("used as TEXT, it signs something Portier will never accept", () => {
    const asText = createHmac("sha256", vectors.K_house).update(vectors.house_auth.canonical).digest("hex");
    expect(asText).not.toBe(vectors.house_auth.sig);
  });

  it("tolerates surrounding whitespace, a trailing newline included", () => {
    expect(decodeHouseKey(`${vectors.K_house}\n`)).toEqual(KEY);
    expect(decodeHouseKey(`  ${vectors.K_house} `)).toEqual(KEY);
  });

  it("refuses anything that is not 43 base64url characters", () => {
    expect(decodeHouseKey("")).toBeNull();
    expect(decodeHouseKey(`${vectors.K_house}=`)).toBeNull(); // padded
    expect(decodeHouseKey(vectors.K_house.slice(0, 42))).toBeNull(); // truncated
    expect(decodeHouseKey(`${vectors.K_house}A`)).toBeNull(); // too long
    expect(decodeHouseKey(`${vectors.K_house.slice(0, 42)}+`)).toBeNull(); // standard base64
    expect(decodeHouseKey("a passphrase somebody typed by hand, 43 ch")).toBeNull();
  });
});

describe("the challenge answer — vector house_auth", () => {
  it("has the pinned canonical string", () => {
    const { nonce, ts } = vectors.house_auth.challenge;
    expect(authCanonical(nonce, ts)).toBe(vectors.house_auth.canonical);
  });

  it("has the pinned signature", () => {
    const { nonce, ts } = vectors.house_auth.challenge;
    expect(signAuth(KEY, nonce, ts)).toBe(vectors.house_auth.sig);
  });
});

describe("a Portier → house frame — vector frame_p2h (verify)", () => {
  const vector = vectors.frame_p2h;
  const signed = (): SignedFrame => ({ ...vector.frame, sig: vector.sig });

  it("has the pinned canonical string", () => {
    const { seq, ts, type, payload } = vector.frame;
    expect(frameCanonical(NONCE, "p2h", seq, ts, type, payload)).toBe(vector.canonical);
  });

  it("verifies, including once parsed back from the wire", () => {
    expect(verifyFrame(KEY, NONCE, "p2h", signed())).toBe(true);
    const parsed = JSON.parse(JSON.stringify(signed())) as SignedFrame;
    expect(verifyFrame(KEY, NONCE, "p2h", parsed)).toBe(true);
  });

  it("does not verify in the other direction, on another connection, or with another key", () => {
    expect(verifyFrame(KEY, NONCE, "h2p", signed())).toBe(false);
    expect(verifyFrame(KEY, "ICEiIyQlJicoKSorLC0uLw", "p2h", signed())).toBe(false);
    expect(verifyFrame(Buffer.alloc(32, 7), NONCE, "p2h", signed())).toBe(false);
  });

  it("does not verify once anything signed is changed", () => {
    const frame = signed();
    expect(verifyFrame(KEY, NONCE, "p2h", { ...frame, seq: 2 })).toBe(false);
    expect(verifyFrame(KEY, NONCE, "p2h", { ...frame, ts: frame.ts + 1 })).toBe(false);
    expect(verifyFrame(KEY, NONCE, "p2h", { ...frame, payload: { ...frame.payload, deadline: 1789999268000 } })).toBe(false);
  });

  it("does not verify when the payload keys come in another order", () => {
    const { commandId, accessLabel, deadline } = vector.frame.payload;
    const reordered = { ...signed(), payload: { deadline, commandId, accessLabel } };
    expect(verifyFrame(KEY, NONCE, "p2h", reordered)).toBe(false);
  });

  it("refuses an upper-case or truncated signature", () => {
    expect(verifyFrame(KEY, NONCE, "p2h", { ...signed(), sig: vector.sig.toUpperCase() })).toBe(false);
    expect(verifyFrame(KEY, NONCE, "p2h", { ...signed(), sig: vector.sig.slice(0, 63) })).toBe(false);
  });
});

describe("a house → Portier frame — vector frame_h2p (produce)", () => {
  const vector = vectors.frame_h2p;

  it("has the pinned canonical string", () => {
    const { seq, ts, type, payload } = vector.frame;
    expect(frameCanonical(NONCE, "h2p", seq, ts, type, payload)).toBe(vector.canonical);
  });

  it("is built with the pinned signature, and serialised in the contract's key order", () => {
    const frame = buildFrame(KEY, NONCE, "h2p", 1, vector.frame.ts, "result", {
      commandId: vector.frame.payload.commandId,
      status: "opened",
      detail: "",
    });
    expect(frame.sig).toBe(vector.sig);
    expect(JSON.stringify(frame)).toBe(JSON.stringify({ ...vector.frame, sig: vector.sig }));
    expect(Object.keys(frame)).toEqual(["seq", "ts", "type", "payload", "sig"]);
  });
});

describe("the signature comparison", () => {
  it("accepts only 64 lower-case hex characters equal to the expected ones", () => {
    const expected = vectors.house_auth.sig;
    expect(safeEqualHex(expected, expected)).toBe(true);
    expect(safeEqualHex(undefined, expected)).toBe(false);
    expect(safeEqualHex(42, expected)).toBe(false);
    expect(safeEqualHex("", expected)).toBe(false);
    expect(safeEqualHex(`${expected}00`, expected)).toBe(false);
    expect(safeEqualHex(vectors.frame_p2h.sig, expected)).toBe(false);
  });
});
