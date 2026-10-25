// The connector: both directions, over a fake guestFlow.

import { describe, it, expect, afterEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";
import { GuestFlowConnector, canonicalString, sign, stateOf } from "./guestflow.js";
import { makeHarness, STAY, type Harness } from "./serviceFixtures.js";
import { silent } from "./serviceFixtures.js";

let harness: Harness;

afterEach(() => {
  if (harness) rmSync(harness.dir, { recursive: true, force: true });
});

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function connect(
  answers: (url: string, init: RequestInit) => { status?: number; body?: unknown },
  opts: { baseUrl?: string } = {},
) {
  harness = makeHarness();
  const calls: Call[] = [];
  let cursor = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({
      url,
      method: init.method ?? "GET",
      headers,
      body: init.body ? JSON.parse(String(init.body)) : null,
    });
    const answer = answers(url, init);
    return {
      ok: (answer.status ?? 200) < 400,
      status: answer.status ?? 200,
      text: async () => JSON.stringify(answer.body ?? {}),
    };
  }) as unknown as typeof fetch;

  const connector = new GuestFlowConnector({
    service: harness.service,
    logger: silent,
    readCursor: () => cursor,
    writeCursor: (value) => {
      cursor = value;
    },
    fetchImpl,
  });
  connector.start({
    baseUrl: opts.baseUrl ?? "https://guestflow.example.com",
    apiKey: "key",
    signingSecret: "secret",
    pollSeconds: 3600,
    guestBaseUrl: "https://sowel.example.com",
    guestPath: "/p/guest-access/",
  });
  return { connector, calls, cursorOf: () => cursor, harness };
}

describe("reading guestFlow", () => {
  it("pulls the stays from the cursor and turns them into accesses", async () => {
    const { connector, calls, cursorOf, harness: h } = connect((url) =>
      url.includes("/stays")
        ? { body: { cursor: 7, hasMore: false, stays: [{ ...STAY, revision: 7 }] } }
        : { body: { ok: true } },
    );
    await connector.syncNow();

    expect(calls[0].url).toContain("/public/v1/gate/stays?since=0&limit=200");
    expect(h.service.list()).toHaveLength(1);
    expect(cursorOf()).toBe(7);
  });

  it("resumes where it left off, and does not replay what it has seen", async () => {
    let page = 0;
    const { connector, calls, harness: h } = connect((url) => {
      if (!url.includes("/stays")) return { body: {} };
      page++;
      return page === 1
        ? { body: { cursor: 3, hasMore: false, stays: [{ ...STAY, revision: 3 }] } }
        : { body: { cursor: 3, hasMore: false, stays: [] } };
    });
    await connector.syncNow();
    await connector.syncNow();

    expect(calls.filter((c) => c.url.includes("/stays")).at(-1)!.url).toContain("since=3");
    expect(h.service.list()).toHaveLength(1);
  });

  it("follows the pages while guestFlow says there are more", async () => {
    let page = 0;
    const { connector, calls } = connect((url) => {
      if (!url.includes("/stays")) return { body: {} };
      page++;
      return page === 1
        ? { body: { cursor: 1, hasMore: true, stays: [{ ...STAY, revision: 1 }] } }
        : { body: { cursor: 2, hasMore: false, stays: [{ ...STAY, revision: 2, reservationId: 43 }] } };
    });
    await connector.syncNow();
    expect(calls.filter((c) => c.url.includes("/stays"))).toHaveLength(2);
  });
});

describe("writing back to guestFlow", () => {
  it("pushes the invitation of every stay it configured", async () => {
    const { connector, calls } = connect((url) =>
      url.includes("/stays")
        ? { body: { cursor: 1, hasMore: false, stays: [{ ...STAY, revision: 1 }] } }
        : { body: { ok: true } },
    );
    await connector.syncNow();

    const push = calls.find((c) => c.url.includes("/invitations"))!;
    expect(push.method).toBe("POST");
    const invitation = (push.body as { invitations: Array<Record<string, unknown>> }).invitations[0];
    expect(invitation).toMatchObject({ reservationId: 42, state: expect.any(String) });
    expect(invitation.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(invitation.url).toContain("/p/guest-access/#i=");
  });

  it("keeps a failed push pending, and sends it on the next sync", async () => {
    let allowPush = false;
    const { connector, calls } = connect((url) => {
      if (url.includes("/stays")) {
        return { body: { cursor: 1, hasMore: false, stays: [{ ...STAY, revision: 1 }] } };
      }
      return allowPush ? { body: { ok: true } } : { status: 503, body: {} };
    });

    await connector.syncNow();
    expect(connector.state().pendingPushes).toBe(1);
    expect(connector.state().linked).toBe(false);

    allowPush = true;
    await connector.syncNow();
    expect(connector.state().pendingPushes).toBe(0);
    expect(connector.state().linked).toBe(true);
    expect(calls.filter((c) => c.url.includes("/invitations"))).toHaveLength(2);
  });

  it("tells guestFlow when an access it knows about is gone", async () => {
    // The fake honours the cursor, as guestFlow does: a stay is served once.
    const { connector, calls, harness: h } = connect((url) => {
      if (!url.includes("/stays")) return { body: { ok: true } };
      const since = Number(new URL(url).searchParams.get("since"));
      return {
        body: {
          cursor: 1,
          hasMore: false,
          stays: since < 1 ? [{ ...STAY, revision: 1 }] : [],
        },
      };
    });
    await connector.syncNow();

    const access = h.service.list()[0];
    h.service.delete(access.id, "adrien");
    connector.markDirty(access);
    await connector.syncNow();

    const last = calls.filter((c) => c.url.includes("/invitations")).at(-1)!;
    expect((last.body as { invitations: Array<{ state: string }> }).invitations[0]).toEqual({
      reservationId: 42,
      state: "deleted",
    });
  });

  it("pushes what it already holds the first time it comes up", async () => {
    harness = makeHarness();
    harness.service.applyStay(STAY);
    const calls: string[] = [];
    const connector = new GuestFlowConnector({
      service: harness.service,
      logger: silent,
      readCursor: () => 0,
      writeCursor: () => {},
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return { ok: true, status: 200, text: async () => JSON.stringify({ stays: [] }) };
      }) as unknown as typeof fetch,
    });
    connector.start({
      baseUrl: "https://guestflow.example.com",
      apiKey: "k",
      signingSecret: "s",
      pollSeconds: 3600,
      guestBaseUrl: null,
    });
    await connector.syncNow();
    expect(calls.some((url) => url.includes("/invitations"))).toBe(true);
  });
});

