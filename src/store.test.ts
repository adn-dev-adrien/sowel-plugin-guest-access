import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { AccessStore } from "./store.js";
import type { Access } from "./model.js";

const silent = { info: () => {}, warn: () => {}, error: () => {} };
let dir: string;

function access(over: Partial<Access> = {}): Access {
  return {
    id: "a1",
    kind: "stay",
    label: "Camille",
    gates: ["main"],
    code: "4K7M9QT2",
    source: {
      system: "guestflow",
      reservationId: 42,
      reservationNumber: "202609042",
      property: "Le Gîte",
      revision: 3,
    },
    stayWindow: { from: "2026-09-04T16:00:00.000Z", to: "2026-09-11T09:00:00.000Z" },
    validFrom: null,
    validUntil: null,
    earlyOpenedAt: null,
    extendedUntil: null,
    timeWindows: [],
    suspendedAt: null,
    revokedAt: null,
    devices: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    createdBy: "guestflow",
    updatedAt: "2026-09-01T10:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
    ...over,
  };
}

beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "guest-access-store-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the store", () => {
  it("keeps what it was given across a restart", () => {
    const first = new AccessStore(dir, silent);
    first.insert(access());
    first.record({ accessId: "a1", label: "Camille", kind: "created", actor: "guestflow" });

    const second = new AccessStore(dir, silent);
    expect(second.list()).toHaveLength(1);
    expect(second.get("a1")?.label).toBe("Camille");
    expect(second.journal()).toHaveLength(1);
  });

  it("hands out copies, so a caller cannot edit the store by accident", () => {
    const store = new AccessStore(dir, silent);
    store.insert(access());
    const read = store.get("a1")!;
    read.label = "someone else";
    expect(store.get("a1")?.label).toBe("Camille");
  });

  it("finds an access by its code, however it was typed", () => {
    const store = new AccessStore(dir, silent);
    store.insert(access());
    expect(store.findByCode("4k7m-9qt2")?.id).toBe("a1");
    expect(store.findByCode("4K7M 9QT2")?.id).toBe("a1");
    expect(store.findByCode("nope")).toBeUndefined();
  });

  it("finds an access by a phone's token, and only the right one", () => {
    const store = new AccessStore(dir, silent);
    store.insert(
      access({
        devices: [
          {
            id: "d1",
            // sha256("secret-token")
            tokenHash: "c7e5f5a2a2d1a8a6c0a1e8eb1cbb0a4be8c5b4d8b7a9b9b0f5a9f7d5b2e6f2c1",
            firstSeenAt: "2026-09-04T17:00:00.000Z",
            lastSeenAt: "2026-09-04T17:00:00.000Z",
            userAgent: "iPhone",
          },
        ],
      }),
    );
    expect(store.findByDeviceToken("wrong")).toBeUndefined();
  });

  it("finds a stay by its reservation", () => {
    const store = new AccessStore(dir, silent);
    store.insert(access());
    expect(store.findByReservation(42)?.id).toBe("a1");
    expect(store.findByReservation(43)).toBeUndefined();
  });

  it("knows a code is taken only while it can still open the gate", () => {
    const store = new AccessStore(dir, silent);
    store.insert(access());
    const during = new Date("2026-09-06T00:00:00Z");
    expect(store.isCodeTaken("4K7M9QT2", during)).toBe(true);
    expect(store.isCodeTaken("4K7M9QT2", new Date("2026-10-01T00:00:00Z"))).toBe(false);

    store.update("a1", { revokedAt: "2026-09-05T00:00:00.000Z" });
    expect(store.isCodeTaken("4K7M9QT2", during)).toBe(false);
  });

  it("counts opens from the journal, per access and across the gate", () => {
    const store = new AccessStore(dir, silent);
    const now = new Date("2026-09-06T12:00:00Z");
    store.record({ at: "2026-09-06T11:30:00.000Z", accessId: "a1", label: "C", kind: "opened" });
    store.record({ at: "2026-09-06T11:40:00.000Z", accessId: "a2", label: "L", kind: "opened" });
    store.record({ at: "2026-09-06T09:00:00.000Z", accessId: "a1", label: "C", kind: "opened" });
    const hourAgo = new Date(now.getTime() - 3600_000);
    expect(store.countOpens(hourAgo)).toBe(2);
    expect(store.countOpens(hourAgo, "a1")).toBe(1);
  });

  it("counts a gate's opens apart, lines from before gates counting for the first", () => {
    const store = new AccessStore(dir, silent);
    store.record({ at: "2026-09-06T11:30:00.000Z", accessId: "a1", label: "C", kind: "opened" });
    store.record({ at: "2026-09-06T11:35:00.000Z", accessId: "a1", label: "C", kind: "opened", gate: "main" });
    store.record({ at: "2026-09-06T11:40:00.000Z", accessId: "a1", label: "C", kind: "opened", gate: "g2" });
    const hourAgo = new Date("2026-09-06T11:00:00Z");
    expect(store.countOpens(hourAgo, undefined, "main")).toBe(2);
    expect(store.countOpens(hourAgo, undefined, "g2")).toBe(1);
    expect(store.countOpens(hourAgo)).toBe(3);
  });

  it("reads a file from before gates were plural as one gate every access opens", () => {
    const { gates: _dropped, ...old } = access();
    writeFileSync(resolve(dir, "accesses.json"), JSON.stringify({ version: 1, accesses: [old] }));
    const store = new AccessStore(dir, silent);
    expect(store.get("a1")?.gates).toEqual(["main"]);
    expect(store.gates()).toEqual([]);

    // Rewritten as version 2 on the next change, gates included.
    store.saveGates([{ id: "main", deviceId: "Accès invités", name: "Accès invités", createdAt: "x" }]);
    const raw = JSON.parse(readFileSync(resolve(dir, "accesses.json"), "utf-8"));
    expect(raw).toMatchObject({ version: 2, gates: [{ id: "main" }], accesses: [{ gates: ["main"] }] });
  });

  it("forgets a gate on every access that listed it", () => {
    const store = new AccessStore(dir, silent);
    store.insert(access({ gates: ["main", "g2"] }));
    store.forgetGate("g2");
    expect(new AccessStore(dir, silent).get("a1")?.gates).toEqual(["main"]);
  });

  it("nulls a code a week after the stay ended, and keeps the row", () => {
    const store = new AccessStore(dir, silent);
    store.insert(access());
    expect(store.purge(new Date("2026-09-14T00:00:00Z")).codes).toBe(0);
    expect(store.get("a1")?.code).toBe("4K7M9QT2");

    expect(store.purge(new Date("2026-09-20T00:00:00Z")).codes).toBe(1);
    expect(store.get("a1")?.code).toBeNull();
    expect(store.get("a1")).toBeTruthy();
  });

  it("drops journal lines older than a year, and keeps the rest", () => {
    const store = new AccessStore(dir, silent);
    store.record({ at: "2025-01-01T00:00:00.000Z", accessId: "a1", label: "C", kind: "opened" });
    store.record({ at: "2026-09-01T00:00:00.000Z", accessId: "a1", label: "C", kind: "opened" });
    expect(store.purge(new Date("2026-09-20T00:00:00Z")).journal).toBe(1);
    expect(store.journal()).toHaveLength(1);
  });

  it("keeps a corrupt file aside rather than starting fresh over it", () => {
    writeFileSync(resolve(dir, "accesses.json"), "{ this is not json");
    const warned: unknown[] = [];
    const store = new AccessStore(dir, { ...silent, error: (o) => warned.push(o) });

    expect(store.list()).toEqual([]);
    expect(warned).toHaveLength(1);
    // The unreadable bytes are still on disk under another name.
    const kept = (warned[0] as { kept: string }).kept;
    expect(readFileSync(kept, "utf-8")).toBe("{ this is not json");
  });

  it("writes atomically — no half file is ever the live one", () => {
    const store = new AccessStore(dir, silent);
    store.insert(access());
    const raw = readFileSync(resolve(dir, "accesses.json"), "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw)).toMatchObject({ version: 2 });
  });
});
