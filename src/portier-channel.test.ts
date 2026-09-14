import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFrame, decodeHouseKey, signAuth, verifyFrame } from "./frame-signature.js";
import type { SignedFrame } from "./frame-signature.js";
import {
  BACKOFF_SECONDS,
  CEILING_PER_HOUR,
  DEVICE_ID,
  KEY_REFUSED_MESSAGE,
  PortierChannel,
  REQUESTS_KEY,
  describeDevice,
} from "./portier-channel.js";
import type { ChannelSocket } from "./portier-channel.js";

// The channel is the whole plugin: everything else is wiring. No network here — a fake socket
// stands in for the WebSocket, and a fake Portier signs its frames with the contract's test key.

const vectors = JSON.parse(
  readFileSync(new URL("../specs/contract-vectors.house.json", import.meta.url), "utf8"),
);
const KEY = decodeHouseKey(vectors.K_house)!;
const OTHER_KEY = Buffer.alloc(32, 7);
const T0: number = vectors.house_auth.challenge.ts;
const COMMAND = "0d9e8f7a-6b5c-4d3e-9f2a-1b0c9d8e7f6a";

type Message = Record<string, unknown>;

/** A distinct 16-byte nonce per connection, base64url like Portier's. */
const nonceFor = (n: number): string => Buffer.alloc(16, n).toString("base64url");

class FakeSocket implements ChannelSocket {
  onopen: ChannelSocket["onopen"] = null;
  onmessage: ChannelSocket["onmessage"] = null;
  onclose: ChannelSocket["onclose"] = null;
  onerror: ChannelSocket["onerror"] = null;
  /** Every text the house wrote, as written — key order included. */
  readonly raw: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  /** Sees each message the house writes, the way Portier would read it. */
  listener: ((message: Message) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.raw.push(data);
    this.listener?.(JSON.parse(data) as Message);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  deliver(message: unknown): void {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }

  serverClose(code: number, reason = ""): void {
    this.onclose?.({ code, reason });
  }

  frames(type?: string): SignedFrame[] {
    return this.raw
      .map((text) => JSON.parse(text) as SignedFrame)
      .filter((message) => typeof message.seq === "number" && (!type || message.type === type));
  }
}

/** Portier's end of one connection: its nonce, its clock, its sequence. */
class Portier {
  private seq = 0;

  constructor(
    readonly socket: FakeSocket,
    readonly nonce: string,
    readonly skewMs = 0,
  ) {}

  now(): number {
    return Date.now() + this.skewMs;
  }

  challenge(): void {
    this.socket.onopen?.({});
    this.socket.deliver({ type: "challenge", nonce: this.nonce, ts: this.now() });
  }

  ready(): void {
    this.socket.deliver({ type: "ready", ts: this.now() });
  }

  /** A frame signed for this connection; `over` forges the part a test wants wrong. */
  sign(type: string, payload: Message, over: { seq?: number; key?: Buffer } = {}): SignedFrame {
    let seq = over.seq;
    if (seq === undefined) {
      this.seq += 1;
      seq = this.seq;
    }
    return buildFrame(over.key ?? KEY, this.nonce, "p2h", seq, this.now(), type, payload);
  }

  send(type: string, payload: Message, over: { seq?: number; key?: Buffer } = {}): SignedFrame {
    const frame = this.sign(type, payload, over);
    this.socket.deliver(frame);
    return frame;
  }

  pulse(commandId = COMMAND, over: { deadline?: number; label?: string } = {}): SignedFrame {
    return this.send("pulse", {
      commandId,
      accessLabel: over.label ?? "Gîte · 202609042",
      deadline: over.deadline ?? this.now() + 8000,
    });
  }

  pong(): SignedFrame {
    return this.send("pong", {});
  }

  /** Answers every ping 100 ms later, as a live Portier would. */
  answerPings(): void {
    this.socket.listener = (message) => {
      if (message.type === "ping") setTimeout(() => this.pong(), 100);
    };
  }

