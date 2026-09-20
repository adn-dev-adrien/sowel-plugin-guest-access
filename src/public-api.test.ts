// The guest's surface — the one an anonymous caller on the internet reaches.

import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { makeApiHarness, type ApiHarness } from "./apiFixtures.js";
import { STAY } from "./serviceFixtures.js";

/** These suites talk to the surface through the real clock, as a phone does. */
const liveStay = () => ({
  ...STAY,
  startsAt: new Date(Date.now() - 3600_000).toISOString(),
  endsAt: new Date(Date.now() + 3600_000).toISOString(),
});
const futureStay = () => ({
  ...STAY,
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + 172_800_000).toISOString(),
});

let harness: ApiHarness;
const start = (opts = {}): ApiHarness => (harness = makeApiHarness(opts));

afterEach(() => {
  if (harness) rmSync(harness.dir, { recursive: true, force: true });
});

/** A live stay, and a phone already set up on it. */
async function enrolled(h: ApiHarness) {
  const access = h.service.applyStay(liveStay()).access!;
  const response = await h.guest("POST", "/enrol", { body: { code: access.code } });
  return { access, token: (response.body as { token: string }).token };
}

describe("the page itself", () => {
  it("is served as HTML, with a policy that lets it load nothing else", async () => {
    const h = start();
    const response = await h.guest("GET", "/");
    expect(response.status).toBe(200);
    expect(response.contentType).toContain("text/html");
    expect(String(response.body)).toContain("<html");
    expect(response.headers?.["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers?.["cache-control"]).toBe("no-store");
  });

  it("speaks French by default and English when the phone asks for it", async () => {
    const h = start();
    const french = String((await h.guest("GET", "/")).body);
    expect(french).toContain("Glisser pour actionner");
    const english = String(
      (await h.guest("GET", "/", { headers: { "accept-language": "en-GB,en;q=0.9" } })).body,
    );
    expect(english).toContain("Slide to operate");
  });

  it("serves its own script, style, manifest and icon — and nothing else", async () => {
    const h = start();
    expect((await h.guest("GET", "/app.js")).contentType).toContain("javascript");
    expect((await h.guest("GET", "/style.css")).contentType).toContain("css");
    expect((await h.guest("GET", "/manifest.webmanifest")).contentType).toContain("manifest");
    expect((await h.guest("GET", "/icon.svg")).contentType).toContain("svg");
    expect((await h.guest("GET", "/../../etc/passwd")).status).toBe(404);
  });

  it("never lets the page be cached — a stale code opens nothing", async () => {
    const h = start();
    expect((await h.guest("GET", "/app.js")).headers?.["cache-control"]).toBe("no-store");
  });
});

describe("setting a phone up", () => {
  it("takes the code and hands back a token and what to show", async () => {
    const h = start();
    const access = h.service.applyStay(liveStay()).access!;
    const response = await h.guest("POST", "/enrol", { body: { code: access.code } });
    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body.token).toBeTruthy();
    expect(body.label).toBe("Camille");
    expect(body.invitationUrl).toContain("#i=");
  });

  it("answers 401 on a code that matches nothing — the status a ban counts on", async () => {
    const h = start();
    const response = await h.guest("POST", "/enrol", { body: { code: "NOPENOPE" } });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ reason: "bad_code" });
  });

  it("answers 429 once an address has tried five times", async () => {
    const h = start();
    for (let i = 0; i < 5; i++) await h.guest("POST", "/enrol", { body: { code: "NOPENOPE" } });
    const response = await h.guest("POST", "/enrol", { body: { code: "NOPENOPE" } });
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ reason: "too_many_attempts" });
  });

  it("answers 403 on an access that was withdrawn or has ended", async () => {
    const h = start();
    const access = h.service.applyStay(liveStay()).access!;
    h.service.revoke(access.id, "adrien");
    const response = await h.guest("POST", "/enrol", { body: { code: access.code } });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ reason: "revoked" });
  });

  it("refuses a body that is not a code at all", async () => {
    const h = start();
    expect((await h.guest("POST", "/enrol", { body: { code: 42 } })).status).toBe(401);
    expect((await h.guest("POST", "/enrol", { body: {} })).status).toBe(401);
  });
});

describe("the session", () => {
  it("tells a phone its own name, its end and whether it may press", async () => {
    const h = start();
    const { token } = await enrolled(h);
    const response = await h.guest("GET", "/session", { token });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ label: "Camille", decision: { ok: true } });
  });

  it("never hands out the gate's own state", async () => {
    const h = start();
    const { token } = await enrolled(h);
    h.gate.setGateState("open");
    const body = JSON.stringify((await h.guest("GET", "/session", { token })).body);
    // A page pollable by anyone holding a code must not say whether the gate
    // stands open 400 km away.
    expect(body).not.toContain("gateState");
    expect(body).not.toContain('"open"');
  });

  it("answers 401 to a token nobody holds any more", async () => {
    const h = start();
    expect((await h.guest("GET", "/session", { token: "nonsense" })).status).toBe(401);
    expect((await h.guest("GET", "/session")).status).toBe(401);
  });
});

describe("pressing", () => {
  it("answers `opened` and says nothing else", async () => {
    const h = start();
    const { token } = await enrolled(h);
    const pending = h.guest("POST", "/open", { token, body: {} });
    await h.answer("opened");
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ outcome: "opened" });
  });

  it("hands back the reason, and when the access will be live", async () => {
    const h = start();
    const stay = futureStay();
    const access = h.service.applyStay(stay).access!;
    const enrol = await h.guest("POST", "/enrol", { body: { code: access.code } });
    const token = (enrol.body as { token: string }).token;

    const response = await h.guest("POST", "/open", { token, body: {} });
    expect(response.body).toMatchObject({
      outcome: "not_yet_active",
      reason: "not_yet_active",
      activeAt: stay.startsAt,
    });
  });

  it("says the house refused, rather than pretending the gate moved", async () => {
    const h = start();
    const { token } = await enrolled(h);
    const pending = h.guest("POST", "/open", { token, body: {} });
    await h.answer("refused");
    expect((await pending).body).toMatchObject({ outcome: "refused_by_house" });
  });

  it("answers 401 without a token", async () => {
    const h = start();
    expect((await h.guest("POST", "/open", { body: {} })).status).toBe(401);
  });
});
