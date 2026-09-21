// Shared fixtures for the two HTTP surfaces. A sibling module, not a test file:
// a suite must never import another suite and re-run it.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import { Gate } from "./gate.js";
import { Gates } from "./gates.js";
import type { GateRecord } from "./model.js";
import { GuestAccessService } from "./service.js";
import { GuestFlowConnector } from "./guestflow.js";
import { createAdminApi } from "./admin-api.js";
import { createPublicApi } from "./public-api.js";
import { DEFAULT_GUEST_PATH } from "./guest-url.js";
import type { PluginHttpRequest, PluginHttpResponse } from "./plugin-contract.js";

/** The equipment the harness's first gate opens. */
export const GATE_EQUIPMENT = "eq-portail";

export const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

export interface ApiHarness {
  dir: string;
  service: GuestAccessService;
  gate: Gate;
  gates: Gates;
  /** The gate every harness starts with. */
  firstGate: GateRecord;
  addGate(equipmentId: string, name: string): GateRecord;
  connector: GuestFlowConnector;
  admin(
    method: string,
    path: string,
    options?: { body?: unknown; query?: Record<string, string> },
  ): Promise<PluginHttpResponse>;
  guest(
    method: string,
    path: string,
    options?: { body?: unknown; token?: string; ip?: string; headers?: Record<string, string> },
  ): Promise<PluginHttpResponse>;
  answer(outcome: "opened" | "refused" | "error"): Promise<void>;
  publicOpen: boolean;
}

export function makeApiHarness(
  opts: { guestBaseUrl?: string | null; guestPath?: string; publicOpen?: boolean } = {},
): ApiHarness {
  // `?? default` would turn an explicit null — « nobody has said where Sowel is
  // reachable » — back into an address, which is the case worth testing.
  const guestBaseUrl = (): string | null =>
    opts.guestBaseUrl === undefined ? "https://sowel.example.com" : opts.guestBaseUrl;
  const guestPath = (): string => opts.guestPath ?? DEFAULT_GUEST_PATH;
  const dir = mkdtempSync(resolve(tmpdir(), "guest-access-api-"));
  const store = new AccessStore(dir, silent);
  const gate = new Gate({
    integrationId: "guest-access",
    deviceManager: {
      upsertFromDiscovery: () => {},
      updateDeviceData: () => {},
      updateDeviceStatus: () => {},
    },
    logger: silent,
    answerMs: 40,
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
  const service = new GuestAccessService({ store, gate, gates, logger: silent });
  const connector = new GuestFlowConnector({
    service,
    logger: silent,
    readCursor: () => 0,
    writeCursor: () => {},
    fetchImpl: (async () => {
      throw new Error("no guestFlow in these tests");
    }) as unknown as typeof fetch,
  });
  connector.start(null);

  const harness: ApiHarness = {
    dir,
    service,
    gate,
    gates,
    firstGate,
    addGate,
    connector,
    publicOpen: opts.publicOpen ?? true,
    async admin(method, path, options = {}) {
      const handle = createAdminApi({
        service,
        connector,
        gate,
        gates,
        guestBaseUrl,
        guestPath,
        publicTreeOpen: () => harness.publicOpen,
        onChanged: () => {},
      });
      return handle(request(method, path, options));
    },
    async guest(method, path, options = {}) {
      const handle = createPublicApi({
        service,
        guestBaseUrl,
        guestPath,
        openingLabel: () => {
          const all = gates.list();
          return all.length === 1 ? gates.label(all[0].id) : null;
        },
        gateLabel: (id) => gates.label(id),
      });
      return handle(
        request(method, path, {
          ...options,
          headers: {
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
            ...(options.headers ?? {}),
          },
        }),
      );
    },
    async answer(outcome) {
      await new Promise((r) => setTimeout(r, 1));
      gate.reportResult(outcome);
    },
  };
  return harness;
}

function request(
  method: string,
  path: string,
  options: {
    body?: unknown;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    ip?: string;
  },
): PluginHttpRequest {
  return {
    method,
    path,
    query: options.query ?? {},
    headers: options.headers ?? {},
    body: options.body ?? null,
    ip: options.ip ?? "1.2.3.4",
    user: { id: "u1", username: "adrien", role: "admin" },
  };
}