  results(): Message[] {
    return this.socket.frames("result").map((frame) => frame.payload);
  }
}

function harness(
  over: { pingMinutes?: number; initialRequestCount?: number; failingAttempts?: number; houseKey?: Buffer } = {},
) {
  const sockets: FakeSocket[] = [];
  let attempts = 0;
  const data: Message[] = [];
  const deviceIds: string[] = [];
  const statuses: string[] = [];
  const discovered: Message[] = [];
  const events: Message[] = [];
  const logs: Array<{ level: string; obj: unknown; msg?: string }> = [];
  const persisted: number[] = [];
  const log = (level: string) => (obj: unknown, msg?: string) => {
    logs.push({ level, obj, msg });
  };

  const channel = new PortierChannel({
    integrationId: "guest-access",
    url: "wss://portier.example.test/house/v1",
    houseKey: over.houseKey ?? KEY,
    pingMinutes: over.pingMinutes ?? 10,
    pluginVersion: "1.0.0",
    initialRequestCount: over.initialRequestCount,
    onRequestCount: (count) => persisted.push(count),
    deviceManager: {
      upsertFromDiscovery: (_integrationId, _source, device) => discovered.push(device as Message),
      updateDeviceData: (_integrationId, id, payload) => {
        deviceIds.push(id);
        data.push(payload);
      },
      updateDeviceStatus: (_integrationId, id, status) => {
        deviceIds.push(id);
        statuses.push(status);
      },
    },
    eventBus: { emit: (event) => events.push(event) },
    logger: { info: log("info"), debug: log("debug"), warn: log("warn"), error: log("error") },
    socketFactory: (url) => {
      attempts += 1;
      if (attempts <= (over.failingAttempts ?? 0)) throw new Error("getaddrinfo ENOTFOUND");
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  });

  return {
    channel,
    sockets,
    data,
    deviceIds,
    statuses,
    discovered,
    events,
    logs,
    persisted,
    attempts: () => attempts,
    last: () => sockets[sockets.length - 1],
    counters: () => data.filter((payload) => REQUESTS_KEY in payload).map((payload) => payload[REQUESTS_KEY]),
    links: () => data.filter((payload) => "link" in payload).map((payload) => payload.link),
    logged: (level: string, text: string) =>
      logs.some((entry) => entry.level === level && (entry.msg ?? "").includes(text)),
    /** Plays a whole handshake on the latest socket. */
    open(skewMs = 0): Portier {
      const portier = new Portier(sockets[sockets.length - 1], nonceFor(sockets.length), skewMs);
      portier.challenge();
      portier.ready();
      return portier;
    },
  };
}

type Harness = ReturnType<typeof harness>;

/** The next connection attempt comes exactly `seconds` from now — not a millisecond sooner. */
function expectNextAttemptAfter(h: Harness, seconds: number): void {
  const before = h.attempts();
  vi.advanceTimersByTime(seconds * 1000 - 1);
  expect(h.attempts()).toBe(before);
  vi.advanceTimersByTime(1);
  expect(h.attempts()).toBe(before + 1);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the device", () => {
  it("keeps the data and orders the recipe uses, and no longer offers already_open", () => {
    const device = describeDevice() as {
      friendlyName: string;
      data: Array<{ key: string; type: string }>;
      orders: Array<{ key: string; enumValues: string[] }>;
    };
    expect(device.data.map((d) => d.key)).toEqual(["requests", "last_request_at", "last_stay", "link"]);
    expect(device.data.find((d) => d.key === REQUESTS_KEY)!.type).toBe("number");
    expect(device.orders.map((o) => o.key)).toEqual(["result", "gate_state"]);
    expect(device.orders.find((o) => o.key === "result")!.enumValues).toEqual(["opened", "refused", "error"]);
    expect(device.orders.find((o) => o.key === "gate_state")!.enumValues).toEqual(["open", "closed", "unknown"]);
  });

  it("publishes under the very name it is declared with — the id Sowel finds a device by", () => {
    const h = harness();
    h.channel.start();
    h.open().pulse();
    expect(h.discovered[0].friendlyName).toBe(DEVICE_ID);
    expect(new Set(h.deviceIds)).toEqual(new Set([DEVICE_ID]));
  });
});

describe("the challenge", () => {
  it("is answered as in Portier's pinned vector, with the plugin version and the ping in seconds", () => {
    const h = harness();
    h.channel.start();
    const socket = h.last();
    socket.onopen?.({});
    socket.deliver(vectors.house_auth.challenge);
    expect(socket.raw).toEqual([
      JSON.stringify({ type: "auth", sig: vectors.house_auth.sig, pluginVersion: "1.0.0", pingSeconds: 600 }),
    ]);
  });

  it("declares ping_minutes as pingSeconds", () => {
    const h = harness({ pingMinutes: 3 });
    h.channel.start();
    h.open();
    expect(JSON.parse(h.last().raw[0]).pingSeconds).toBe(180);
  });

  it("a wrong key yields 4401: « clé de la maison refusée par Portier », and 60 s before the next attempt", () => {
    const h = harness({ houseKey: OTHER_KEY });
    h.channel.start();
    const socket = h.last();
    // Portier checks the answer with the key IT holds.
    socket.listener = (message) => {
      if (message.type === "auth" && message.sig !== signAuth(KEY, nonceFor(1), T0)) {
        setTimeout(() => socket.serverClose(4401, "bad auth"), 0);
      }
    };
    new Portier(socket, nonceFor(1)).challenge();
    vi.advanceTimersByTime(0);

    expect(h.logged("error", KEY_REFUSED_MESSAGE)).toBe(true);
    expect(h.channel.isKeyRefused()).toBe(true);
    expect(h.links()).toEqual([false]);
    expectNextAttemptAfter(h, 60);

    // Still refused, or the network failing after it: never back to 1 s.
    h.last().serverClose(4401);
    expectNextAttemptAfter(h, 60);
    h.last().serverClose(1006);
    expectNextAttemptAfter(h, 60);
  });

  it("is refused when Portier's clock is more than 2 minutes away — logged, closed, back-off", () => {
    const h = harness();
    h.channel.start();
    new Portier(h.last(), nonceFor(1), 120_001).challenge();
    expect(h.last().raw).toEqual([]);
    expect(h.last().closed?.code).toBe(4400);
    expect(h.logged("error", "clock")).toBe(true);
    expect(h.links()).toEqual([false]);
    expectNextAttemptAfter(h, 1);
  });

  it("is accepted at exactly 2 minutes away", () => {
    const h = harness();
    h.channel.start();
    h.open(-120_000);
    expect(h.links()).toEqual([false, true]);
  });

  it("gives Portier 15 s to complete the handshake, then closes and retries", () => {
    const h = harness();
    h.channel.start();
    h.last().onopen?.({});
    vi.advanceTimersByTime(14_999);
    expect(h.last().closed).toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.last().closed?.code).toBe(1000);
    expectNextAttemptAfter(h, 1);
  });

  it("a message out of order during the handshake closes with 4400", () => {
    const h = harness();
    h.channel.start();
    h.last().deliver({ type: "ready", ts: T0 });
    expect(h.last().closed?.code).toBe(4400);
  });
});

