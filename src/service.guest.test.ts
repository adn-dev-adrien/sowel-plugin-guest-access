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

  it("never refuses a correct code, whatever anyone else has been trying", () => {
    // The property the old per-address throttle got backwards. Behind a reverse
    // proxy every visitor arrives under the same address, so five wrong codes
    // from anyone shut out every guest for ten minutes — a denial of service
    // handed to whoever could POST five times.
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    for (let i = 0; i < 40; i++) service.enrol(`NOPE${String(i).padStart(4, "0")}`, "1.2.3.4", "x", DURING);

    const result = service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);
    expect(result.ok).toBe(true);
    expect(result.delayMs).toBeUndefined();
  });

  it("holds a failing answer back, doubling, once the budget is spent", () => {
    const { service } = start();
    const delays: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = service.enrol(`NOPE${String(i).padStart(4, "0")}`, "1.2.3.4", "x", DURING);
      delays.push(r.delayMs ?? 0);
    }
    // Ten free, then 1 s, 2 s, 4 s, 8 s — and never past the cap.
    expect(delays.slice(0, 10)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(delays.slice(10)).toEqual([1000, 2000, 4000, 8000]);
    expect(Math.max(...delays)).toBeLessThanOrEqual(10000);
  });

  it("tells the owner when someone is working through codes, once", () => {
    const { service, guessing } = start();
    for (let i = 0; i < 40; i++) service.enrol(`NOPE${String(i).padStart(4, "0")}`, "1.2.3.4", "x", DURING);
    // Once per window, not once per wrong code: an alert that repeats forty
    // times is an alert nobody reads to the end.
    expect(guessing).toHaveLength(1);
    expect(guessing[0]).toBeGreaterThanOrEqual(25);
    expect(service.journal().some((l) => l.kind === "guessing")).toBe(true);
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

describe("pressing, when the house has more than one gate", () => {
  async function twoGates() {
    const h = start();
    const garage = h.gates.add("Garage").record!;
    const access = h.service.createManual({ label: "Léa", gates: ["main", garage.id] }, "adrien").access!;
    const { token } = h.service.enrol(access.code!, "ip", "iPhone");
    return { h, garage, access, token: token! };
  }

  it("presses the gate the phone named, and only that one", async () => {
    const { h, garage, token } = await twoGates();
    const pending = h.service.open(token, new Date(), garage.id);
    await new Promise((r) => setTimeout(r, 1));
    h.gates.get(garage.id)!.reportResult("opened");
    expect((await pending).outcome).toBe("opened");
    expect(h.service.journal()[0]).toMatchObject({ kind: "opened", gate: garage.id });
  });

  it("refuses a gate the access does not list, before any counter moves", async () => {
    const h = start();
    const garage = h.gates.add("Garage").record!;
    const access = h.service.createManual({ label: "Plombier", gates: [garage.id] }, "adrien").access!;
    const { token } = h.service.enrol(access.code!, "ip", "iPhone");
    const result = await h.service.open(token!, new Date(), "main");
    expect(result.outcome).toBe("not_this_gate");
    expect(h.service.journal()[0]).toMatchObject({ kind: "refused", reason: "not_this_gate" });
  });

  it("will not guess which gate a phone meant when the access opens two", async () => {
    const { h, token } = await twoGates();
    expect((await h.service.open(token, new Date())).outcome).toBe("not_this_gate");
  });

  it("counts each gate's ceiling on that gate alone", async () => {
    const { h, garage, access } = await twoGates();
    const now = new Date();
    // The first gate at its ceiling, from other people's presses.
    for (let i = 0; i < 30; i++) {
      h.store.record({ at: now.toISOString(), accessId: "someone-else", label: "X", kind: "opened", gate: "main" });
    }
    const fresh = h.service.get(access.id)!;
    expect(h.service.decideFor(fresh, now, "main")).toMatchObject({ ok: false, reason: "too_many_opens" });
    expect(h.service.decideFor(fresh, now, garage.id)).toEqual({ ok: true });
    // Asked without a gate, the phone is not told it is refused: the garage would open.
    expect(h.service.decideFor(fresh, now)).toEqual({ ok: true });
  });

  it("gives a stay the first gate, and a later revision never takes the others back", () => {
    const h = start();
    const garage = h.gates.add("Garage").record!;
    const stay = h.service.applyStay(STAY, DURING).access!;
    expect(stay.gates).toEqual(["main"]);
    h.service.edit(stay.id, { gates: ["main", garage.id] }, "adrien");
    h.service.applyStay({ ...STAY, revision: 2, guestName: "Camille D." }, DURING);
    expect(h.service.get(stay.id)!.gates).toEqual(["main", garage.id]);
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
