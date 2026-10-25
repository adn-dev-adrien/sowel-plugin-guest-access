import { describe, it, expect } from "vitest";
import type { Access } from "./model.js";
import {
  decide,
  effectiveWindow,
  hasEnded,
  hourCheck,
  validateEarlyOpen,
  validateExtension,
  validateRange,
  normalizeTimeWindows,
  validateTimeWindows,
} from "./validity.js";

const NONE = { accessOpensLastHour: 0, gateOpensLastHour: 0 };

function access(over: Partial<Access> = {}): Access {
  return {
    id: "a1",
    kind: "stay",
    label: "Camille",
    gates: ["main"],
    code: "4K7M9QT2",
    source: {
      system: "guestflow",
      reservationId: 42,
      reservationNumber: "202609042",
      property: "Le Gîte",
      revision: 1,
    },
    stayWindow: { from: "2026-09-04T16:00:00.000Z", to: "2026-09-11T09:00:00.000Z" },
    validFrom: null,
    validUntil: null,
    earlyOpenedAt: null,
    extendedUntil: null,
    timeWindows: [],
    suspendedAt: null,
    revokedAt: null,
    devices: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    createdBy: "guestflow",
    updatedAt: "2026-09-01T10:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
    ...over,
  };
}

describe("the window in force", () => {
  it("is the stay's own, with nothing overriding it", () => {
    const w = effectiveWindow(access());
    expect(w.from?.toISOString()).toBe("2026-09-04T16:00:00.000Z");
    expect(w.to?.toISOString()).toBe("2026-09-11T09:00:00.000Z");
  });

  it("widens, and only widens", () => {
    const early = access({ earlyOpenedAt: "2026-09-04T10:00:00.000Z" });
    expect(effectiveWindow(early).from?.toISOString()).toBe("2026-09-04T10:00:00.000Z");

    // An override that would SHORTEN the stay is simply not the widest, so it
    // cannot cut the access behind the owner's back.
    const late = access({ earlyOpenedAt: "2026-09-05T10:00:00.000Z" });
    expect(effectiveWindow(late).from?.toISOString()).toBe("2026-09-04T16:00:00.000Z");

    const extended = access({ extendedUntil: "2026-09-13T09:00:00.000Z" });
    expect(effectiveWindow(extended).to?.toISOString()).toBe("2026-09-13T09:00:00.000Z");
  });

  it("survives the stay moving under an extension", () => {
    // The reservation is pushed back a day; the hand-made prolongation stands.
    const moved = access({
      stayWindow: { from: "2026-09-05T16:00:00.000Z", to: "2026-09-12T09:00:00.000Z" },
      extendedUntil: "2026-09-13T09:00:00.000Z",
    });
    expect(effectiveWindow(moved).to?.toISOString()).toBe("2026-09-13T09:00:00.000Z");
  });

  it("is open at both ends for a permanent manual access", () => {
    const w = effectiveWindow(access({ kind: "manual", source: null, stayWindow: null }));
    expect(w.from).toBeNull();
    expect(w.to).toBeNull();
  });
});

describe("deciding a press", () => {
  const during = new Date("2026-09-06T12:00:00.000Z");

  it("lets a live stay through", () => {
    expect(decide(access(), during, NONE)).toEqual({ ok: true });
  });

  it("answers the owner's decisions first, and names them", () => {
    expect(decide(access({ revokedAt: "2026-09-05T00:00:00.000Z" }), during, NONE)).toMatchObject({
      reason: "revoked",
    });
    expect(decide(access({ suspendedAt: "2026-09-05T00:00:00.000Z" }), during, NONE)).toMatchObject(
      { reason: "suspended" },
    );
  });

  it("says WHEN a stay that has not started will start", () => {
    const early = new Date("2026-09-03T12:00:00.000Z");
    expect(decide(access(), early, NONE)).toEqual({
      ok: false,
      reason: "not_yet_active",
      activeAt: "2026-09-04T16:00:00.000Z",
    });
  });

  it("says a finished stay has expired", () => {
    const late = new Date("2026-09-12T12:00:00.000Z");
    expect(decide(access(), late, NONE)).toMatchObject({ reason: "expired" });
  });

  it("says when the next allowed hour is, rather than just refusing", () => {
    const nightly = access({ timeWindows: [{ from: "08:00", to: "20:00" }] });
    // 23:00 Paris on 6 September.
    const night = new Date("2026-09-06T21:00:00.000Z");
    expect(decide(nightly, night, NONE)).toEqual({
      ok: false,
      reason: "outside_hours",
      nextOpeningAt: "08:00",
      // 6 September 2026 is a Sunday: the next opening is Monday's.
      nextOpeningDay: 1,
    });
  });

  it("counts the ceilings at both levels", () => {
    expect(
      decide(access(), during, { accessOpensLastHour: 12, gateOpensLastHour: 12 }),
    ).toMatchObject({ reason: "too_many_opens" });
    expect(
      decide(access(), during, { accessOpensLastHour: 1, gateOpensLastHour: 30 }),
    ).toMatchObject({ reason: "too_many_opens" });
  });

  it("lets a permanent access through at any hour", () => {
    const neighbour = access({
      kind: "manual",
      source: null,
      stayWindow: null,
      label: "Voisin",
    });
    expect(decide(neighbour, new Date("2027-02-03T03:00:00.000Z"), NONE)).toEqual({ ok: true });
  });
});

