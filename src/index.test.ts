// The plugin as Sowel loads it: the contract with the core (spec 180) and the
// two orders the recipe sends.

import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createPlugin } from "./index.js";

const silent = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
const dirs: string[] = [];

function makePlugin(settings: Record<string, string> = {}) {
  const dataDir = mkdtempSync(resolve(tmpdir(), "guest-access-plugin-"));
  dirs.push(dataDir);
  const events: Array<Record<string, unknown>> = [];
  const data: Array<Record<string, unknown>> = [];
  const store = { ...settings };
  const plugin = createPlugin({
    logger: silent,
    eventBus: { emit: (e) => events.push(e) },
    settingsManager: {
      get: (key: string) => store[key],
      set: (key: string, value: string) => {
        store[key] = value;
      },
    },
    deviceManager: {
      upsertFromDiscovery: vi.fn(),
      updateDeviceData: (_i: string, _d: string, payload: Record<string, unknown>) =>
        data.push(payload),
      updateDeviceStatus: vi.fn(),
    },
    pluginDir: "/tmp/does-not-matter",
    dataDir,
  });
  return { plugin, events, data, store, dataDir };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the plugin Sowel loads", () => {
  it("needs no configuration at all — that is the point", async () => {
    const { plugin } = makePlugin();
    expect(plugin.isConfigured()).toBe(true);
    expect(plugin.getStatus()).toBe("disconnected");
    await plugin.start();
    expect(plugin.getStatus()).toBe("connected");
    await plugin.stop();
    expect(plugin.getStatus()).toBe("disconnected");
  });

  it("keeps its state where an update cannot reach it", async () => {
    const { plugin, dataDir } = makePlugin();
    await plugin.start();
    await plugin.handlePageRequest({
      method: "POST",
      path: "/accesses",
      query: {},
      headers: {},
      body: { label: "Voisin" },
      ip: "1.2.3.4",
      user: { id: "u1", username: "adrien", role: "admin" },
    });
    await plugin.stop();

    // A fresh plugin over the same data directory finds it again.
    const again = createPlugin({
      logger: silent,
      eventBus: { emit: () => {} },
      settingsManager: { get: () => undefined, set: () => {} },
      deviceManager: {
        upsertFromDiscovery: () => {},
        updateDeviceData: () => {},
        updateDeviceStatus: () => {},
      },
      pluginDir: "/tmp/does-not-matter",
      dataDir,
    });
    const state = await again.handlePageRequest({
      method: "GET",
      path: "/state",
      query: {},
      headers: {},
      body: null,
      ip: "1.2.3.4",
      user: { id: "u1", username: "adrien", role: "admin" },
    });
    expect((state.body as { accesses: unknown[] }).accesses).toHaveLength(1);
  });

  it("serves the guests' page without anyone being named", async () => {
    const { plugin } = makePlugin();
    await plugin.start();
    const response = await plugin.handlePublicRequest({
      method: "GET",
      path: "/",
      query: {},
      headers: {},
      body: null,
      ip: "5.6.7.8",
    });
    expect(response.status).toBe(200);
    expect(response.contentType).toContain("text/html");
    await plugin.stop();
  });

  it("takes the recipe's two orders, and refuses anything else", async () => {
    const { plugin } = makePlugin();
    await plugin.start();
    const device = {
      id: "d",
      integrationId: "guest-access",
      sourceDeviceId: "guest-access",
      name: "Accès invités",
    };

    await expect(plugin.executeOrder(device, "gate_state", "open")).resolves.toBeUndefined();
    // An outcome with nothing in flight is dropped, not an error.
    await expect(plugin.executeOrder(device, "result", "opened")).resolves.toBeUndefined();

    await expect(plugin.executeOrder(device, "result", "sideways")).rejects.toThrow(/Unknown outcome/);
    await expect(plugin.executeOrder(device, "gate_state", "ajar")).rejects.toThrow(/Unknown gate state/);
    await expect(plugin.executeOrder(device, "nope", "x")).rejects.toThrow(/Unsupported order/);
    await expect(
      plugin.executeOrder({ ...device, sourceDeviceId: "other" }, "result", "opened"),
    ).rejects.toThrow(/Unknown device/);
    await plugin.stop();
  });

  it("declares the settings the manifest promises, none of them required", () => {
    const { plugin } = makePlugin();
    const keys = plugin.getSettingsSchema().map((s) => s.key);
    expect(keys).toEqual([
      "guest_base_url",
      "guest_path",
      "guestflow_base_url",
      "guestflow_api_key",
      "guestflow_signing_secret",
      "guestflow_poll_seconds",
    ]);
    expect(plugin.getSettingsSchema().every((s) => !s.required)).toBe(true);
  });

  it("builds invitation links only from an address it would trust", async () => {
    const { plugin } = makePlugin({
      "integration.guest-access.guest_base_url": "http://sowel.example.com",
    });
    await plugin.start();
    const state = await plugin.handlePageRequest({
      method: "GET",
      path: "/state",
      query: {},
      headers: {},
      body: null,
      ip: "1.2.3.4",
      user: { id: "u1", username: "adrien", role: "admin" },
    });
    // Plain HTTP towards another machine would put the code in clear on the
    // wire; no link is better than a link that leaks it.
    expect((state.body as { publicTree: { guestBaseUrl: string | null } }).publicTree.guestBaseUrl)
      .toBeNull();
    await plugin.stop();
  });

  it("says its own door is shut, which is the one thing nobody would guess", async () => {
    const { plugin } = makePlugin({ "plugins.guest-access.public_enabled": "true" });
    await plugin.start();
    const open = await plugin.handlePageRequest({
      method: "GET",
      path: "/state",
      query: {},
      headers: {},
      body: null,
      ip: "1.2.3.4",
      user: { id: "u1", username: "adrien", role: "admin" },
    });
    expect((open.body as { publicTree: { open: boolean } }).publicTree.open).toBe(true);
    await plugin.stop();
  });

  it("tells Sowel it is connected, and disconnected on the way out", async () => {
    const { plugin, events } = makePlugin();
    await plugin.start();
    await plugin.stop();
    expect(events.map((e) => e.type)).toEqual([
      "system.integration.connected",
      "system.integration.disconnected",
    ]);
  });
});
