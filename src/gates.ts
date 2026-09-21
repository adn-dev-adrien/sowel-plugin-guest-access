// ============================================================
// The gates — one list of people per thing that opens
//
// A house may have a gate and a garage door, and who may open one is not who
// may open the other. Each gate is its own device (`gate.ts`), bound to its own
// equipment, driven by its own instance of the recipe; this file only keeps the
// list of them and hands the right one to whoever asks.
//
// The first gate is the device every installation already had, under the name
// it already had. Nothing that was bound to it has to be bound again.
// ============================================================

import { Gate, DEVICE_ID, type DeviceManagerLike, type Logger } from "./gate.js";
import type { GateRecord } from "./model.js";
import { GATE_NAME_MAX, PRIMARY_GATE_ID } from "./model.js";
import { randomId } from "./codes.js";
import type { Refusal } from "./validity.js";

/** What the registry needs from the store — the gates live beside the accesses. */
export interface GateStore {
  gates(): GateRecord[];
  saveGates(gates: GateRecord[]): void;
  forgetGate(gateId: string): void;
}

export interface GatesOptions {
  integrationId: string;
  deviceManager: DeviceManagerLike;
  logger: Logger;
  store: GateStore;
  answerMs?: number;
}

/**
 * The device name of a new gate. Prefixed, because it lands in Sowel's device
 * list among the Zigbee sensors, and « Garage » alone would not say whose it is.
 */
export function deviceIdFor(name: string): string {
  return `Accès partagés · ${name}`;
}

export class Gates {
  private readonly opts: GatesOptions;
  private records: GateRecord[];
  private readonly live = new Map<string, Gate>();
  private started = false;

  constructor(options: GatesOptions) {
    this.opts = options;
    this.records = options.store.gates();
    if (!this.records.length) {
      // Before gates were plural there was one, and every access opened it.
      this.records = [
        { id: PRIMARY_GATE_ID, deviceId: DEVICE_ID, name: DEVICE_ID, createdAt: new Date().toISOString() },
      ];
      options.store.saveGates(this.records);
    }
    for (const record of this.records) this.live.set(record.id, this.makeGate(record));
  }

  start(): void {
    this.started = true;
    for (const gate of this.live.values()) gate.start();
  }

  stop(): void {
    this.started = false;
    for (const gate of this.live.values()) gate.stop();
  }

  list(): Array<{ record: GateRecord; gate: Gate }> {
    return this.records.map((record) => ({ record: { ...record }, gate: this.live.get(record.id)! }));
  }

  ids(): string[] {
    return this.records.map((r) => r.id);
  }

  get(id: string): Gate | undefined {
    return this.live.get(id);
  }

  record(id: string): GateRecord | undefined {
    const found = this.records.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  /** The gate a device order is for — the core names the device, not the gate. */
  byDevice(deviceId: string): Gate | undefined {
    const record = this.records.find((r) => r.deviceId === deviceId);
    return record ? this.live.get(record.id) : undefined;
  }

  /** Where a stay from guestFlow goes until the owner says otherwise. */
  primary(): { record: GateRecord; gate: Gate } {
    const record = this.records[0];
    return { record: { ...record }, gate: this.live.get(record.id)! };
  }

  /** What to call a gate: the equipment's name once the recipe has said it. */
  label(id: string): string | null {
    const gate = this.live.get(id);
    const record = this.records.find((r) => r.id === id);
    if (!gate || !record) return null;
    return gate.getOpeningLabel() ?? record.name;
  }

  add(rawName: unknown): { record?: GateRecord; refusal?: Refusal } {
    const name = typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim() : "";
    if (!name) return { refusal: { field: "name", code: "required" } };
    if (name.length > GATE_NAME_MAX) return { refusal: { field: "name", code: "too_long" } };
    const deviceId = deviceIdFor(name);
    // Two gates on one device would share one counter — one press, two gates.
    if (this.records.some((r) => r.deviceId === deviceId || r.name === name)) {
      return { refusal: { field: "name", code: "taken" } };
    }
    const record: GateRecord = { id: randomId(), deviceId, name, createdAt: new Date().toISOString() };
    this.records = [...this.records, record];
    this.opts.store.saveGates(this.records);
    const gate = this.makeGate(record);
    this.live.set(record.id, gate);
    if (this.started) gate.start();
    this.opts.logger.info({ gate: record.id, deviceId }, "Shared access: gate added");
    return { record: { ...record } };
  }

  /**
   * A gate going away. Refused while it is the only gate of a live access —
   * that person would be left holding a code that opens nothing, and nobody
   * would have decided it. The device is marked offline rather than deleted:
   * the plugin cannot remove a device, and an equipment still bound to it is
   * the owner's to clear.
   */
  remove(id: string, liveAccessGates: string[][]): { ok?: true; refusal?: Refusal; missing?: true } {
    const record = this.records.find((r) => r.id === id);
    if (!record) return { missing: true };
    if (this.records.length === 1) return { refusal: { field: "gate", code: "last_gate" } };
    if (liveAccessGates.some((gates) => gates.length === 1 && gates[0] === id)) {
      return { refusal: { field: "gate", code: "gate_in_use" } };
    }
    this.live.get(id)?.stop();
    this.live.delete(id);
    this.records = this.records.filter((r) => r.id !== id);
    this.opts.store.saveGates(this.records);
    this.opts.store.forgetGate(id);
    this.opts.logger.info({ gate: id }, "Shared access: gate removed");
    return { ok: true };
  }

  private makeGate(record: GateRecord): Gate {
    return new Gate({
      integrationId: this.opts.integrationId,
      deviceManager: this.opts.deviceManager,
      logger: this.opts.logger,
      answerMs: this.opts.answerMs,
      deviceId: record.deviceId,
    });
  }
}