describe("the hours of the day", () => {
  it("is any hour when no window is set", () => {
    expect(hourCheck([], new Date())).toEqual({ ok: true });
  });

  it("reads the Paris clock, not UTC", () => {
    // 07:30 UTC in July is 09:30 in Paris — inside 08:00 → 20:00.
    expect(hourCheck([{ from: "08:00", to: "20:00" }], new Date("2026-07-06T07:30:00Z"))).toEqual({
      ok: true,
    });
    // 21:30 UTC is 23:30 in Paris — outside.
    expect(
      hourCheck([{ from: "08:00", to: "20:00" }], new Date("2026-07-06T21:30:00Z")),
    ).toMatchObject({ reason: "outside_hours" });
  });

  it("points at the next window of the day, or tomorrow's first", () => {
    const windows = [
      { from: "08:00", to: "12:00" },
      { from: "14:00", to: "18:00" },
    ];
    // 13:00 Paris → next is 14:00.
    expect(hourCheck(windows, new Date("2026-01-06T12:00:00Z"))).toMatchObject({
      nextOpeningAt: "14:00",
    });
    // 22:00 Paris → next is tomorrow's 08:00.
    expect(hourCheck(windows, new Date("2026-01-06T21:00:00Z"))).toMatchObject({
      nextOpeningAt: "08:00",
    });
  });
});

describe("what the owner may write", () => {
  it("refuses a window that ends before it starts, and one that crosses midnight", () => {
    expect(validateTimeWindows([{ from: "20:00", to: "08:00" }])).toMatchObject({
      code: "end_before_start",
    });
    expect(validateTimeWindows([{ from: "08:00", to: "08:00" }])).toMatchObject({
      code: "end_before_start",
    });
  });

  it("refuses two windows that overlap", () => {
    expect(
      validateTimeWindows([
        { from: "08:00", to: "12:00" },
        { from: "11:00", to: "14:00" },
      ]),
    ).toMatchObject({ code: "overlap" });
  });

  it("accepts windows that merely touch", () => {
    expect(
      validateTimeWindows([
        { from: "08:00", to: "12:00" },
        { from: "12:00", to: "14:00" },
      ]),
    ).toBeNull();
  });

  it("refuses what is not a time at all", () => {
    expect(validateTimeWindows([{ from: "huit", to: "20:00" }])).toMatchObject({
      code: "bad_time",
    });
    expect(validateTimeWindows("08:00")).toMatchObject({ code: "not_a_list" });
  });

  it("refuses a range that ends before it starts", () => {
    expect(validateRange(new Date("2026-09-10T00:00:00Z"), new Date("2026-09-01T00:00:00Z")))
      .toMatchObject({ code: "end_before_start" });
    expect(validateRange(new Date("2026-09-01T00:00:00Z"), null)).toBeNull();
  });

  it("refuses an « early opening » that is not earlier", () => {
    expect(validateEarlyOpen(access(), new Date("2026-09-05T00:00:00Z"))).toMatchObject({
      code: "not_earlier",
    });
    expect(validateEarlyOpen(access(), new Date("2026-09-04T09:00:00Z"))).toBeNull();
  });

  it("refuses a « prolongation » that shortens — that is a suspension", () => {
    expect(validateExtension(access(), new Date("2026-09-10T00:00:00Z"))).toMatchObject({
      code: "not_later",
    });
    expect(validateExtension(access(), new Date("2026-09-13T00:00:00Z"))).toBeNull();
  });
});

