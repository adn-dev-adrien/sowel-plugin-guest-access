// The gates — one list of people per thing that opens (spec §1.bis).

import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import { Gates, deviceIdFor } from "./gates.js";
import { DEVICE_ID } from "./gate.js";

const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A device manager that, like the core's, files each device under its friendlyName. */
function makeGates(dir = mkdtempSync(resolve(tmpdir(), "guest-access-gates-"))) {
  dirs.push(dir);
  const devices = new Map<string, Array<Record<string, unknown>>>();
  const statuses = new Map<string, string>();
  const deviceManager = {
    upsertFromDiscovery: vi.fn((_i: string, _s: string, d: Record<string, unknown>) => {
      devices.set(d.friendlyName as string, []);
    }),
    updateDeviceData: (_i: string, id: string, payload: Record<string, unknown>) => {
      devices.get(id)?.push(payload);
    },
    updateDeviceStatus: (_i: string, id: string, status: string) => {
      statuses.set(id, status);
    },
  };
  const store = new AccessStore(dir, silent);
  const gates = new Gates({ integrationId: "guest-access", deviceManager, logger: silent, store, answerMs: 40 });
  return { gates, store, devices, statuses, dir };
}

describe("the gates", () => {
  it("starts with the device every installation already had, under its old name", () => {
    const { gates, devices } = makeGates();
    gates.start();
    expect(gates.list().map((g) => g.record)).toEqual([
      expect.objectContaining({ id: "main", deviceId: DEVICE_ID }),
    ]);
    // Nothing bound to « Accès invités » has to be bound again.
    expect([...devices.keys()]).toEqual([DEVICE_ID]);
  });

  it("adds a gate as its own device, started at once, with its own counter", () => {
    const { gates, devices, statuses } = makeGates();
    gates.start();
    const { record } = gates.add("Porte du garage");
    expect(record!.deviceId).toBe(deviceIdFor("Porte du garage"));
    expect(statuses.get(record!.deviceId)).toBe("online");
    // The resting counter, published on its own device and not the first one's.
    expect(devices.get(record!.deviceId)).toContainEqual({ requests: 0 });
    expect(gates.byDevice(record!.deviceId)).toBe(gates.get(record!.id));
  });

  it("keeps the gates across a restart", () => {
    const first = makeGates();
    const { record } = first.gates.add("Garage");
    const second = makeGates(first.dir);
    expect(second.gates.ids()).toEqual(["main", record!.id]);
  });

  it("refuses a name that is empty, too long, or already a gate", () => {
    const { gates } = makeGates();
    expect(gates.add("  ").refusal).toEqual({ field: "name", code: "required" });
    expect(gates.add("x".repeat(41)).refusal).toEqual({ field: "name", code: "too_long" });
    gates.add("Garage");
    expect(gates.add(" Garage ").refusal).toEqual({ field: "name", code: "taken" });
  });

  it("calls a gate by its equipment's name once the recipe has said it", () => {
    const { gates } = makeGates();
    const { record } = gates.add("Garage");
    expect(gates.label(record!.id)).toBe("Garage");
    gates.get(record!.id)!.setOpeningLabel("Porte du garage");
    expect(gates.label(record!.id)).toBe("Porte du garage");
    expect(gates.label("nope")).toBeNull();
  });

  it("marks a removed gate's device offline, and forgets it", () => {
    const { gates, statuses } = makeGates();
    gates.start();
    const { record } = gates.add("Garage");
    expect(gates.remove(record!.id, [["main"]])).toEqual({ ok: true });
    expect(statuses.get(record!.deviceId)).toBe("offline");
    expect(gates.get(record!.id)).toBeUndefined();
    expect(gates.remove(record!.id, [])).toEqual({ missing: true });
  });
});