describe("the signature", () => {
  it("signs the method, the path with its query, the timestamp and the body", () => {
    const body = JSON.stringify({ invitations: [] });
    const canonical = canonicalString("POST", "/public/v1/gate/invitations", 1789000000000, body);
    expect(canonical.split("\n")).toEqual([
      "POST",
      "/public/v1/gate/invitations",
      "1789000000000",
      createHash("sha256").update(body).digest("hex"),
    ]);
    expect(sign(canonical, "secret")).toBe(
      createHmac("sha256", "secret").update(canonical).digest("hex"),
    );
  });

  it("carries the key, the timestamp and the signature on every call", async () => {
    const { connector, calls } = connect(() => ({ body: { stays: [] } }));
    await connector.syncNow();
    const call = calls[0];
    expect(call.headers.Authorization).toBe("Bearer key");
    expect(call.headers["X-Gate-Timestamp"]).toMatch(/^\d+$/);
    expect(call.headers["X-Gate-Signature"]).toMatch(/^[0-9a-f]{64}$/);

    // The signature is the one guestFlow will recompute from what it receives.
    const path = new URL(call.url).pathname + new URL(call.url).search;
    expect(call.headers["X-Gate-Signature"]).toBe(
      sign(
        canonicalString("GET", path, Number(call.headers["X-Gate-Timestamp"]), ""),
        "secret",
      ),
    );
  });

  it("never sends the secret itself", async () => {
    const { connector, calls } = connect(() => ({ body: { stays: [] } }));
    await connector.syncNow();
    expect(JSON.stringify(calls)).not.toContain("secret");
  });
});

describe("what it refuses to do", () => {
  it("does not reach guestFlow over plain HTTP", async () => {
    const { connector, calls } = connect(() => ({ body: {} }), {
      baseUrl: "http://guestflow.example.com",
    });
    await connector.syncNow();
    expect(calls).toHaveLength(0);
    expect(connector.state()).toMatchObject({ configured: false, lastError: "insecure_url" });
  });

  it("runs happily with no guestFlow at all", async () => {
    harness = makeHarness();
    const connector = new GuestFlowConnector({
      service: harness.service,
      logger: silent,
      readCursor: () => 0,
      writeCursor: () => {},
      fetchImpl: (async () => {
        throw new Error("should not be called");
      }) as unknown as typeof fetch,
    });
    connector.start(null);
    await connector.syncNow();
    expect(connector.state()).toMatchObject({ configured: false, linked: false });
    // And the house still works.
    expect(harness.service.createManual({ label: "Voisin" }, "adrien").access).toBeTruthy();
  });
});

describe("the word guestFlow shows on a fiche", () => {
  it("names each state the owner can act on", () => {
    const base = {
      revokedAt: null,
      suspendedAt: null,
      kind: "manual" as const,
      validFrom: null,
      validUntil: null,
      stayWindow: null,
      earlyOpenedAt: null,
      extendedUntil: null,
    };
    const now = new Date("2026-09-06T12:00:00Z");
    expect(stateOf({ ...base, revokedAt: "x" } as never, now)).toBe("revoked");
    expect(stateOf({ ...base, suspendedAt: "x" } as never, now)).toBe("suspended");
    expect(stateOf(base as never, now)).toBe("active");
    expect(
      stateOf({ ...base, validUntil: "2026-09-01T00:00:00Z" } as never, now),
    ).toBe("ended");
    expect(
      stateOf({ ...base, validFrom: "2026-09-10T00:00:00Z" } as never, now),
    ).toBe("scheduled");
  });
});