describe("frames from Portier", () => {
  it("a bad signature closes with 4400, and reconnects", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.send(
      "pulse",
      { commandId: COMMAND, accessLabel: "Gîte · 202609042", deadline: portier.now() + 8000 },
      { key: OTHER_KEY },
    );
    expect(h.last().closed?.code).toBe(4400);
    expect(h.counters()).toEqual([]);
    expect(h.links()).toEqual([false, true, false]);
    expect(h.logs.some((entry) => entry.level === "error")).toBe(true);
    expectNextAttemptAfter(h, 1);
  });

  it("a sequence gap closes with 4400", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.pong();
    expect(h.last().closed).toBeNull();
    portier.send("pong", {}, { seq: 3 });
    expect(h.last().closed?.code).toBe(4400);
  });

  it("a repeated sequence number closes with 4400", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.pong();
    portier.send("pong", {}, { seq: 1 });
    expect(h.last().closed?.code).toBe(4400);
  });

  it("a frame recorded on a previous connection is refused", () => {
    const h = harness();
    h.channel.start();
    const recorded = h.open().pulse();
    expect(h.counters()).toEqual([1]);
    h.channel.report("opened");
    h.last().serverClose(1001, "restarting");
    vi.advanceTimersByTime(1000);

    h.open();
    h.last().deliver(recorded); // seq 1 and a valid signature — for the previous connection's nonce
    expect(h.last().closed?.code).toBe(4400);
    expect(h.counters()).toEqual([1]);
  });

  it("a payload whose keys come in another order no longer verifies", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    const frame = portier.sign("pulse", { commandId: COMMAND, accessLabel: "Gîte", deadline: portier.now() + 8000 });
    const { commandId, accessLabel, deadline } = frame.payload;
    h.last().deliver({ ...frame, payload: { deadline, commandId, accessLabel } });
    expect(h.last().closed?.code).toBe(4400);
    expect(h.counters()).toEqual([]);
  });

  it("something that is not a frame closes with 4400", () => {
    const h = harness();
    h.channel.start();
    h.open();
    h.last().deliver("{not json");
    expect(h.last().closed?.code).toBe(4400);
  });

  it("an unknown frame type is ignored with a warning, and still counts in the sequence", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.send("hello", {});
    expect(h.last().closed).toBeNull();
    expect(h.logged("warn", "Unknown frame type")).toBe(true);
    portier.pong();
    expect(h.last().closed).toBeNull();
  });

  it("a replacement by a newer connection (4409) is logged and followed by the back-off", () => {
    const h = harness();
    h.channel.start();
    h.open();
    h.last().serverClose(4409, "replaced");
    expect(h.logged("warn", "replaced")).toBe(true);
    expectNextAttemptAfter(h, 1);
  });
});

