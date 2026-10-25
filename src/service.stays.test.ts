// Covers what a stay published by guestFlow does to an access — the connector's
// half of specs/guest-access.md, without any HTTP in sight.

import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { makeHarness, STAY, DURING, type Harness } from "./serviceFixtures.js";

let harness: Harness;
const start = (): Harness => (harness = makeHarness());

afterEach(() => {
  if (harness) rmSync(harness.dir, { recursive: true, force: true });
});

describe("a stay arriving from guestFlow", () => {
  it("becomes an access with its own code, tagged as guestFlow's", () => {
    const { service } = start();
    const { access } = service.applyStay(STAY, DURING);
    expect(access).toMatchObject({
      kind: "stay",
      label: "Camille",
      createdBy: "guestflow",
    });
    expect(access?.source).toMatchObject({ reservationId: 42, reservationNumber: "202609042" });
    expect(access?.code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("moves with the reservation, keeping the code the guest already has", () => {
    const { service } = start();
    const first = service.applyStay(STAY, DURING).access!;
    const moved = service.applyStay(
      { ...STAY, revision: 2, endsAt: "2026-09-13T09:00:00.000Z" },
      DURING,
    ).access!;
    expect(moved.stayWindow?.to).toBe("2026-09-13T09:00:00.000Z");
    expect(moved.code).toBe(first.code);
    expect(service.journal()[0]).toMatchObject({ kind: "stay_updated", actor: "guestflow" });
  });

  it("ignores a replayed page of the feed", () => {
    const { service } = start();
    service.applyStay(STAY, DURING);
    service.applyStay({ ...STAY, revision: 2, guestName: "Camille D." }, DURING);
    // The connector restarts and replays revision 1.
    const replay = service.applyStay(STAY, DURING);
    expect(replay.skipped).toBe("stale_revision");
    expect(service.list()[0].label).toBe("Camille D.");
  });

  it("revokes on a cancellation, and cuts the phones off with it", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    service.enrol(access.code!, "1.2.3.4", "iPhone", DURING);

    const cancelled = service.applyStay({ ...STAY, revision: 2, state: "cancelled" }, DURING).access!;
    expect(cancelled.revokedAt).toBeTruthy();
    expect(cancelled.devices).toHaveLength(0);
    expect(service.journal()[0]).toMatchObject({ kind: "stay_cancelled", reason: "cancelled" });
  });

  it("lifts the revocation when the reservation comes back, with the same code", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    service.applyStay({ ...STAY, revision: 2, state: "cancelled" }, DURING);
    const back = service.applyStay({ ...STAY, revision: 3 }, DURING).access!;
    expect(back.revokedAt).toBeNull();
    expect(back.code).toBe(access.code);
  });

  it("does nothing for a cancellation of something it never had", () => {
    const { service } = start();
    expect(service.applyStay({ ...STAY, state: "deleted" }, DURING).skipped).toBe("already_gone");
    expect(service.list()).toHaveLength(0);
  });

  it("refuses a stay with no window rather than inventing one", () => {
    const { service } = start();
    expect(service.applyStay({ ...STAY, startsAt: null }, DURING).skipped).toBe("no_window");
    expect(service.list()).toHaveLength(0);
  });

  it("falls back to the reservation number when the guest has no name", () => {
    const { service } = start();
    const { access } = service.applyStay({ ...STAY, guestName: null }, DURING);
    expect(access?.label).toBe("Séjour 202609042");
  });

  it("leaves a hand-made prolongation standing when the stay moves", () => {
    const { service } = start();
    const access = service.applyStay(STAY, DURING).access!;
    service.edit(access.id, { extendedUntil: "2026-09-14T11:00" }, "adrien");

    const moved = service.applyStay(
      { ...STAY, revision: 2, endsAt: "2026-09-12T09:00:00.000Z" },
      DURING,
    ).access!;
    expect(moved.extendedUntil).toBe("2026-09-14T09:00:00.000Z");
  });

  it("does not touch a hand-made access, whatever guestFlow says", () => {
    const { service } = start();
    const manual = service.createManual({ label: "Voisin" }, "adrien").access!;
    service.applyStay(STAY, DURING);
    expect(service.get(manual.id)?.label).toBe("Voisin");
    expect(service.list()).toHaveLength(2);
  });
});
