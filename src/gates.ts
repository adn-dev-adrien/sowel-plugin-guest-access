// ============================================================
// The gates — one list of people per thing that opens
//
// A house may have a gate and a garage door, and who may open one is not who
// may open the other. The plugin cannot see the house's equipments; the recipe
// can, and hands down the catalogue of its gates (`gate_catalog`). The owner
// picks from it — « + portail », then the equipment — and that is the whole
// set-up: one device and one recipe instance serve every gate.
//
// This file keeps that catalogue and the owner's picks, and answers « which
// equipment does this gate open, and what is it called ».
// ============================================================

import type { CatalogEntry, GateRecord } from "./model.js";
import { randomId } from "./codes.js";
import type { Refusal } from "./validity.js";

/** What the registry needs from the store — the gates live beside the accesses. */
export interface GateStore {
  gates(): GateRecord[];
  saveGates(gates: GateRecord[]): void;
  forgetGate(gateId: string): void;
  catalog(): { entries: CatalogEntry[]; receivedAt: string } | null;
  saveCatalog(entries: CatalogEntry[], receivedAt: string): void;
}

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
}

const STATES = ["open", "closed", "unknown"];
/** A name is a name, not a paragraph — it lands in a tab and a page title. */
const NAME_MAX = 60;

/**
 * The catalogue as the recipe sent it, checked entry by entry. It crosses from
 * another package; anything malformed is dropped rather than trusted.
 */
export function parseCatalog(raw: string): CatalogEntry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed
    .filter(
      (e): e is { id: string; name?: unknown; state?: unknown } =>
        !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && !!(e as { id: string }).id,
    )
    .map((e) => ({
      id: e.id,
      name: (typeof e.name === "string" && e.name.trim() ? e.name : e.id).replace(/\s+/g, " ").trim().slice(0, NAME_MAX),
      state: (STATES.includes(e.state as string) ? e.state : "unknown") as CatalogEntry["state"],
    }));
}

export class Gates {
  private readonly store: GateStore;
  private readonly logger: Logger;
  private records: GateRecord[];

  constructor(options: { store: GateStore; logger: Logger }) {
    this.store = options.store;
    this.logger = options.logger;
    this.records = options.store.gates();
  }

  list(): GateRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  ids(): string[] {
    return this.records.map((r) => r.id);
  }

  record(id: string): GateRecord | undefined {
    const found = this.records.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  /** Where a stay from guestFlow goes until the owner says otherwise. */
  primary(): GateRecord | undefined {
    return this.records[0] ? { ...this.records[0] } : undefined;
  }

  byEquipment(equipmentId: string): GateRecord | undefined {
    const found = this.records.find((r) => r.equipmentId === equipmentId);
    return found ? { ...found } : undefined;
  }

  // ── The catalogue ──────────────────────────────────────────

  /** Has a recipe ever answered? The catalogue is the first thing it sends. */
  catalogReceivedAt(): string | null {
    return this.store.catalog()?.receivedAt ?? null;
  }

  catalog(): CatalogEntry[] {
    return this.store.catalog()?.entries ?? [];
  }

  setCatalog(entries: CatalogEntry[], now = new Date()): void {
    this.store.saveCatalog(entries, now.toISOString());
  }

  /** The equipment a gate opens, if the house still has it. */
  equipmentOf(id: string): CatalogEntry | undefined {
    const record = this.records.find((r) => r.id === id);
    if (!record?.equipmentId) return undefined;
    return this.catalog().find((e) => e.id === record.equipmentId);
  }

  /** What to call a gate: its equipment's name, or what it was called before. */
  label(id: string): string | null {
    const record = this.records.find((r) => r.id === id);
    if (!record) return null;
    return this.equipmentOf(id)?.name ?? record.name ?? null;
  }

  // ── The owner's picks ──────────────────────────────────────

  add(equipmentId: unknown): { record?: GateRecord; refusal?: NonNullable<Refusal> } {
    const refusal = this.checkEquipment(equipmentId, null);
    if (refusal) return { refusal };
    const record: GateRecord = { id: randomId(), equipmentId: equipmentId as string, createdAt: new Date().toISOString() };
    this.records = [...this.records, record];
    this.store.saveGates(this.records);
    this.logger.info({ gate: record.id, equipmentId }, "Shared access: gate added");
    return { record: { ...record } };
  }

  /** Point a gate at another equipment — every access on it follows. */
  bind(id: string, equipmentId: unknown): { record?: GateRecord; refusal?: NonNullable<Refusal>; missing?: true } {
    const index = this.records.findIndex((r) => r.id === id);
    if (index < 0) return { missing: true };
    const refusal = this.checkEquipment(equipmentId, id);
    if (refusal) return { refusal };
    this.records = this.records.map((r, i) => (i === index ? { ...r, equipmentId: equipmentId as string } : r));
    this.store.saveGates(this.records);
    return { record: { ...this.records[index] } };
  }

  /**
   * A gate going away. Refused while it is the only gate of an access still
   * able to open — that person would be left holding a code that opens nothing,
   * and nobody would have decided it.
   */
  remove(id: string, liveAccessGates: string[][]): { ok?: true; refusal?: NonNullable<Refusal>; missing?: true } {
    if (!this.records.some((r) => r.id === id)) return { missing: true };
    if (liveAccessGates.some((gates) => gates.length === 1 && gates[0] === id)) {
      return { refusal: { field: "gate", code: "gate_in_use" } };
    }
    this.records = this.records.filter((r) => r.id !== id);
    this.store.saveGates(this.records);
    this.store.forgetGate(id);
    this.logger.info({ gate: id }, "Shared access: gate removed");
    return { ok: true };
  }

  /** An equipment the recipe offered, and not already another gate's. */
  private checkEquipment(raw: unknown, self: string | null): NonNullable<Refusal> | null {
    if (typeof raw !== "string" || !raw) return { field: "equipmentId", code: "required" };
    if (!this.catalog().some((e) => e.id === raw)) return { field: "equipmentId", code: "unknown_equipment" };
    if (this.records.some((r) => r.equipmentId === raw && r.id !== self)) {
      return { field: "equipmentId", code: "taken" };
    }
    return null;
  }
}
