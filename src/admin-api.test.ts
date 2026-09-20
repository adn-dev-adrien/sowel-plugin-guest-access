// The owner's surface, as the page sees it.

import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { makeApiHarness, type ApiHarness } from "./apiFixtures.js";
import { STAY, DURING } from "./serviceFixtures.js";

let harness: ApiHarness;
const start = (opts = {}): ApiHarness => (harness = makeApiHarness(opts));

afterEach(() => {
  if (harness) rmSync(harness.dir, { recursive: true, force: true });
});

describe("the state the page draws", () => {
  it("names the house, the door and the connector without being asked twice", async () => {
    const h = start();
    const response = await h.admin("GET", "/state");
    expect(response.status).toBe(200);
    const body = response.body as Record<string, any>;
    expect(body.house).toMatchObject({ gateState: "unknown", recipeAnswering: false });
    expect(body.guestflow).toMatchObject({ configured: false, linked: false });
    expect(body.publicTree).toMatchObject({ open: true, path: "/p/guest-access/" });
  });

  it("says the guests' door is shut, which is the thing nobody would guess", async () => {
    const h = start({ publicOpen: false });
    const body = (await h.admin("GET", "/state")).body as Record<string, any>;
    expect(body.publicTree.open).toBe(false);
  });

  it("groups the accesses and shapes every field the page shows", async () => {
    const h = start();
    h.service.applyStay(STAY, DURING);
    h.service.createManual({ label: "Voisin" }, "adrien", DURING);
    h.service.createManual(
      { label: "Plombier", validFrom: "2026-01-01T08:00", validUntil: "2026-01-02T08:00" },
      "adrien",
    );

    const body = (await h.admin("GET", "/state")).body as Record<string, any>;
    expect(body.accesses).toHaveLength(3);
    const stay = body.accesses.find((a: any) => a.kind === "stay");
    expect(stay).toMatchObject({
      state: expect.any(String),
      devices: 0,
      useCount: 0,
      code: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
    });
    expect(stay.invitationUrl).toContain("https://sowel.example.com/p/guest-access/#i=");
    expect(body.groups.ended).toContain(
      body.accesses.find((a: any) => a.label === "Plombier").id,
    );
  });

  it("has no invitation link to give when Sowel's address is unknown", async () => {
    const h = start({ guestBaseUrl: null });
    h.service.createManual({ label: "Voisin" }, "adrien");
    const body = (await h.admin("GET", "/state")).body as Record<string, any>;
    expect(body.accesses[0].invitationUrl).toBeNull();
    expect(body.publicTree.guestBaseUrl).toBeNull();
  });
});

describe("what the page may do", () => {
  it("creates a hand-made access, and answers the refusal a form should show", async () => {
    const h = start();
    const created = await h.admin("POST", "/accesses", { body: { label: "Voisin — Jean" } });
    expect(created.status).toBe(201);

    const refused = await h.admin("POST", "/accesses", { body: { label: " " } });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ field: "label", code: "required" });
  });

  it("edits, and refuses an override that would shorten a stay", async () => {
    const h = start();
    const access = h.service.applyStay(STAY, DURING).access!;
    const ok = await h.admin("PATCH", `/accesses/${access.id}`, {
      body: { extendedUntil: "2026-09-14T11:00" },
    });
    expect(ok.status).toBe(200);

    const refused = await h.admin("PATCH", `/accesses/${access.id}`, {
      body: { extendedUntil: "2026-09-05T11:00" },
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ code: "not_later" });
  });

  it("runs the five actions, and 404s on anything else", async () => {
    const h = start();
    const access = h.service.createManual({ label: "Voisin" }, "adrien").access!;
    for (const action of ["suspend", "resume", "invitation", "regenerate", "revoke"]) {
      const response = await h.admin("POST", `/accesses/${access.id}/${action}`, { body: {} });
      expect(response.status, action).toBe(200);
    }
    expect((await h.admin("POST", `/accesses/${access.id}/explode`, { body: {} })).status).toBe(404);
    expect((await h.admin("POST", "/accesses/nope/suspend", { body: {} })).status).toBe(404);
  });

  it("deletes, and says so once", async () => {
    const h = start();
    const access = h.service.createManual({ label: "Voisin" }, "adrien").access!;
    expect((await h.admin("DELETE", `/accesses/${access.id}`)).status).toBe(200);
    expect((await h.admin("DELETE", `/accesses/${access.id}`)).status).toBe(404);
  });

  it("serves the journal, whole or for one access", async () => {
    const h = start();
    const a = h.service.createManual({ label: "A" }, "adrien").access!;
    h.service.createManual({ label: "B" }, "adrien");

    const all = (await h.admin("GET", "/journal")).body as { entries: unknown[] };
    expect(all.entries).toHaveLength(2);

    const one = (await h.admin("GET", "/journal", { query: { accessId: a.id } })).body as {
      entries: Array<{ label: string }>;
    };
    expect(one.entries).toHaveLength(1);
    expect(one.entries[0].label).toBe("A");
  });

  it("404s on an unknown route rather than guessing", async () => {
    const h = start();
    expect((await h.admin("GET", "/elsewhere")).status).toBe(404);
    expect((await h.admin("POST", "/accesses/../etc/passwd", { body: {} })).status).toBe(404);
  });
});
