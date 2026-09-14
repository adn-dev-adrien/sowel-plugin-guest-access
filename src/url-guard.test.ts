import { describe, expect, it } from "vitest";
import { isAcceptableUrl } from "./url-guard.js";

// The frame signature makes a sniffed channel survivable — the house key never travels — but it
// encrypts NOTHING: the access label and the gate contact would cross the network in clear. So the
// channel is `wss://`, and plain `ws://` is only tolerated towards this machine.

describe("the address of Portier's house channel", () => {
  it("accepts wss://", () => {
    expect(isAcceptableUrl("wss://portier.example.test/house/v1")).toBe(true);
    expect(isAcceptableUrl("wss://portier.example.test:4101/house/v1")).toBe(true);
  });

  it("refuses plain ws:// towards another machine, the local network included", () => {
    expect(isAcceptableUrl("ws://portier.example.test/house/v1")).toBe(false);
    expect(isAcceptableUrl("ws://portier.lan:4101/house/v1")).toBe(false);
  });

  it("tolerates ws:// towards this machine: there is no wire to listen to", () => {
    expect(isAcceptableUrl("ws://localhost:4101/house/v1")).toBe(true);
    expect(isAcceptableUrl("ws://127.0.0.1:4101/house/v1")).toBe(true);
    expect(isAcceptableUrl("ws://[::1]:4101/house/v1")).toBe(true);
  });

  it("refuses an HTTP address — this is a WebSocket channel", () => {
    expect(isAcceptableUrl("https://portier.example.test/house/v1")).toBe(false);
    expect(isAcceptableUrl("http://localhost:4101/house/v1")).toBe(false);
  });

  it("refuses what is not an address, and other protocols", () => {
    expect(isAcceptableUrl("")).toBe(false);
    expect(isAcceptableUrl("portier.example.test/house/v1")).toBe(false);
    expect(isAcceptableUrl("ftp://portier.example.test")).toBe(false);
    expect(isAcceptableUrl("file:///etc/passwd")).toBe(false);
    expect(isAcceptableUrl("javascript:alert(1)")).toBe(false);
  });

  it("is not fooled by a host that CONTAINS localhost", () => {
    expect(isAcceptableUrl("ws://localhost.attacker.test/house/v1")).toBe(false);
    expect(isAcceptableUrl("ws://notlocalhost/house/v1")).toBe(false);
    expect(isAcceptableUrl("ws://127.0.0.1.attacker.test/house/v1")).toBe(false);
  });

  it("refuses an address with a fragment, which the WebSocket client would reject at every attempt", () => {
    expect(isAcceptableUrl("wss://portier.example.test/house/v1#x")).toBe(false);
    expect(isAcceptableUrl("wss://portier.example.test/house/v1#")).toBe(false);
  });
});
