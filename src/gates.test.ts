// The gates — one list of people per thing that opens (spec §3.1.bis).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import { Gates, parseCatalog } from "./gates.js";

const silent = { info: () => {}, warn: () => {}, error: () => {} };
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const CATALOG = [
  { id: "eq-portail", name: "Portail d'entrée", state: "closed" as const },
  { id: "eq-garage", name: "Garage", state: "open" as const },
];

function makeGates(dir = mkdtempSync(resolve(tmpdir(), "guest-access-gates-"))) {
  dirs.push(dir);
  const store = new AccessStore(dir, silent);
  return { gates: new Gates({ store, logger: silent }), store, dir };
}

describe("the catalogue the recipe sends", () => {
  it("is read entry by entry, and anything malformed is dropped rather than trusted", () => {
    expect(
      parseCatalog(JSON.stringify([
        { id: "eq-1", name: "  Porte   du garage ", state: "open" },
        { id: "eq-2", state: "sideways" },
        { name: "no id" },
        null,
        "x",
      ])),
    ).toEqual([
      { id: "eq-1", name: "Porte du garage", state: "open" },
      { id: "eq-2", name: "eq-2", state: "unknown" },
    ]);
    expect(parseCatalog("{ not json")).toBeNull();
    expect(parseCatalog(JSON.stringify({ id: "x" }))).toBeNull();
  });

  it("is kept, so an update of the plugin does not forget the gates", () => {
    const first = makeGates();
    first.gates.setCatalog(CATALOG);
    const again = makeGates(first.dir);
    expect(again.gates.catalog()).toEqual(CATALOG);
    expect(again.gates.catalogReceivedAt()).not.toBeNull();
  });
});

describe("the owner's picks", () => {
  it("starts with no gate at all — nothing is opened until the owner picks one", () => {
    const { gates } = makeGates();
    expect(gates.list()).toEqual([]);
    expect(gates.primary()).toBeUndefined();
  });

  it("adds a gate for an equipment the recipe offered, named after it", () => {
    const { gates } = makeGates();
    gates.setCatalog(CATALOG);
    const { record } = gates.add("eq-garage");
    expect(record).toMatchObject({ equipmentId: "eq-garage" });
    expect(gates.label(record!.id)).toBe("Garage");
    expect(gates.equipmentOf(record!.id)).toEqual(CATALOG[1]);
    expect(gates.byEquipment("eq-garage")?.id).toBe(record!.id);
  });

  it("refuses nothing picked, an equipment the recipe did not offer, and one already a gate", () => {
    const { gates } = makeGates();
    gates.setCatalog(CATALOG);
    expect(gates.add("").refusal).toEqual({ field: "equipmentId", code: "required" });
    expect(gates.add("eq-lamp").refusal).toEqual({ field: "equipmentId", code: "unknown_equipment" });
    gates.add("eq-garage");
    expect(gates.add("eq-garage").refusal).toEqual({ field: "equipmentId", code: "taken" });
  });

  it("follows a rename, and says so when the house no longer has the equipment", () => {
    const { gates } = makeGates();
    gates.setCatalog(CATALOG);
    const { record } = gates.add("eq-garage");
    gates.setCatalog([CATALOG[0], { ...CATALOG[1], name: "Porte du garage" }]);
    expect(gates.label(record!.id)).toBe("Porte du garage");
    gates.setCatalog([CATALOG[0]]);
    expect(gates.equipmentOf(record!.id)).toBeUndefined();
  });

  it("re-points a gate at another equipment, keeping its id — and every access on it", () => {
    const { gates } = makeGates();
    gates.setCatalog(CATALOG);
    const { record } = gates.add("eq-portail");
    expect(gates.bind(record!.id, "eq-garage").record).toMatchObject({ id: record!.id, equipmentId: "eq-garage" });
    expect(gates.bind("nope", "eq-garage")).toEqual({ missing: true });
  });

  it("keeps the picks across a restart", () => {
    const first = makeGates();
    first.gates.setCatalog(CATALOG);
    const { record } = first.gates.add("eq-garage");
    expect(makeGates(first.dir).gates.ids()).toEqual([record!.id]);
  });

  it("removes a gate only when nobody still able to open depends on it alone", () => {
    const { gates } = makeGates();
    gates.setCatalog(CATALOG);
    const a = gates.add("eq-portail").record!;
    const b = gates.add("eq-garage").record!;
    expect(gates.remove(b.id, [[b.id]]).refusal).toEqual({ field: "gate", code: "gate_in_use" });
    expect(gates.remove(b.id, [[a.id, b.id]])).toEqual({ ok: true });
    expect(gates.remove(b.id, [])).toEqual({ missing: true });
  });
});
