// Shared fixtures for the service suites. A sibling module rather than a test
// file, so one subject's suite never imports — and therefore re-runs — another.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import { Gate } from "./gate.js";
import { GuestAccessService, type Notifier } from "./service.js";
import type { Access } from "./model.js";

export const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

export interface Harness {
  service: GuestAccessService;
  store: AccessStore;
  gate: Gate;
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
  const gate = new Gate({
    integrationId: "guest-access",
    deviceManager: {
      upsertFromDiscovery: () => {},
      updateDeviceData: () => {},
      updateDeviceStatus: () => {},
    },
    logger: silent,
    answerMs: opts.answerMs ?? 40,
  });
  gate.start();
  const notified: Access[] = [];
  const guessing: number[] = [];
  const notifier: Notifier = {
    devicesOverNotice: (a) => notified.push(a),
    guessingDetected: (failures) => guessing.push(failures),
  };
  const service = new GuestAccessService({ store, gate, logger: silent, notifier });

  return {
    service,
    store,
    gate,
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
