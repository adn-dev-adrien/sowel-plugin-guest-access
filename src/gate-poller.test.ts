import { describe, expect, it, vi } from "vitest";
import { GatePoller, describeDevice, DEVICE_ID, REQUESTS_KEY } from "./gate-poller.js";
import type { GateRequest } from "./gate-poller.js";

// The poller is the whole plugin: everything else is wiring. These tests pin the
// three things that would be invisible in production until they hurt — the counter
// that a recipe triggers on, the state that travels on the query string, and the
// outcome that must never be attributed to the wrong request.

// Response factories receive the init, because a fake fetch that ignores the abort
// signal is not a fake fetch: `stop()` awaits the in-flight request, and a promise
// that never settles hangs the whole worker. The real one rejects on abort.
function harness(responses: Array<(init?: RequestInit) => unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const data: Array<Record<string, unknown>> = [];
  const statuses: string[] = [];
  const discovered: unknown[] = [];
  const events: Array<Record<string, unknown>> = [];
  const logs: Array<{ level: string; obj: unknown }> = [];
  const sleeps: number[] = [];

  let index = 0;
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const value = next(init);
    if (value instanceof Error) throw value;
    return value as Response;
  }) as unknown as typeof fetch;

  const poller = new GatePoller({
    integrationId: "guest-access",
    baseUrl: "http://guestflow.test:4000/",
    apiKey: "the-house-key",
    waitSeconds: 25,
    deviceManager: {
      upsertFromDiscovery: (_i, _s, d) => discovered.push(d),
      updateDeviceData: (_i, _d, payload) => data.push(payload),
      updateDeviceStatus: (_i, _d, status) => statuses.push(status),
    },
    eventBus: { emit: (e) => events.push(e) },
    logger: {
      info: (obj) => logs.push({ level: "info", obj }),
      debug: (obj) => logs.push({ level: "debug", obj }),
      warn: (obj) => logs.push({ level: "warn", obj }),
      error: (obj) => logs.push({ level: "error", obj }),
    },
    fetchImpl,
    // Records the delay, and YIELDS A MACROTASK. Resolving in the same microtask
    // would let the retry loop spin without ever giving the test's own timer a
    // chance to fire — an infinite loop that kills the worker rather than failing.
    sleep: (ms) => {
      sleeps.push(ms);
      return new Promise((done) => setTimeout(done, 0));
    },
  });

  return { poller, calls, data, statuses, discovered, events, logs, sleeps };
}

const ok = (body: unknown) =>
  () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** Answers nothing, and rejects the way fetch does when the caller aborts. */
const hangs = (init?: RequestInit) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      reject(err);
    });
  }) as unknown as Response;
const quiet = ok({ request: null });
const refused = () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response;

const REQUEST: GateRequest = {
  id: 42,
  reservationId: 7,
  reservationNumber: "202609042",
  propertyName: "Le Gîte",
  requestedAt: "2026-09-10 15:25:00",
};

/** Lets the poller's loop turn a few times. */
const settle = () => new Promise((done) => setTimeout(done, 5));

describe("the device it exposes", () => {
  it("carries a COUNTER for the recipe to trigger on, not a flag", () => {
    const keys = (describeDevice().data as Array<{ key: string; type: string }>);
    const counter = keys.find((d) => d.key === REQUESTS_KEY);
    expect(counter).toBeDefined();
    expect(counter!.type).toBe("number");
    // A boolean or a timestamp would make the recipe guess: `equipment.data.changed`
    // re-fires with unchanged values, and a counter never repeats one.
  });

  it("carries the two orders the recipe answers with", () => {
    const orders = describeDevice().orders as Array<{ key: string; enumValues: string[] }>;
    expect(orders.map((o) => o.key).sort()).toEqual(["gate_state", "result"]);
    expect(orders.find((o) => o.key === "result")!.enumValues).toContain("opened");
    expect(orders.find((o) => o.key === "gate_state")!.enumValues).toEqual(["open", "closed", "unknown"]);
  });
});