describe("reconnecting", () => {
  it("waits 1, 2, 5, 10, 30, then 60 s at most between attempts", () => {
    const h = harness();
    h.channel.start();
    expect(h.attempts()).toBe(1); // the first attempt does not wait
    for (const seconds of [1, 2, 5, 10, 30, 60, 60]) {
      h.last().serverClose(1006);
      expectNextAttemptAfter(h, seconds);
    }
    expect(BACKOFF_SECONDS).toEqual([1, 2, 5, 10, 30, 60]);
  });

  it("starts the sequence again once a connection has held 60 s", () => {
    const h = harness();
    h.channel.start();
    h.last().serverClose(1006);
    expectNextAttemptAfter(h, 1);
    h.last().serverClose(1006);
    expectNextAttemptAfter(h, 2);

    h.open();
    vi.advanceTimersByTime(59_999);
    h.last().serverClose(1006);
    expectNextAttemptAfter(h, 5); // held just under a minute: the sequence carries on

    h.open();
    vi.advanceTimersByTime(60_000);
    h.last().serverClose(1000);
    expectNextAttemptAfter(h, 1);
  });

  it("a socket that cannot even be created follows the same back-off", () => {
    const h = harness({ failingAttempts: 2 });
    h.channel.start();
    expect(h.sockets).toHaveLength(0);
    expect(h.logs.some((entry) => entry.level === "error")).toBe(true);
    expectNextAttemptAfter(h, 1);
    expectNextAttemptAfter(h, 2);
    expect(h.sockets).toHaveLength(1);
  });
});

describe("keep-alive", () => {
  it("sends a signed ping every ping_minutes", () => {
    const h = harness({ pingMinutes: 3 });
    h.channel.start();
    const portier = h.open();

    vi.advanceTimersByTime(3 * 60_000 - 1);
    expect(h.last().frames("ping")).toHaveLength(0);
    vi.advanceTimersByTime(1);
    const [ping] = h.last().frames("ping");
    expect(ping.payload).toEqual({});
    expect(verifyFrame(KEY, portier.nonce, "h2p", ping)).toBe(true);

    portier.pong();
    vi.advanceTimersByTime(3 * 60_000);
    expect(h.last().frames("ping").map((frame) => frame.seq)).toEqual([1, 2]);
    expect(h.last().closed).toBeNull();
  });

  it("a pong 10 s late closes the channel and reconnects", () => {
    const h = harness();
    h.channel.start();
    h.open();
    vi.advanceTimersByTime(10 * 60_000);
    expect(h.last().frames("ping")).toHaveLength(1);

    vi.advanceTimersByTime(9_999);
    expect(h.last().closed).toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.last().closed?.code).toBe(1000);
    expect(h.links()).toEqual([false, true, false]);
    expect(h.logged("warn", "pong")).toBe(true);
    expectNextAttemptAfter(h, 1); // it had held ten minutes: the sequence starts again
  });

  it("a pong in time keeps the channel open", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    vi.advanceTimersByTime(10 * 60_000 + 9_000);
    portier.pong();
    vi.advanceTimersByTime(60_000);
    expect(h.last().closed).toBeNull();
    expect(h.links()).toEqual([false, true]);
  });
});

