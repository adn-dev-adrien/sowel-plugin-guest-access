// Shared fixtures for the two HTTP surfaces. A sibling module, not a test file:
// a suite must never import another suite and re-run it.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import { Gate } from "./gate.js";
import { GuestAccessService } from "./service.js";
import { GuestFlowConnector } from "./guestflow.js";
import { createAdminApi } from "./admin-api.js";
import { createPublicApi } from "./public-api.js";
import { DEFAULT_GUEST_PATH } from "./guest-url.js";
import type { PluginHttpRequest, PluginHttpResponse } from "./plugin-contract.js";

export const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

export interface ApiHarness {
  dir: string;
  service: GuestAccessService;
  gate: Gate;
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
  const service = new GuestAccessService({ store, gate, logger: silent });
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
    connector,
    publicOpen: opts.publicOpen ?? true,
    async admin(method, path, options = {}) {
      const handle = createAdminApi({
        service,
        connector,
        gate,
        guestBaseUrl,
        guestPath,
        publicTreeOpen: () => harness.publicOpen,
        onChanged: () => {},
      });
      return handle(request(method, path, options));
    },
    async guest(method, path, options = {}) {
      const handle = createPublicApi({ service, guestBaseUrl, guestPath });
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
