import { describe, it, expect, vi, beforeEach } from "vitest";
import { Gate, DEVICE_ID, describeDevice, REQUESTS_KEY } from "./gate.js";

const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

function makeGate(answerMs = 50) {
  const data: Array<Record<string, unknown>> = [];
  const statuses: string[] = [];
  const deviceManager = {
    upsertFromDiscovery: vi.fn(),
    updateDeviceData: (_i: string, _d: string, payload: Record<string, unknown>) => {
      data.push(payload);
    },
    updateDeviceStatus: (_i: string, _d: string, status: string) => {
      statuses.push(status);
    },
  };
  const gate = new Gate({
    integrationId: "guest-access",
    deviceManager,
    logger: silent,
    answerMs,
  });
  return { gate, data, statuses, deviceManager };
}

const press = { accessId: "a1", label: "Camille", stay: "Le Gîte · 202609042" };

describe("the device", () => {
  it("still carries what the recipe binds to", () => {
    const device = describeDevice() as {
      data: Array<{ key: string }>;
      orders: Array<{ key: string; enumValues: string[] }>;
    };
    expect(device.data.map((d) => d.key)).toEqual(
      expect.arrayContaining(["requests", "last_request_at", "last_stay", "link"]),
    );
    const orders = device.orders.map((o) => o.key);
    expect(orders).toEqual(expect.arrayContaining(["result", "gate_state"]));
  });

  it("is online as soon as the plugin runs — nothing has to be reached", () => {
    const { gate, statuses, deviceManager } = makeGate();
    gate.start();
    expect(deviceManager.upsertFromDiscovery).toHaveBeenCalledWith(
      "guest-access",
      "guest-access",
      expect.any(Object),
    );
    expect(statuses).toEqual(["online"]);
  });
});

describe("a press", () => {
  let harness: ReturnType<typeof makeGate>;
  beforeEach(() => {
    harness = makeGate();
    harness.gate.start();
  });

  it("moves the counter last, once everything the recipe reads is in place", async () => {
    const pending = harness.gate.press(press);
    const published = harness.data.at(-1)!;
    expect(Object.keys(published).at(-1)).toBe(REQUESTS_KEY);
    expect(published[REQUESTS_KEY]).toBe(1);
    expect(published.last_stay).toBe("Le Gîte · 202609042");
    harness.gate.reportResult("opened");
    await expect(pending).resolves.toBe("opened");
  });

  it("counts up, never repeating a value", async () => {
    const first = harness.gate.press(press);
    harness.gate.reportResult("opened");
    await first;
    const second = harness.gate.press({ ...press, accessId: "a2" });
    harness.gate.reportResult("opened");
    await second;
    const counters = harness.data
      .filter((d) => REQUESTS_KEY in d)
      .map((d) => d[REQUESTS_KEY]);
    expect(counters).toEqual([1, 2]);
  });

  it("turns each of the recipe's answers into what the guest is told", async () => {
    for (const [answer, expected] of [
      ["opened", "opened"],
      ["already_open", "opened"],
      ["refused", "refused_by_house"],
      ["error", "gate_error"],
    ] as const) {
      const pending = harness.gate.press(press);
      harness.gate.reportResult(answer);
      await expect(pending).resolves.toBe(expected);
    }
  });

  it("says so when nothing answers — a recipe nobody bound is the usual cause", async () => {
    const pending = harness.gate.press(press);
    await expect(pending).resolves.toBe("no_answer");
  });

  it("absorbs a thumb that slipped, and serves both callers the same answer", async () => {
    const first = harness.gate.press(press);
    const second = harness.gate.press(press);
    harness.gate.reportResult("opened");
    await expect(first).resolves.toBe("opened");
    await expect(second).resolves.toBe("opened");
    // One press reached the recipe, not two.
    expect(harness.data.filter((d) => REQUESTS_KEY in d)).toHaveLength(1);
  });

  it("still lets a guest close the gate behind them", async () => {
    const first = harness.gate.press(press);
    harness.gate.reportResult("opened");
    await first;
    // A second, deliberate press — the same gesture the remote it replaces has.
    const second = harness.gate.press(press);
    harness.gate.reportResult("opened");
    await expect(second).resolves.toBe("opened");
    expect(harness.data.filter((d) => REQUESTS_KEY in d)).toHaveLength(2);
  });

  it("queues two guests rather than racing them", async () => {
    const first = harness.gate.press(press);
    const second = harness.gate.press({ ...press, accessId: "a2" });
    // Only the first has reached the recipe so far.
    expect(harness.data.filter((d) => REQUESTS_KEY in d)).toHaveLength(1);
    harness.gate.reportResult("opened");
    await expect(first).resolves.toBe("opened");
    await new Promise((r) => setTimeout(r, 1));
    expect(harness.data.filter((d) => REQUESTS_KEY in d)).toHaveLength(2);
    harness.gate.reportResult("refused");
    await expect(second).resolves.toBe("refused_by_house");
  });

  it("tells the fifth caller to wait rather than growing a queue", async () => {
    const pending = [
      harness.gate.press({ ...press, accessId: "a1" }),
      harness.gate.press({ ...press, accessId: "a2" }),
      harness.gate.press({ ...press, accessId: "a3" }),
    ];
    await expect(harness.gate.press({ ...press, accessId: "a4" })).resolves.toBe("gate_busy");
    harness.gate.reportResult("opened");
    await Promise.all(pending.map((p) => p.catch(() => undefined)));
  });

  it("drops an answer that belongs to nothing, and says why", () => {
    const warned: unknown[] = [];
    const deviceManager = {
      upsertFromDiscovery: vi.fn(),
      updateDeviceData: vi.fn(),
      updateDeviceStatus: vi.fn(),
    };
    const gate = new Gate({
      integrationId: "guest-access",
      deviceManager,
      logger: { ...silent, warn: (obj) => warned.push(obj) },
    });
    gate.start();
    // Resolving the wrong press would tell a guest their gate opened when it
    // did not, so an unattributable answer is refused rather than guessed.
    gate.reportResult("opened");
    expect(warned).toEqual([{ outcome: "opened" }]);
  });
});