describe("polling", () => {
  it("declares the device, then reports the link once GuestFlow answers", async () => {
    const h = harness([quiet]);
    h.poller.start();
    expect(h.discovered).toHaveLength(1);
    expect(h.data[0]).toEqual({ link: false });

    await settle();
    await h.poller.stop();

    expect(h.statuses).toContain("online");
    expect(h.events.some((e) => e.type === "system.integration.connected")).toBe(true);
  });

  it("asks with the key, the wait and the gate state — the state is why GuestFlow can label the button", async () => {
    const h = harness([quiet]);
    h.poller.setGateState("closed");
    h.poller.start();
    await settle();
    await h.poller.stop();

    const url = h.calls[0].url;
    expect(url).toBe("http://guestflow.test:4000/public/v1/gate/requests?wait=25&state=closed");
    const headers = h.calls[0].init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer the-house-key");
  });

  it("follows the state the recipe pushes, on the NEXT poll", async () => {
    const h = harness([quiet]);
    h.poller.start();
    await settle();
    h.poller.setGateState("open");
    await settle();
    await h.poller.stop();

    expect(h.calls[0].url).toContain("state=unknown");
    expect(h.calls.some((c) => c.url.includes("state=open"))).toBe(true);
  });

  it("a quiet answer publishes nothing — it is the common case, not an event", async () => {
    const h = harness([quiet]);
    h.poller.start();
    await settle();
    await h.poller.stop();

    const payloads = h.data.filter((p) => REQUESTS_KEY in p);
    expect(payloads).toHaveLength(0);
  });

  it("a request bumps the counter and names the stay", async () => {
    const h = harness([ok({ request: REQUEST }), quiet]);
    h.poller.start();
    await settle();
    await h.poller.stop();

    const published = h.data.find((p) => REQUESTS_KEY in p)!;
    expect(published[REQUESTS_KEY]).toBe(1);
    expect(published.last_stay).toBe("Le Gîte · 202609042");
    expect(published.last_request_at).toBe("2026-09-10 15:25:00");
  });

  it("never publishes the same counter value twice", async () => {
    const h = harness([ok({ request: REQUEST }), ok({ request: { ...REQUEST, id: 43 } }), quiet]);
    h.poller.start();
    await settle();
    await h.poller.stop();

    const counters = h.data.filter((p) => REQUESTS_KEY in p).map((p) => p[REQUESTS_KEY]);
    expect(counters).toEqual([1, 2]);
  });

  it("a request with no lodging still names something the log can print", async () => {
    const bare = { ...REQUEST, propertyName: null, reservationNumber: null };
    const h = harness([ok({ request: bare }), quiet]);
    h.poller.start();
    await settle();
    await h.poller.stop();

    expect(h.data.find((p) => REQUESTS_KEY in p)!.last_stay).toBe("séjour inconnu");
  });
});

describe("pacing", () => {
  it("a server that answers instantly is paced, not hammered", async () => {
    // The normal case is a connection held for 25 s, so this floor is never
    // reached. It exists for the proxy that does not hold it — without it the
    // loop polls as fast as the network allows. The first version of this suite
    // proved it the hard way: four gigabytes of heap in seventeen seconds.
    const h = harness([quiet]);
    h.poller.start();
    await new Promise((done) => setTimeout(done, 30));
    await h.poller.stop();

    expect(h.sleeps.length).toBeGreaterThan(0);
    expect(Math.max(...h.sleeps)).toBeLessThanOrEqual(1000);
    expect(h.calls.length).toBeLessThan(60);
  });

  it("declares the device offline before the first contact, and says nothing on the bus", async () => {
    const h = harness([hangs]);
    h.poller.start();
    await settle();

    expect(h.statuses[0]).toBe("offline");
    // A starting point is not a disconnection: the UI must not flash an error
    // before the first poll has even come back (spec 116).
    expect(h.events).toHaveLength(0);
    await h.poller.stop();
  });
});

