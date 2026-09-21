// Shared fixtures for the service suites. A sibling module rather than a test
// file, so one subject's suite never imports — and therefore re-runs — another.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import { Gate } from "./gate.js";
import { Gates } from "./gates.js";
import type { GateRecord } from "./model.js";
import { GuestAccessService, type Notifier } from "./service.js";
import type { Access } from "./model.js";

/** The equipment the harness's first gate opens. */
export const GATE_EQUIPMENT = "eq-portail";

export const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

export interface Harness {
  service: GuestAccessService;
  store: AccessStore;
  gate: Gate;
  gates: Gates;
  /** The gate every harness starts with. */
  firstGate: GateRecord;
  /** Everything the device published, in order. */
  published: Array<Record<string, unknown>>;
  addGate(equipmentId: string, name: string): GateRecord;
  dir: string;
  notified: Access[];
  /** Failure counts the owner was alerted with (spec §4 — the guessing alert). */
  guessing: number[];
  /** Answer the press the way the recipe would, once it is in flight. */
  answer(outcome: "opened" | "refused" | "error"): Promise<void>;
}

export function makeHarness(opts: { answerMs?: number } = {}): Harness {
  const dir = mkdtempSync(resolve(tmpdir(), "guest-access-service-"));
  const store = new AccessStore(dir, silent);
  const published: Array<Record<string, unknown>> = [];
  const gate = new Gate({
    integrationId: "guest-access",
    deviceManager: {
      upsertFromDiscovery: () => {},
      updateDeviceData: (_i: string, _d: string, payload: Record<string, unknown>) => {
        published.push(payload);
      },
      updateDeviceStatus: () => {},
    },
    logger: silent,
    answerMs: opts.answerMs ?? 40,
  });
  gate.start();
  const gates = new Gates({ store, logger: silent });
  // A house with one gate, already picked — what most tests need. The recipe
  // would have sent this catalogue at its start.
  gates.setCatalog([{ id: GATE_EQUIPMENT, name: "Portail d'entrée", state: "closed" }]);
  const firstGate = gates.add(GATE_EQUIPMENT).record!;
  /** Another gate of the house, offered by the recipe and picked by the owner. */
  const addGate = (equipmentId: string, name: string): GateRecord => {
    gates.setCatalog([...gates.catalog(), { id: equipmentId, name, state: "unknown" }]);
    return gates.add(equipmentId).record!;
  };
  const notified: Access[] = [];
  const guessing: number[] = [];
  const notifier: Notifier = {
    devicesOverNotice: (a) => notified.push(a),
    guessingDetected: (failures) => guessing.push(failures),
  };
  const service = new GuestAccessService({ store, gate, gates, logger: silent, notifier });

  return {
    service,
    store,
    gate,
    gates,
    firstGate,
    published,
    addGate,
    dir,
    notified,
    guessing,
    async answer(outcome) {
      // Let the press reach the gate before the recipe answers it.
      await new Promise((r) => setTimeout(r, 1));
      gate.reportResult(outcome);
    },
  };
}

export const STAY = {
  revision: 1,
  reservationId: 42,
  reservationNumber: "202609042",
  property: "Le Gîte",
  guestName: "Camille",
  startsAt: "2026-09-04T16:00:00.000Z",
  endsAt: "2026-09-11T09:00:00.000Z",
  state: "active" as const,
};

export const DURING = new Date("2026-09-06T12:00:00.000Z");
