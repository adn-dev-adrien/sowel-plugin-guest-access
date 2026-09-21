// Shared fixtures for the service suites. A sibling module rather than a test
// file, so one subject's suite never imports — and therefore re-runs — another.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import type { Gate } from "./gate.js";
import { Gates } from "./gates.js";
import { GuestAccessService, type Notifier } from "./service.js";
import type { Access } from "./model.js";

export const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

export interface Harness {
  service: GuestAccessService;
  store: AccessStore;
  gate: Gate;
  gates: Gates;
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
  const gates = new Gates({
    integrationId: "guest-access",
    deviceManager: {
      upsertFromDiscovery: () => {},
      updateDeviceData: () => {},
      updateDeviceStatus: () => {},
    },
    logger: silent,
    store,
    answerMs: opts.answerMs ?? 40,
  });
  gates.start();
  // The first gate — every installation's, and the only one most tests need.
  const gate = gates.primary().gate;
  const notified: Access[] = [];
  const guessing: number[] = [];
  const notifier: Notifier = {
    devicesOverNotice: (a) => notified.push(a),
    guessingDetected: (failures) => guessing.push(failures),
  };
  const service = new GuestAccessService({ store, gates, logger: silent, notifier });

  return {
    service,
    store,
    gate,
    gates,
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
