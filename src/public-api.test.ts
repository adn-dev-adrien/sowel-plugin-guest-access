// The guest's surface — the one an anonymous caller on the internet reaches.

import { describe, it, expect, vi, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { parseCatalog } from "./gates.js";
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

  it("still serves the right code after a run of wrong ones, and without waiting", async () => {
    // The page is always reached through a reverse proxy, so every visitor
    // arrives under one address and a throttle keyed on it punishes the wrong
    // people. What is rationed here is a FAILING answer; a correct code is
    // answered at once, however many others have been tried.
    const h = start();
    const access = h.service.applyStay(liveStay()).access!;
    // Spend the budget well past its end through the service itself: going
    // through the HTTP surface would make this test sit out every held answer.
    for (let i = 0; i < 14; i++) h.service.enrol(`NOPE${String(i).padStart(4, "0")}`, "1.2.3.4", "x");
    const began = Date.now();
    const response = await h.guest("POST", "/enrol", { body: { code: access.code } });
    expect(response.status).toBe(200);
    expect(Date.now() - began).toBeLessThan(500);
  });

  it("holds a failing answer back once the budget is spent", async () => {
    vi.useFakeTimers();
    try {
      const h = start();
      for (let i = 0; i < 10; i++) h.service.enrol(`NOPE${String(i).padStart(4, "0")}`, "1.2.3.4", "x");
      let settled = false;
      const pending = h.guest("POST", "/enrol", { body: { code: "NOPE9999" } }).then((r) => {
        settled = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(900);
      expect(settled).toBe(false);          // the 11th failure waits a second
      await vi.advanceTimersByTimeAsync(200);
      expect((await pending).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it("titles the page after what opens, when the house has one gate", async () => {
    const h = start();
    // A gate carried over from before, pointed at nothing: a neutral word,
    // never « Portail » for a house whose gate is a garage door.
    h.gates.setCatalog([]);
    expect(String((await h.guest("GET", "/")).body)).toContain("<title>Accès</title>");

    // As the plugin receives it: through the order, which tidies the name.
    h.gates.setCatalog(parseCatalog(JSON.stringify([{ id: "eq-portail", name: "  Porte   du garage ", state: "closed" }]))!);
    const page = String((await h.guest("GET", "/")).body);
    expect(page).toContain("<title>Porte du garage</title>");
    const manifest = JSON.parse(String((await h.guest("GET", "/manifest.webmanifest")).body));
    expect(manifest.name).toBe("Porte du garage");
  });

  it("escapes the equipment's name, which anyone administering the house can set", async () => {
    // The name travels from an admin's keyboard into a page anyone on the
    // internet loads: it is data, and it is printed as data.
    const h = start();
    h.gates.setCatalog([{ id: "eq-portail", name: `<img src=x onerror=alert(1)>"'&`, state: "closed" }]);
    const page = String((await h.guest("GET", "/")).body);
    expect(page).not.toContain("<img src=x");
    expect(page).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;");
    const script = String((await h.guest("GET", "/app.js")).body);
    // In the script it rides as a JSON string literal, which is its escaping.
    expect(script).toContain(JSON.stringify(`<img src=x onerror=alert(1)>"'&`));
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
    h.gates.setCatalog([{ id: "eq-portail", name: "Portail d'entrée", state: "open" }]);
    const body = JSON.stringify((await h.guest("GET", "/session", { token })).body);
    // A page pollable by anyone holding a code must not say whether the gate
    // stands open 400 km away.
    expect(body).not.toContain("gateState");
    expect(body).not.toContain('"open"');
  });

  it("lists the gates this access opens, by their equipment's names — and no others", async () => {
    const h = start();
    const garage = h.addGate("eq-garage", "Porte du garage");
    h.addGate("eq-cave", "Cave");
    const access = h.service.createManual({ label: "Léa", gates: [h.firstGate.id, garage.id] }, "adrien").access!;
    const token = ((await h.guest("POST", "/enrol", { body: { code: access.code } })).body as { token: string }).token;
    const body = (await h.guest("GET", "/session", { token })).body as { gates: unknown };
    expect(body.gates).toEqual([
      { id: h.firstGate.id, label: "Portail d'entrée" },
      { id: garage.id, label: "Porte du garage" },
    ]);
  });

  it("does not name any door on the page before a code, once there are several", async () => {
    const h = start();
    h.addGate("eq-garage", "Garage");
    expect(String((await h.guest("GET", "/")).body)).toContain("<title>Accès</title>");
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

  it("presses the gate named in the body", async () => {
    const h = start();
    const garage = h.addGate("eq-garage", "Garage");
    const access = h.service.createManual({ label: "Léa", gates: [h.firstGate.id, garage.id] }, "adrien").access!;
    const token = ((await h.guest("POST", "/enrol", { body: { code: access.code } })).body as { token: string }).token;
    const pending = h.guest("POST", "/open", { token, body: { gate: garage.id } });
    await h.answer("opened");
    expect((await pending).body).toEqual({ outcome: "opened" });
  });

  it("answers 401 without a token", async () => {
    const h = start();
    expect((await h.guest("POST", "/open", { body: {} })).status).toBe(401);
  });
});
