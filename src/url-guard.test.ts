import { describe, expect, it } from "vitest";
import { isAcceptableUrl } from "./url-guard.js";

// The second factor makes a sniffed channel survivable — the secret never
// travels — but it encrypts NOTHING: the stay code, the lodging and the guest's
// name would cross the LAN in clear. guestFlow is served over TLS under its
// public name, so there is no reason left to accept anything else.

describe("guestFlow's address", () => {
  it("accepts HTTPS", () => {
    expect(isAcceptableUrl("https://guestflow.adn-dev.fr")).toBe(true);
    expect(isAcceptableUrl("https://guestflow.adn-dev.fr/")).toBe(true);
    expect(isAcceptableUrl("https://192.168.0.24:4000")).toBe(true);
  });

  it("refuses plain HTTP towards another machine — the LAN included", () => {
    // Precisely the setting that was lying around: http://192.168.0.24:4000.
    expect(isAcceptableUrl("http://192.168.0.24:4000")).toBe(false);
    expect(isAcceptableUrl("http://guestflow.adn-dev.fr")).toBe(false);
    expect(isAcceptableUrl("http://guestflow.maison.adn-dev.fr")).toBe(false);
  });

  it("lets localhost through: there is no wire to listen to", () => {
    expect(isAcceptableUrl("http://localhost:4000")).toBe(true);
    expect(isAcceptableUrl("http://127.0.0.1:4000")).toBe(true);
    expect(isAcceptableUrl("http://[::1]:4000")).toBe(true);
  });

  it("refuses what is not an address, and exotic protocols", () => {
    expect(isAcceptableUrl("")).toBe(false);
    expect(isAcceptableUrl("guestflow.adn-dev.fr")).toBe(false);
    expect(isAcceptableUrl("ftp://guestflow.adn-dev.fr")).toBe(false);
    expect(isAcceptableUrl("file:///etc/passwd")).toBe(false);
    expect(isAcceptableUrl("javascript:alert(1)")).toBe(false);
  });

  it("is not fooled by a host that CONTAINS localhost", () => {
    expect(isAcceptableUrl("http://localhost.attaquant.fr")).toBe(false);
    expect(isAcceptableUrl("http://notlocalhost")).toBe(false);
  });
});