describe("pulses", () => {
  it("a pulse bumps the counter, names the stay and waits for the recipe", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    vi.advanceTimersByTime(1500);
    portier.pulse();
    expect(h.data.at(-1)).toEqual({
      requests: 1,
      last_request_at: new Date(T0 + 1500).toISOString(),
      last_stay: "Gîte · 202609042",
    });
    expect(h.persisted).toEqual([1]);
    expect(portier.results()).toEqual([]);
  });

  it("the recipe's outcome goes up as a signed result frame for the command in flight", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.pulse();
    h.channel.report("opened");

    const [frame] = h.last().frames("result");
    expect(frame.payload).toEqual({ commandId: COMMAND, status: "opened", detail: "" });
    expect(verifyFrame(KEY, portier.nonce, "h2p", frame)).toBe(true);
    expect(h.last().raw.at(-1)).toBe(
      JSON.stringify({
        seq: 1,
        ts: frame.ts,
        type: "result",
        payload: { commandId: COMMAND, status: "opened", detail: "" },
        sig: frame.sig,
      }),
    );
  });

  it("an outcome with no command in flight is ignored with a warning", () => {
    const h = harness();
    h.channel.start();
    h.open();
    h.channel.report("opened");
    expect(h.last().frames()).toEqual([]);
    expect(h.logged("warn", "no command in flight")).toBe(true);
  });

  it("an outcome is attributed once: a second one has nothing to answer", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.pulse();
    h.channel.report("opened");
    h.channel.report("error");
    expect(portier.results()).toHaveLength(1);
  });

  it("an expired pulse answers error expired and leaves requests untouched", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.pulse(COMMAND, { deadline: portier.now() - 1 });
    expect(portier.results()).toEqual([{ commandId: COMMAND, status: "error", detail: "expired" }]);
    expect(h.counters()).toEqual([]);
    expect(h.persisted).toEqual([]);
  });

  it("the deadline is read in Portier's clock: 90 s behind, a fresh pulse is not expired", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open(-90_000);
    portier.pulse(); // its deadline is 82 s in this house's past
    expect(h.counters()).toEqual([1]);
    expect(portier.results()).toEqual([]);
  });

  it("the deadline is read in Portier's clock: 90 s ahead, a passed deadline is expired", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open(90_000);
    portier.pulse(COMMAND, { deadline: portier.now() - 1 }); // 89 s in this house's future
    expect(portier.results()).toEqual([{ commandId: COMMAND, status: "error", detail: "expired" }]);
    expect(h.counters()).toEqual([]);
  });

  it("a pulse while one is in flight answers error busy", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.pulse("a");
    portier.pulse("b");
    expect(portier.results()).toEqual([{ commandId: "b", status: "error", detail: "busy" }]);
    expect(h.counters()).toEqual([1]);

    h.channel.report("opened");
    expect(portier.results().at(-1)).toEqual({ commandId: "a", status: "opened", detail: "" });
    portier.pulse("c");
    expect(h.counters()).toEqual([1, 2]);
  });

  it("a command the recipe never answered stops holding the place once its deadline has passed", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.pulse("a");
    vi.advanceTimersByTime(8_001);
    portier.pulse("b");
    expect(h.counters()).toEqual([1, 2]);
    expect(portier.results()).toEqual([]);
    expect(h.logged("warn", "did not answer")).toBe(true);
    h.channel.report("refused");
    expect(portier.results()).toEqual([{ commandId: "b", status: "refused", detail: "" }]);
  });

  it("the 31st pulse in a rolling hour answers refused ceiling, without touching the counter", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    portier.answerPings();

    for (let i = 0; i < CEILING_PER_HOUR; i += 1) {
      portier.pulse(`cmd-${i}`);
      h.channel.report("opened");
      vi.advanceTimersByTime(1000);
    }
    expect(h.counters()).toHaveLength(30);

    portier.pulse("cmd-30");
    expect(portier.results().at(-1)).toEqual({ commandId: "cmd-30", status: "refused", detail: "ceiling" });
    expect(h.counters()).toHaveLength(30);
    expect(h.persisted).toHaveLength(30);

    // An hour after the first one, it has left the window.
    vi.advanceTimersByTime(3_600_000 - 30_000);
    portier.pulse("cmd-31");
    expect(h.counters().at(-1)).toBe(31);
    expect(h.last().closed).toBeNull();
  });

  it("the counter carries on from its last value after a restart", () => {
    const h = harness({ initialRequestCount: 7 });
    h.channel.start();
    h.open().pulse();
    expect(h.counters()).toEqual([8]);
    expect(h.persisted).toEqual([8]);
  });
});

