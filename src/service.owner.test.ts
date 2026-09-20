// Covers the owner's half of specs/guest-access.md — the list, hand-made
// accesses, the two regenerations, suspension and deletion.

import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { makeHarness, STAY, DURING, type Harness } from "./serviceFixtures.js";

let harness: Harness;
const start = (): Harness => (harness = makeHarness());

afterEach(() => {
  if (harness) rmSync(harness.dir, { recursive: true, force: true });
});

describe("a hand-made access", () => {
  it("is created with a code of its own, and journalled with who made it", () => {
    const { service } = start();
    const { access } = service.createManual({ label: "Voisin — Jean" }, "adrien", DURING);
    expect(access?.kind).toBe("manual");
    expect(access?.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(access?.createdBy).toBe("adrien");
    expect(service.journal()[0]).toMatchObject({ kind: "created", actor: "adrien" });
  });

  it("refuses to be nameless", () => {
    const { service } = start();
    expect(service.createManual({ label: "  " }, "adrien").refusal).toMatchObject({
      field: "label",
      code: "required",
    });
    expect(service.list()).toHaveLength(0);
  });

  it("is permanent when no dates are given, and ranged when they are", () => {
    const { service } = start();
    const permanent = service.createManual({ label: "Voisin" }, "adrien").access!;
    expect(permanent.validFrom).toBeNull();
    expect(permanent.validUntil).toBeNull();

    const ranged = service.createManual(
      { label: "Plombier", validFrom: "2026-09-10T08:00", validUntil: "2026-09-10T18:00" },
      "adrien",
    ).access!;
    // The owner typed Paris hours; instants are what is stored.
    expect(ranged.validFrom).toBe("2026-09-10T06:00:00.000Z");
    expect(ranged.validUntil).toBe("2026-09-10T16:00:00.000Z");
  });

  it("refuses a range that ends before it starts, and a bad date", () => {
    const { service } = start();
    expect(
      service.createManual(
        { label: "X", validFrom: "2026-09-10T18:00", validUntil: "2026-09-10T08:00" },
        "adrien",
      ).refusal,
    ).toMatchObject({ code: "end_before_start" });
    expect(
      service.createManual({ label: "X", validFrom: "la semaine prochaine" }, "adrien").refusal,
    ).toMatchObject({ code: "bad_date" });
  });

  it("refuses overlapping hours before they become unguessable", () => {
    const { service } = start();
    expect(
      service.createManual(
        {
          label: "X",
          timeWindows: [
            { from: "08:00", to: "12:00" },
            { from: "11:00", to: "14:00" },
          ],
        },
        "adrien",
      ).refusal,
    ).toMatchObject({ code: "overlap" });
  });
});

describe("editing", () => {
  it("lets the owner widen a stay, and refuses an override that would shorten it", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;

    const early = service.edit(access.id, { earlyOpenedAt: "2026-09-04T10:00" }, "adrien");
    expect(early.access?.earlyOpenedAt).toBe("2026-09-04T08:00:00.000Z");

    // « Ouvrir dès » after check-in is not an early opening.
    expect(
      service.edit(access.id, { earlyOpenedAt: "2026-09-06T10:00" }, "adrien").refusal,
    ).toMatchObject({ code: "not_earlier" });

    // « Prolonger » before check-out is an early revocation — that is « Suspendre ».
    expect(
      service.edit(access.id, { extendedUntil: "2026-09-10T10:00" }, "adrien").refusal,
    ).toMatchObject({ code: "not_later" });
  });

  it("does not let a stay's own window be typed over", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    service.edit(access.id, { validFrom: "2020-01-01T00:00" }, "adrien");
    // Ignored: the reservation owns it.
    expect(service.get(access.id)?.validFrom).toBeNull();
    expect(service.get(access.id)?.stayWindow?.from).toBe(STAY.startsAt);
  });

  it("names what changed in the journal", () => {
    const { service } = start();
    const access = service.createManual({ label: "Voisin" }, "adrien").access!;
    service.edit(access.id, { timeWindows: [{ from: "08:00", to: "20:00" }] }, "adrien");
    expect(service.journal()[0]).toMatchObject({ kind: "edited", reason: "timeWindows" });
  });
});

describe("suspending, revoking, deleting", () => {
  it("suspension keeps the code and takes the access out of service", () => {
    const { service } = start();
    const access = service.createManual({ label: "Voisin" }, "adrien").access!;
    const suspended = service.suspend(access.id, "adrien")!;
    expect(suspended.code).toBe(access.code);
    expect(service.decideFor(suspended, DURING)).toMatchObject({ reason: "suspended" });

    const resumed = service.resume(access.id, "adrien")!;
    expect(service.decideFor(resumed, DURING)).toEqual({ ok: true });
  });

  it("revoking drops every phone as well", () => {
    const { service } = start();
    const access = service.createManual({ label: "Voisin" }, "adrien").access!;
    service.enrol(access.code!, "1.2.3.4", "iPhone");
    expect(service.get(access.id)?.devices).toHaveLength(1);

    service.revoke(access.id, "adrien");
    expect(service.get(access.id)?.devices).toHaveLength(0);
    expect(service.decideFor(service.get(access.id)!, DURING)).toMatchObject({ reason: "revoked" });
  });

  it("deleting removes the access and keeps the journal", () => {
    const { service } = start();
    const access = service.createManual({ label: "Voisin" }, "adrien").access!;
    expect(service.delete(access.id, "adrien")).toBe(true);
    expect(service.get(access.id)).toBeUndefined();
    expect(service.journal().map((e) => e.kind)).toContain("deleted");
    // The journal still names who it was about.
    expect(service.journal()[0].label).toBe("Voisin");
  });
});

describe("the two regenerations", () => {
  it("« nouvelle invitation » changes the code and leaves the phones alone", () => {
    const { service } = start();
    const access = service.createManual({ label: "Voisin" }, "adrien").access!;
    service.enrol(access.code!, "1.2.3.4", "iPhone");

    const updated = service.newInvitation(access.id, "adrien")!;
    expect(updated.code).not.toBe(access.code);
    expect(updated.devices).toHaveLength(1);
    expect(service.journal()[0]).toMatchObject({ kind: "invitation" });
  });

  it("« régénérer » changes the code AND cuts every phone off", () => {
    const { service } = start();
    const access = service.createManual({ label: "Voisin" }, "adrien").access!;
    const { token } = service.enrol(access.code!, "1.2.3.4", "iPhone");

    const updated = service.regenerate(access.id, "adrien")!;
    expect(updated.code).not.toBe(access.code);
    expect(updated.devices).toHaveLength(0);
    expect(service.session(token!)).toBeNull();
  });

  it("never mints a code another live access already holds", () => {
    const { service, store } = start();
    const first = service.createManual({ label: "A" }, "adrien").access!;
    for (let i = 0; i < 30; i++) service.createManual({ label: `n${i}` }, "adrien");
    const codes = store.list().map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain(first.code);
  });
});