describe("an access that has run its course", () => {
  it("has ended once its widest end is past", () => {
    expect(hasEnded(access(), new Date("2026-09-12T00:00:00Z"))).toBe(true);
    expect(hasEnded(access(), new Date("2026-09-10T00:00:00Z"))).toBe(false);
    expect(
      hasEnded(access({ kind: "manual", stayWindow: null }), new Date("2030-01-01T00:00:00Z")),
    ).toBe(false);
  });
});

describe("days of the week on the hours", () => {
  // 2026-01-06 is a Tuesday; Paris is UTC+1 in January.
  const friday = [{ from: "18:00", to: "22:00", days: [5] }];
  const at = (iso: string) => new Date(iso);

  it("opens on the named day, inside the hours", () => {
    expect(hourCheck(friday, at("2026-01-09T18:30:00Z"))).toEqual({ ok: true }); // Fri 19:30
  });

  it("refuses the same hours on another day, and names the day to come back", () => {
    // Thu 19:30 Paris → tomorrow.
    expect(hourCheck(friday, at("2026-01-08T18:30:00Z"))).toEqual({
      ok: false,
      reason: "outside_hours",
      nextOpeningAt: "18:00",
      nextOpeningDay: 5,
    });
    // Sat 19:30 → next Friday, six days on.
    expect(hourCheck(friday, at("2026-01-10T18:30:00Z"))).toMatchObject({ nextOpeningDay: 5 });
  });

  it("on the right day but past the hours, waits for next week's, not today's", () => {
    // Fri 23:00 Paris.
    expect(hourCheck(friday, at("2026-01-09T22:00:00Z"))).toMatchObject({
      nextOpeningAt: "18:00",
      nextOpeningDay: 5,
    });
  });

  it("keeps a window with no days, or with an empty list, on every day", () => {
    expect(hourCheck([{ from: "08:00", to: "20:00" }], at("2026-01-10T12:00:00Z"))).toEqual({ ok: true });
  });

  it("reads the Paris weekday, not the UTC one", () => {
    // Fri 23:30 UTC is already Saturday 00:30 in Paris.
    const sat = [{ from: "00:00", to: "01:00", days: [6] }];
    expect(hourCheck(sat, at("2026-01-09T23:30:00Z"))).toEqual({ ok: true });
  });

  it("lets two windows overlap in hours when they share no day", () => {
    expect(
      validateTimeWindows([
        { from: "08:00", to: "12:00", days: [2] },
        { from: "10:00", to: "14:00", days: [5] },
      ]),
    ).toBeNull();
  });

  it("refuses an overlap on a shared day, and an absent `days` shares them all", () => {
    expect(
      validateTimeWindows([
        { from: "08:00", to: "12:00", days: [2, 5] },
        { from: "10:00", to: "14:00", days: [5] },
      ]),
    ).toMatchObject({ code: "overlap" });
    expect(
      validateTimeWindows([
        { from: "08:00", to: "12:00" },
        { from: "10:00", to: "14:00", days: [3] },
      ]),
    ).toMatchObject({ code: "overlap" });
  });

  it("refuses no day at all, rather than reading it as every day", () => {
    for (const days of [[], [0], [8], [1.5], "5", [null]]) {
      expect(validateTimeWindows([{ from: "08:00", to: "12:00", days }])).toMatchObject({
        code: "bad_days",
      });
    }
  });

  it("stores days sorted and unique, and all seven as no days", () => {
    expect(normalizeTimeWindows([{ from: "18:00", to: "22:00", days: [7, 5, 5] }])).toEqual([
      { from: "18:00", to: "22:00", days: [5, 7] },
    ]);
    expect(
      normalizeTimeWindows([{ from: "08:00", to: "20:00", days: [1, 2, 3, 4, 5, 6, 7] }]),
    ).toEqual([{ from: "08:00", to: "20:00" }]);
  });
});