describe("the gate contact", () => {
  it("a gate_state order becomes a signed gate_state frame", () => {
    const h = harness();
    h.channel.start();
    const portier = h.open();
    vi.advanceTimersByTime(2000);
    h.channel.setGateState("open");

    const [frame] = h.last().frames("gate_state");
    expect(frame.payload).toEqual({ state: "open", at: new Date(T0 + 2000).toISOString() });
    expect(Object.keys(frame.payload)).toEqual(["state", "at"]);
    expect(verifyFrame(KEY, portier.nonce, "h2p", frame)).toBe(true);
  });

  it("nothing goes out while the channel is down; the latest contact goes up after ready", () => {
    const h = harness();
    h.channel.start();
    h.channel.setGateState("closed");
    h.channel.setGateState("open");
    expect(h.last().raw).toEqual([]);
    h.open();
    expect(h.last().frames("gate_state").map((frame) => frame.payload.state)).toEqual(["open"]);
  });
});

describe("the house's own frames", () => {
  it("are numbered from 1 on each connection", () => {
    const h = harness();
    h.channel.start();
    h.open().pulse();
    h.channel.report("opened");
    h.channel.setGateState("closed");
    expect(h.last().frames().map((frame) => frame.seq)).toEqual([1, 2]);

    h.last().serverClose(1001);
    vi.advanceTimersByTime(1000);
    h.open(); // the contact goes up again: seq 1
    h.channel.setGateState("open");
    expect(h.last().frames().map((frame) => frame.seq)).toEqual([1, 2]);
  });

  it("buffer nothing: an outcome after the channel dropped is lost, never sent on the next one", () => {
    const h = harness();
    h.channel.start();
    h.open().pulse();
    h.last().serverClose(1006);
    expect(h.logged("warn", "command in flight")).toBe(true);
    vi.advanceTimersByTime(1000);
    h.open();
    h.channel.report("opened");
    expect(h.last().frames("result")).toEqual([]);
  });
});

describe("link", () => {
  it("is false before ready, true between ready and the close, false after", () => {
    const h = harness();
    h.channel.start();
    expect(h.links()).toEqual([false]);
    expect(h.statuses).toEqual(["offline"]);
    expect(h.events).toEqual([]);

    const portier = new Portier(h.last(), nonceFor(1));
    portier.challenge();
    expect(h.links()).toEqual([false]);
    expect(h.channel.isConnected()).toBe(false);

    portier.ready();
    expect(h.links()).toEqual([false, true]);
    expect(h.channel.isConnected()).toBe(true);
    expect(h.statuses).toEqual(["offline", "online"]);

    h.last().serverClose(1001);
    expect(h.links()).toEqual([false, true, false]);
    expect(h.channel.isConnected()).toBe(false);
    expect(h.events.map((event) => event.type)).toEqual([
      "system.integration.connected",
      "system.integration.disconnected",
    ]);
  });
});

describe("stopping", () => {
  it("closes the socket, takes the link down and never reconnects", async () => {
    const h = harness();
    h.channel.start();
    h.open();
    await h.channel.stop();
    expect(h.last().closed).toEqual({ code: 1000, reason: "plugin stopped" });
    expect(h.links().at(-1)).toBe(false);
    const attempts = h.attempts();
    vi.advanceTimersByTime(10 * 60_000);
    expect(h.attempts()).toBe(attempts);
  });

  it("stopping between two attempts cancels the next one", async () => {
    const h = harness();
    h.channel.start();
    h.last().serverClose(1006);
    await h.channel.stop();
    vi.advanceTimersByTime(120_000);
    expect(h.attempts()).toBe(1);
  });

  it("starting twice keeps one connection", () => {
    const h = harness();
    h.channel.start();
    h.channel.start();
    expect(h.sockets).toHaveLength(1);
    expect(h.discovered).toHaveLength(1);
  });
});
