import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFrame, decodeHouseKey } from "./frame-signature.js";
import { createPlugin } from "./index.js";
import { DEVICE_ID } from "./portier-channel.js";
import type { ChannelSocket } from "./portier-channel.js";

const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = readJson("../manifest.json");
const pkg = readJson("../package.json");
const vectors = readJson("../specs/contract-vectors.house.json");

const HOUSE_KEY: string = vectors.K_house;
const KEY = decodeHouseKey(HOUSE_KEY)!;
const NONCE: string = vectors.house_auth.challenge.nonce;
const PLUGIN_DIR = fileURLToPath(new URL("..", import.meta.url));
const DEVICE = { id: "d1", integrationId: "guest-access", sourceDeviceId: DEVICE_ID, name: DEVICE_ID };
const CONFIGURED = { portier_url: "wss://portier.example.test/house/v1", house_key: HOUSE_KEY };

class FakeSocket implements ChannelSocket {
  onopen: ChannelSocket["onopen"] = null;
  onmessage: ChannelSocket["onmessage"] = null;
  onclose: ChannelSocket["onclose"] = null;
  onerror: ChannelSocket["onerror"] = null;
  readonly sent: Array<Record<string, unknown>> = [];

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {}

  deliver(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const started: Array<{ stop(): Promise<void> }> = [];

function setup(settings: Record<string, string>, store = new Map<string, string>()) {
  for (const [key, value] of Object.entries(settings)) store.set(`integration.guest-access.${key}`, value);
  const sockets: FakeSocket[] = [];
  const logs: Array<{ level: string; obj: unknown; msg?: string }> = [];
  const data: Array<Record<string, unknown>> = [];
  const log = (level: string) => (obj: unknown, msg?: string) => {
    logs.push({ level, obj, msg });
  };

  const plugin = createPlugin(
    {
      logger: { info: log("info"), debug: log("debug"), warn: log("warn"), error: log("error") },
      eventBus: { emit: () => {} },
      settingsManager: {
        get: (key) => store.get(key),
        set: (key, value) => {
          store.set(key, value);
        },
      },
      deviceManager: {
        upsertFromDiscovery: () => {},
        updateDeviceData: (_integrationId, _id, payload) => {
          data.push(payload);
        },
        updateDeviceStatus: () => {},
      },
      pluginDir: PLUGIN_DIR,
    },
    {
      socketFactory: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
    },
  );
  started.push(plugin);

  /** Plays Portier's handshake on the latest socket, and returns the plugin's auth. */
  const handshake = (): Record<string, unknown> => {
    const socket = sockets[sockets.length - 1];
    socket.deliver({ type: "challenge", nonce: NONCE, ts: Date.now() });
    const auth = socket.sent[0];
    socket.deliver({ type: "ready", ts: Date.now() });
    return auth;
  };

  const pulse = (commandId: string, seq = 1): void => {
    sockets[sockets.length - 1].deliver(
      buildFrame(KEY, NONCE, "p2h", seq, Date.now(), "pulse", {
        commandId,
        accessLabel: "Gîte · 202609042",
        deadline: Date.now() + 8000,
      }),
    );
  };

  const counters = () => data.filter((payload) => "requests" in payload).map((payload) => payload.requests);

  return { plugin, store, sockets, logs, handshake, pulse, counters };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  for (const plugin of started.splice(0)) await plugin.stop();
  vi.useRealTimers();
});

describe("the package", () => {
  it("is version 1.0.0, in the manifest and in package.json", () => {
    expect(manifest.version).toBe("1.0.0");
    expect(pkg.version).toBe("1.0.0");
  });

  it("declares the settings of spec §3.6, and the plugin returns exactly the manifest's", () => {
    const { plugin } = setup({});
    expect(manifest.settings.map((s: { key: string }) => s.key)).toEqual(["portier_url", "house_key", "ping_minutes"]);
    expect(plugin.getSettingsSchema()).toEqual(manifest.settings);
    const byKey = Object.fromEntries(manifest.settings.map((s: { key: string }) => [s.key, s]));
    expect(byKey.portier_url.required).toBe(true);
    expect(byKey.house_key).toMatchObject({ type: "password", required: true });
    expect(byKey.ping_minutes).toMatchObject({ type: "number", required: false, defaultValue: "10" });
  });
});

describe("configuration", () => {
  it("is not configured without the URL or the key, and opens nothing", async () => {
    const cases = [
      {},
      { portier_url: CONFIGURED.portier_url },
      { house_key: HOUSE_KEY },
      { portier_url: "   ", house_key: HOUSE_KEY },
    ];
    for (const settings of cases) {
      const { plugin, sockets } = setup(settings);
      expect(plugin.isConfigured()).toBe(false);
      await plugin.start();
      expect(plugin.getStatus()).toBe("not_configured");
      expect(sockets).toHaveLength(0);
    }
  });

  it("refuses ws:// to another machine at start, and says so", async () => {
    const { plugin, sockets, logs } = setup({ ...CONFIGURED, portier_url: "ws://portier.lan/house/v1" });
    await plugin.start();
    expect(sockets).toHaveLength(0);
    expect(plugin.getStatus()).toBe("error");
    expect(logs.some((entry) => entry.level === "error" && (entry.msg ?? "").includes("wss://"))).toBe(true);
  });

  it("accepts ws:// to localhost, for development", async () => {
    const { plugin, sockets } = setup({ ...CONFIGURED, portier_url: "ws://localhost:4101/house/v1" });
    await plugin.start();
    expect(sockets.map((socket) => socket.url)).toEqual(["ws://localhost:4101/house/v1"]);
  });

  it("refuses a house key that is not the base64url text of 32 bytes — without logging it", async () => {
    const { plugin, sockets, logs } = setup({ ...CONFIGURED, house_key: "correct horse battery staple" });
    await plugin.start();
    expect(sockets).toHaveLength(0);
    expect(plugin.getStatus()).toBe("error");
    expect(JSON.stringify(logs)).not.toContain("correct horse");
  });

  it.each([
    [undefined, 600],
    ["1", 60],
    ["10", 600],
    ["30", 1800],
  ])("ping_minutes %s is declared to Portier as pingSeconds %i", async (minutes, seconds) => {
    const { plugin, handshake, logs } = setup(
      minutes === undefined ? CONFIGURED : { ...CONFIGURED, ping_minutes: minutes },
    );
    await plugin.start();
    expect(handshake().pingSeconds).toBe(seconds);
    expect(logs.some((entry) => entry.level === "warn")).toBe(false);
  });

  it.each(["0", "31", "45", "2.5", "ten"])("ping_minutes %s falls back to 10, with a warning", async (minutes) => {
    const { plugin, handshake, logs } = setup({ ...CONFIGURED, ping_minutes: minutes });
    await plugin.start();
    expect(handshake().pingSeconds).toBe(600);
    expect(logs.some((entry) => entry.level === "warn" && (entry.msg ?? "").includes("ping_minutes"))).toBe(true);
  });

  it("tells Portier the manifest's version", async () => {
    const { plugin, handshake } = setup(CONFIGURED);
    await plugin.start();
    expect(handshake().pluginVersion).toBe(manifest.version);
  });
});

describe("status", () => {
  it("follows the channel: disconnected until ready, connected, then error once the key is refused", async () => {
    const { plugin, sockets, handshake } = setup(CONFIGURED);
    await plugin.start();
    expect(plugin.getStatus()).toBe("disconnected");
    handshake();
    expect(plugin.getStatus()).toBe("connected");
    sockets[0].onclose?.({ code: 1001, reason: "" });
    expect(plugin.getStatus()).toBe("disconnected");
    vi.advanceTimersByTime(1000);
    sockets[1].onclose?.({ code: 4401, reason: "" });
    expect(plugin.getStatus()).toBe("error");
  });
});

describe("orders", () => {
  it("are refused before start", async () => {
    const { plugin } = setup(CONFIGURED);
    await expect(plugin.executeOrder(DEVICE, "result", "opened")).rejects.toThrow(/not started/);
  });

  it("result accepts opened, refused and error — already_open is gone", async () => {
    const { plugin } = setup(CONFIGURED);
    await plugin.start();
    for (const status of ["opened", "refused", "error"]) {
      await expect(plugin.executeOrder(DEVICE, "result", status)).resolves.toBeUndefined();
    }
    await expect(plugin.executeOrder(DEVICE, "result", "already_open")).rejects.toThrow(/Unknown outcome/);
  });

  it("gate_state accepts open, closed and unknown", async () => {
    const { plugin } = setup(CONFIGURED);
    await plugin.start();
    for (const state of ["open", "closed", "unknown"]) {
      await expect(plugin.executeOrder(DEVICE, "gate_state", state)).resolves.toBeUndefined();
    }
    await expect(plugin.executeOrder(DEVICE, "gate_state", "ajar")).rejects.toThrow(/Unknown gate state/);
  });

  it("reads the order key from a dispatch config too, and refuses an unknown one", async () => {
    const { plugin } = setup(CONFIGURED);
    await plugin.start();
    await expect(plugin.executeOrder(DEVICE, { key: "result" }, "opened")).resolves.toBeUndefined();
    await expect(plugin.executeOrder(DEVICE, { orderKey: "gate_state" }, "open")).resolves.toBeUndefined();
    await expect(plugin.executeOrder(DEVICE, "pulse", "now")).rejects.toThrow(/Unsupported order/);
  });

  it("are refused for another device — v0.3's `guest-access` id included, which matched no device", async () => {
    const { plugin } = setup(CONFIGURED);
    await plugin.start();
    await expect(
      plugin.executeOrder({ ...DEVICE, sourceDeviceId: "guest-access" }, "result", "opened"),
    ).rejects.toThrow(/Unknown device/);
  });

  it("send the recipe's outcome to Portier for the command in flight", async () => {
    const { plugin, sockets, handshake, pulse } = setup(CONFIGURED);
    await plugin.start();
    handshake();
    pulse("c1");
    await plugin.executeOrder(DEVICE, "result", "opened");
    const result = sockets[0].sent.find((message) => message.type === "result");
    expect(result?.payload).toEqual({ commandId: "c1", status: "opened", detail: "" });
  });

  it("send the gate contact to Portier", async () => {
    const { plugin, sockets, handshake } = setup(CONFIGURED);
    await plugin.start();
    handshake();
    await plugin.executeOrder(DEVICE, "gate_state", "closed");
    const frame = sockets[0].sent.find((message) => message.type === "gate_state");
    expect((frame?.payload as { state: string }).state).toBe("closed");
  });
});

describe("the request counter", () => {
  it("keeps counting up across a restart, so the recipe never misses the first command after one", async () => {
    const store = new Map<string, string>();
    const first = setup(CONFIGURED, store);
    await first.plugin.start();
    first.handshake();
    first.pulse("c1");
    expect(first.counters()).toEqual([1]);
    await first.plugin.stop();

    const second = setup({}, store);
    await second.plugin.start();
    second.handshake();
    second.pulse("c2");
    expect(second.counters()).toEqual([2]);
    expect(store.get("integration.guest-access.requests_count")).toBe("2");
  });
});
