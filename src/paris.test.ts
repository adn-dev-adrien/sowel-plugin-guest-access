import { describe, it, expect } from "vitest";
import {
  instantOfWallClock,
  minutesOfDay,
  offsetMs,
  parseHhMm,
  parseWallClock,
  toWallClockInput,
  wallClockAt,
} from "./paris.js";

/**
 * The two Sundays a year are the whole point of this file: a window that is
 * right in February and an hour out in July is a gate that opens an hour late
 * for a guest standing in front of it.
 */
describe("the Paris wall clock", () => {
  it("knows winter from summer", () => {
    expect(offsetMs(new Date("2026-01-15T12:00:00Z"))).toBe(3600_000);
    expect(offsetMs(new Date("2026-07-15T12:00:00Z"))).toBe(2 * 3600_000);
  });

  it("round-trips an ordinary hour", () => {
    const instant = instantOfWallClock({ year: 2026, month: 9, day: 4, hour: 18, minute: 0 });
    expect(instant.toISOString()).toBe("2026-09-04T16:00:00.000Z");
    expect(wallClockAt(instant)).toEqual({ year: 2026, month: 9, day: 4, hour: 18, minute: 0 });
  });

  it("round-trips across the spring transition", () => {
    // 2026-03-29: 02:00 → 03:00. 11:00 that morning is 09:00 UTC, not 10:00.
    const instant = instantOfWallClock({ year: 2026, month: 3, day: 29, hour: 11, minute: 0 });
    expect(instant.toISOString()).toBe("2026-03-29T09:00:00.000Z");
  });

  it("round-trips across the autumn transition", () => {
    // 2026-10-25: 03:00 → 02:00. 11:00 that morning is 10:00 UTC.
    const instant = instantOfWallClock({ year: 2026, month: 10, day: 25, hour: 11, minute: 0 });
    expect(instant.toISOString()).toBe("2026-10-25T10:00:00.000Z");
  });

  it("resolves an hour that does not exist, rather than throwing", () => {
    // 02:30 on the spring Sunday never happens.
    const instant = instantOfWallClock({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 });
    expect(Number.isNaN(instant.getTime())).toBe(false);
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("reads an owner's input, and writes it back unchanged", () => {
    const instant = parseWallClock("2026-12-24T17:30");
    expect(instant?.toISOString()).toBe("2026-12-24T16:30:00.000Z");
    expect(toWallClockInput(instant!.toISOString())).toBe("2026-12-24T17:30");
  });

  it("refuses what is not a wall clock", () => {
    for (const bad of ["", "today", "2026-13-01T10:00", "2026-01-01T25:00", 42, null]) {
      expect(parseWallClock(bad)).toBeNull();
    }
  });

  it("counts minutes on the Paris clock, not on UTC", () => {
    // 00:30 Paris in July is 22:30 UTC the day before.
    expect(minutesOfDay(new Date("2026-07-14T22:30:00Z"))).toBe(30);
  });

  it("reads a time of day", () => {
    expect(parseHhMm("08:00")).toBe(480);
    expect(parseHhMm("8:05")).toBe(485);
    expect(parseHhMm("24:00")).toBeNull();
    expect(parseHhMm("08:60")).toBeNull();
    expect(parseHhMm("huit heures")).toBeNull();
  });
});
