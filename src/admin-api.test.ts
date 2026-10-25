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
  it("names the gates, the door and the connector without being asked twice", async () => {
    const h = start();
    const response = await h.admin("GET", "/state");
    expect(response.status).toBe(200);
    const body = response.body as Record<string, any>;
    expect(body.gates).toEqual([
      expect.objectContaining({
        id: h.firstGate.id,
        equipmentId: "eq-portail",
        name: "Portail d'entrée",
        bound: true,
        gateState: "closed",
        accesses: 0,
      }),
    ]);
    expect(body.catalog).toEqual([{ id: "eq-portail", name: "Portail d'entrée", state: "closed", taken: true }]);
    expect(body.recipe).toMatchObject({ answering: true, lastResult: null });
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

  it("runs the four actions, and 404s on anything else", async () => {
    const h = start();
    const access = h.service.createManual({ label: "Voisin" }, "adrien").access!;
    for (const action of ["suspend", "resume", "code", "revoke"]) {
      const response = await h.admin("POST", `/accesses/${access.id}/${action}`, { body: {} });
      expect(response.status, action).toBe(200);
    }
    expect((await h.admin("POST", `/accesses/${access.id}/explode`, { body: {} })).status).toBe(404);
    expect((await h.admin("POST", "/accesses/nope/suspend", { body: {} })).status).toBe(404);
  });

  it("changes the code, and cuts the phones only when asked", async () => {
    const h = start();
    const access = h.service.createManual({ label: "Voisin" }, "adrien").access!;
    const phone = h.service.enrol(access.code!, "ip", "ua");
    expect(phone.ok).toBe(true);

    const kept = await h.admin("POST", `/accesses/${access.id}/code`, { body: {} });
    const keptRow = (kept.body as { access: { code: string; devices: number } }).access;
    expect(keptRow.code.replace("-", "")).not.toBe(access.code);
    expect(keptRow.devices).toBe(1);

    const cut = await h.admin("POST", `/accesses/${access.id}/code`, { body: { cutPhones: true } });
    expect((cut.body as { access: { devices: number } }).access.devices).toBe(0);
    expect(h.service.journal({ accessId: access.id }).map((e) => e.kind)).toEqual(
      expect.arrayContaining(["invitation", "regenerated"]),
    );
  });

  it("refuses to delete a live access — revoke first — then deletes it once", async () => {
    const h = start();
    const access = h.service.createManual({ label: "Voisin" }, "adrien").access!;
    const live = await h.admin("DELETE", `/accesses/${access.id}`);
    expect(live.status).toBe(422);
    expect(live.body).toMatchObject({ code: "still_live" });
    expect(h.service.get(access.id)).toBeDefined();

    await h.admin("POST", `/accesses/${access.id}/revoke`, { body: {} });
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

describe("the gates", () => {
  it("adds a gate for an equipment the recipe offered, and refuses the rest", async () => {
    const h = start();
    h.gates.setCatalog([...h.gates.catalog(), { id: "eq-garage", name: "Porte du garage", state: "open" }]);
    const added = await h.admin("POST", "/gates", { body: { equipmentId: "eq-garage" } });
    expect(added.status).toBe(201);
    const gate = (added.body as { gate: { id: string } }).gate;

    const body = (await h.admin("GET", "/state")).body as Record<string, any>;
    expect(body.gates.map((g: any) => g.name)).toEqual(["Portail d'entrée", "Porte du garage"]);
    expect(body.catalog.every((e: any) => e.taken)).toBe(true);

    expect((await h.admin("POST", "/gates", { body: {} })).body).toMatchObject({ code: "required" });
    expect((await h.admin("POST", "/gates", { body: { equipmentId: "eq-lamp" } })).body).toMatchObject({ code: "unknown_equipment" });
    expect((await h.admin("POST", "/gates", { body: { equipmentId: "eq-garage" } })).body).toMatchObject({ code: "taken" });
    expect(gate.id).toBeTruthy();
  });

  it("re-points a gate whose equipment the house no longer has", async () => {
    const h = start();
    h.gates.setCatalog([{ id: "eq-new", name: "Nouveau portail", state: "closed" }]);
    let body = (await h.admin("GET", "/state")).body as Record<string, any>;
    expect(body.gates[0]).toMatchObject({ bound: false, gateState: "unknown" });

    const patched = await h.admin("PATCH", `/gates/${h.firstGate.id}`, { body: { equipmentId: "eq-new" } });
    expect(patched.status).toBe(200);
    body = (await h.admin("GET", "/state")).body as Record<string, any>;
    expect(body.gates[0]).toMatchObject({ id: h.firstGate.id, bound: true, name: "Nouveau portail" });
    expect((await h.admin("PATCH", "/gates/nope", { body: { equipmentId: "eq-new" } })).status).toBe(404);
  });

  it("creates an access for the gates ticked, and refuses one that opens nothing", async () => {
    const h = start();
    const garage = h.addGate("eq-garage", "Garage");
    const both = await h.admin("POST", "/accesses", { body: { label: "Léa", gates: [garage.id, h.firstGate.id] } });
    // Stored in the house's order, whatever order the page sent.
    expect((both.body as { access: { gates: string[] } }).access.gates).toEqual([h.firstGate.id, garage.id]);

    const none = await h.admin("POST", "/accesses", { body: { label: "Personne", gates: [] } });
    expect(none.status).toBe(422);
    expect(none.body).toMatchObject({ field: "gates", code: "no_gate" });
    const ghost = await h.admin("POST", "/accesses", { body: { label: "X", gates: ["nope"] } });
    expect(ghost.body).toMatchObject({ code: "unknown_gate" });
  });

  it("will not remove the only gate of someone still able to open", async () => {
    const h = start();
    const garage = h.addGate("eq-garage", "Garage");
    const plumber = h.service.createManual({ label: "Plombier", gates: [garage.id] }, "adrien").access!;
    expect((await h.admin("DELETE", `/gates/${garage.id}`)).body).toMatchObject({ code: "gate_in_use" });

    // Once that access can no longer open, the gate may go — and nobody lists it.
    h.service.revoke(plumber.id, "adrien");
    expect((await h.admin("DELETE", `/gates/${garage.id}`)).status).toBe(200);
    expect(h.service.get(plumber.id)!.gates).toEqual([]);
    expect((await h.admin("DELETE", `/gates/${garage.id}`)).status).toBe(404);
  });
});

describe("the line on the equipment's own page", () => {
  it("counts who may open THIS gate right now, in the viewer's language", async () => {
    const h = start();
    const garage = h.addGate("eq-garage", "Garage");
    h.service.createManual({ label: "Léa", gates: [h.firstGate.id, garage.id] }, "adrien");
    h.service.createManual({ label: "Voisin" }, "adrien");
    const held = h.service.createManual({ label: "Suspendu" }, "adrien").access!;
    h.service.suspend(held.id, "adrien");

    const fr = await h.admin("GET", "/equipment-link", { query: { equipmentId: "eq-portail" } });
    expect(fr.body).toEqual({ text: "2 personnes peuvent ouvrir ce portail avec un code.", action: "Gérer les accès", gateId: h.firstGate.id });
    const en = await h.admin("GET", "/equipment-link", { query: { equipmentId: "eq-garage", lang: "en" } });
    expect(en.body).toMatchObject({ text: "1 person can open this gate with a code.", action: "Manage access" });
  });

  it("offers to give access on a gate that has no list yet", async () => {
    const h = start();
    const body = (await h.admin("GET", "/equipment-link", { query: { equipmentId: "eq-jardin" } })).body;
    expect(body).toEqual({ text: "Personne n'a encore d'accès à ce portail.", action: "Ouvrir des accès", gateId: null });
  });
});