describe("when GuestFlow is unreachable", () => {
  it("marks the link down and backs off, capped", async () => {
    const h = harness([refused]);
    h.poller.start();
    await new Promise((done) => setTimeout(done, 20));
    await h.poller.stop();

    expect(h.statuses).toContain("offline");
    expect(h.sleeps[0]).toBe(2000);
    // Doubling, and never past a minute: a guestFlow down for an hour must not be
    // hammered, and must be picked up within a minute of coming back.
    expect(Math.max(...h.sleeps)).toBeLessThanOrEqual(60000);
    expect(h.logs.some((l) => l.level === "error")).toBe(true);
  });

  it("a thrown fetch is handled exactly like a refusal", async () => {
    const h = harness([() => new Error("ECONNREFUSED")]);
    h.poller.start();
    await new Promise((done) => setTimeout(done, 20));
    await h.poller.stop();

    expect(h.statuses).toContain("offline");
    expect(h.sleeps.length).toBeGreaterThan(0);
  });

  it("recovering resets the delay, so a blip does not cost a minute", async () => {
    let phase = 0;
    const h = harness([
      () => {
        phase += 1;
        if (phase <= 2) return refused();
        return { ok: true, status: 200, json: async () => ({ request: null }) } as unknown as Response;
      },
    ]);
    h.poller.start();
    await new Promise((done) => setTimeout(done, 30));
    await h.poller.stop();

    expect(h.sleeps.slice(0, 2)).toEqual([2000, 4000]);
    expect(h.statuses).toContain("online");
  });
});

describe("reporting the outcome", () => {
  it("posts it against the request that was handed over", async () => {
    const h = harness([ok({ request: REQUEST }), quiet]);
    h.poller.start();
    await settle();
    await h.poller.report("opened");
    await h.poller.stop();

    const post = h.calls.find((c) => c.init?.method === "POST")!;
    expect(post.url).toBe("http://guestflow.test:4000/public/v1/gate/requests/42/result");
    expect(JSON.parse(String(post.init!.body))).toEqual({ status: "opened" });
  });

  it("carries a detail when the recipe gives one", async () => {
    const h = harness([ok({ request: REQUEST }), quiet]);
    h.poller.start();
    await settle();
    await h.poller.report("refused", "accès invités désarmé");
    await h.poller.stop();

    const post = h.calls.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({
      status: "refused",
      detail: "accès invités désarmé",
    });
  });

  it("refuses to guess when nothing is in flight", async () => {
    const h = harness([quiet]);
    h.poller.start();
    await settle();
    await h.poller.report("opened");
    await h.poller.stop();

    expect(h.calls.some((c) => c.init?.method === "POST")).toBe(false);
    expect(h.logs.some((l) => l.level === "warn")).toBe(true);
    // Resolving the wrong request would tell a guest their gate opened when it did not.
  });

  it("answers a request once: a second report has nothing to attribute", async () => {
    const h = harness([ok({ request: REQUEST }), quiet]);
    h.poller.start();
    await settle();
    await h.poller.report("opened");
    await h.poller.report("error");
    await h.poller.stop();

    expect(h.calls.filter((c) => c.init?.method === "POST")).toHaveLength(1);
  });

  it("a refusal from GuestFlow is logged, not thrown — the gate has already moved", async () => {
    let call = 0;
    const h = harness([
      () => {
        call += 1;
        if (call === 1) return { ok: true, status: 200, json: async () => ({ request: REQUEST }) } as unknown as Response;
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      },
    ]);
    h.poller.start();
    await settle();
    await expect(h.poller.report("opened")).resolves.toBeUndefined();
    await h.poller.stop();
    expect(h.logs.some((l) => l.level === "error")).toBe(true);
  });
});

describe("stopping", () => {
  it("takes the link down and stops asking", async () => {
    const h = harness([quiet]);
    h.poller.start();
    await settle();
    const before = h.calls.length;
    await h.poller.stop();
    await new Promise((done) => setTimeout(done, 20));

    expect(h.calls.length).toBeLessThanOrEqual(before + 1);
    expect(h.statuses[h.statuses.length - 1]).toBe("offline");
    expect(h.events.some((e) => e.type === "system.integration.disconnected")).toBe(true);
  });

  it("an abort during stop is not an error — it is how a long poll ends", async () => {
    const h = harness([hangs]);
    h.poller.start();
    await settle();
    await h.poller.stop();

    expect(h.logs.filter((l) => l.level === "error")).toHaveLength(0);
  });

  it("starting twice keeps one loop", async () => {
    const h = harness([quiet]);
    h.poller.start();
    h.poller.start();
    await settle();
    await h.poller.stop();
    expect(h.discovered).toHaveLength(1);
  });
});
