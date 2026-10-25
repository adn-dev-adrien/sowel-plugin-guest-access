import { describe, it, expect } from "vitest";
import {
  codeMatches,
  formatCode,
  generateCode,
  generateDeviceToken,
  hashToken,
  normalizeCode,
  tokenMatches,
} from "./codes.js";
import { CODE_ALPHABET } from "./model.js";

describe("the guest's code", () => {
  it("draws only from the dictable alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(8);
      for (const char of code) expect(CODE_ALPHABET).toContain(char);
    }
  });

  it("does not repeat itself in any run worth noticing", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateCode());
    expect(seen.size).toBe(500);
  });

  it("forgives the dash, the spaces and the case", () => {
    expect(normalizeCode("4k7m-9qt2")).toBe("4K7M9QT2");
    expect(normalizeCode(" 4K7M 9QT2 ")).toBe("4K7M9QT2");
  });

  it("forgives the four letters the alphabet leaves out", () => {
    // What a guest reading their own handwriting types.
    expect(normalizeCode("4K7O-9QI2")).toBe("4K709Q12");
    expect(normalizeCode("OIL")).toBe("011");
    expect(normalizeCode("U")).toBe("V");
  });

  it("shows itself in two halves", () => {
    expect(formatCode("4K7M9QT2")).toBe("4K7M-9QT2");
    expect(formatCode(null)).toBe("");
  });

  it("matches a normalized candidate against what is stored", () => {
    expect(codeMatches(normalizeCode("4k7m-9qt2"), "4K7M9QT2")).toBe(true);
    expect(codeMatches(normalizeCode("4K7M9QT3"), "4K7M9QT2")).toBe(false);
    expect(codeMatches(normalizeCode("4K7M9QT2"), null)).toBe(false);
    expect(codeMatches("", "")).toBe(false);
  });
});

describe("the phone's token", () => {
  it("is long, random, and stored only as a hash", () => {
    const token = generateDeviceToken();
    expect(token.length).toBeGreaterThan(40);
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("recognises its own token and nothing else", () => {
    const token = generateDeviceToken();
    const hash = hashToken(token);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(generateDeviceToken(), hash)).toBe(false);
    expect(tokenMatches(token, "short")).toBe(false);
  });
});
