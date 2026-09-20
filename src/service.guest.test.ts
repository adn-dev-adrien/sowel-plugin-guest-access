// Covers the guest's half of specs/guest-access.md — enrolment, its throttles,
// and what a press does.

import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { makeHarness, STAY, DURING, type Harness } from "./serviceFixtures.js";

let harness: Harness;
const start = (): Harness => (harness = makeHarness());

afterEach(() => {
  if (harness) rmSync(harness.dir, { recursive: true, force: true });
});

describe("setting a phone up", () => {
  it("takes the code however it was typed, and hands back a token", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const result = service.enrol(`${access.code!.slice(0, 4)}-${access.code!.slice(4)}`.toLowerCase(), "1.2.3.4", "iPhone", DURING);
    expect(result.ok).toBe(true);
    expect(result.token).toBeTruthy();
    expect(service.get(access.id)?.devices).toHaveLength(1);
    // The token itself is never stored.
    expect(JSON.stringify(service.get(access.id))).not.toContain(result.token!);
  });

  it("refuses a code that matches nothing, and journals the attempt without it", () => {
    const { service } = start();
    const result = service.enrol("NOPENOPE", "1.2.3.4", "iPhone", DURING);
    expect(result).toMatchObject({ ok: false, reason: "bad_code" });
    const line = service.journal()[0];
    expect(line.kind).toBe("bad_code");
    expect(JSON.stringify(line)).not.toContain("NOPENOPE");
  });

  it("stops after five attempts from one address", () => {
    const { service } = start();
    for (let i = 0; i < 5; i++) service.enrol("NOPENOPE", "1.2.3.4", "iPhone", DURING);
    expect(service.enrol("NOPENOPE", "1.2.3.4", "iPhone", DURING)).toMatchObject({
      reason: "too_many_attempts",
    });
    // Another phone, another address: not punished for someone else's guessing.
    expect(service.enrol("NOPENOPE", "5.6.7.8", "iPhone", DURING)).toMatchObject({
      reason: "bad_code",
    });
  });

  it("locks a code that has been guessed at ten times, from wherever", () => {
    const { service } = start();
    for (let i = 0; i < 10; i++) {
      service.enrol("ABCD1234", `10.0.0.${i}`, "iPhone", DURING);
    }
    expect(service.enrol("ABCD1234", "10.0.0.99", "iPhone", DURING)).toMatchObject({
      reason: "locked",
    });
  });

  it("refuses a revoked access and a finished stay", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    service.suspend(access.id, "adrien");
    // Suspension does not stop a phone being set up — it stops the gate opening.
    expect(service.enrol(access.code!, "1.2.3.4", "iPhone", DURING).ok).toBe(true);

    service.revoke(access.id, "adrien");
    expect(service.enrol(access.code!, "1.2.3.4", "iPhone", DURING)).toMatchObject({
      reason: "revoked",
    });

    const other = service.createManual(
      { label: "Plombier", validFrom: "2026-09-01T08:00", validUntil: "2026-09-02T18:00" },
      "adrien",
    ).access!;
    expect(service.enrol(other.code!, "1.2.3.4", "iPhone", DURING)).toMatchObject({
      reason: "expired",
    });
  });

  it("tells the owner past six phones, and lets the seventh in anyway", () => {
    const { service, notified } = start();
    const access = service.applyStay(STAY, DURING).access!;
    for (let i = 0; i < 6; i++) service.enrol(access.code!, `1.2.3.${i}`, "iPhone", DURING);
    expect(notified).toHaveLength(0);

    const seventh = service.enrol(access.code!, "1.2.3.99", "iPhone", DURING);
    expect(seventh.ok).toBe(true);
    expect(notified).toHaveLength(1);
    expect(service.get(access.id)?.devices).toHaveLength(7);
  });
});

describe("pressing", () => {
  it("opens the gate, and counts the use", async () => {
    const { service, answer } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);

    const pending = service.open(token!, DURING);
    await answer("opened");
    await expect(pending).resolves.toMatchObject({ outcome: "opened" });

    const after = service.get(access.id)!;
    expect(after.useCount).toBe(1);
    expect(after.lastUsedAt).toBe(DURING.toISOString());
    expect(service.journal()[0]).toMatchObject({ kind: "opened", actor: "guest" });
  });

  it("never moves the counter for an access that may not open", async () => {
    const { service, gate } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);
    service.suspend(access.id, "adrien");

    await expect(service.open(token!, DURING)).resolves.toMatchObject({ outcome: "suspended" });
    // Nothing was ever in flight, so nothing can have reached the recipe.
    expect(gate.getLastResult()).toBeNull();
    expect(service.journal()[0]).toMatchObject({ kind: "refused", reason: "suspended" });
  });

  it("passes the house's refusal back to the phone", async () => {
    const { service, answer } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);

    const pending = service.open(token!, DURING);
    await answer("refused");
    await expect(pending).resolves.toMatchObject({ outcome: "refused_by_house" });
    expect(service.journal()[0]).toMatchObject({ kind: "refused", reason: "refused_by_house" });
  });

  it("says nothing answered, rather than claiming the gate moved", async () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);

    await expect(service.open(token!, DURING)).resolves.toMatchObject({ outcome: "no_answer" });
    expect(service.get(access.id)?.useCount).toBe(0);
    expect(service.journal()[0]).toMatchObject({ kind: "failed", reason: "no_answer" });
  });

  it("refuses a token nobody holds any more", async () => {
    const { service } = start();
    const access = service.createManual({ label: "Voisin" }, "adrien").access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);
    service.regenerate(access.id, "adrien");
    await expect(service.open(token!, DURING)).resolves.toMatchObject({ outcome: "revoked" });
  });

  it("stops at twelve opens in an hour for one access", async () => {
    const { service, answer } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);

    for (let i = 0; i < 12; i++) {
      const pending = service.open(token!, new Date(DURING.getTime() + i * 1000));
      await answer("opened");
      await pending;
    }
    await expect(service.open(token!, DURING)).resolves.toMatchObject({
      outcome: "too_many_opens",
    });
  });

  it("tells a phone what its own access is doing", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);

    const before = service.session(token!, new Date("2026-09-01T12:00:00Z"));
    expect(before?.decision).toMatchObject({ reason: "not_yet_active" });
    expect(service.session(token!, DURING)?.decision).toEqual({ ok: true });
    expect(service.session("nonsense", DURING)).toBeNull();
  });
});

describe("the invitation", () => {
  it("carries the code in the fragment, which never reaches a server log", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    const invitation = service.invitation(access, "https://sowel.example.com");
    expect(invitation.url).toBe(`https://sowel.example.com/p/guest-access/#i=${access.code}`);
    expect(invitation.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("is code-only when nobody has said where Sowel is reachable", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    expect(service.invitation(access, null).url).toBeNull();
  });
});
