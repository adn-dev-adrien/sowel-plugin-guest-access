// ============================================================
// Where the accesses live
//
// Two JSON files in `deps.dataDir` (spec 180): the accesses, and the journal.
// Not a database, deliberately — the whole dataset is a few dozen rows that a
// house changes a handful of times a week, and a file the owner can read with
// `cat` after a power cut is worth more here than a query planner. It also
// rides inside Sowel's backup without anything being taught about it.
//
// Every write is atomic (temp file, then rename), because the one moment this
// file is being rewritten is the one moment the power is allowed to go.
// ============================================================

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Access, JournalEntry, JournalKind } from "./model.js";
import { CODE_RETENTION_DAYS, JOURNAL_RETENTION_DAYS } from "./model.js";
import { normalizeCode, codeMatches, tokenMatches, randomId } from "./codes.js";
import { effectiveWindow } from "./validity.js";

export interface StoreLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

const ACCESSES_FILE = "accesses.json";
const JOURNAL_FILE = "journal.json";
/** Bounded so a busy season cannot grow the file without end. */
const JOURNAL_MAX_ENTRIES = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface AccessesFile {
  version: 1;
  accesses: Access[];
}
interface JournalFile {
  version: 1;
  entries: JournalEntry[];
}

export class AccessStore {
  private readonly dir: string;
  private readonly logger: StoreLogger;
  private accesses: Access[] = [];
  private entries: JournalEntry[] = [];

  constructor(dataDir: string, logger: StoreLogger) {
    this.dir = dataDir;
    this.logger = logger;
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    this.accesses = this.read<AccessesFile>(ACCESSES_FILE, { version: 1, accesses: [] }).accesses;
    this.entries = this.read<JournalFile>(JOURNAL_FILE, { version: 1, entries: [] }).entries;
  }

  // ── Reading ────────────────────────────────────────────────

  list(): Access[] {
    return this.accesses.map((a) => ({ ...a }));
  }

  get(id: string): Access | undefined {
    const found = this.accesses.find((a) => a.id === id);
    return found ? { ...found } : undefined;
  }

  /** The code identifies the stay on its own — there is no lodging picker. */
  findByCode(raw: string): Access | undefined {
    const candidate = normalizeCode(raw);
    if (!candidate) return undefined;
    const found = this.accesses.find((a) => codeMatches(candidate, a.code));
    return found ? { ...found } : undefined;
  }

  findByDeviceToken(token: string): { access: Access; deviceId: string } | undefined {
    if (!token) return undefined;
    for (const access of this.accesses) {
      for (const device of access.devices) {
        if (tokenMatches(token, device.tokenHash)) {
          return { access: { ...access }, deviceId: device.id };
        }
      }
    }
    return undefined;
  }

  findByReservation(reservationId: number): Access | undefined {
    const found = this.accesses.find(
      (a) => a.source?.system === "guestflow" && a.source.reservationId === reservationId,
    );
    return found ? { ...found } : undefined;
  }

  /** Is this code already in use by something that can still open the gate? */
  isCodeTaken(code: string, now: Date): boolean {
    const candidate = normalizeCode(code);
    return this.accesses.some((access) => {
      if (!codeMatches(candidate, access.code)) return false;
      if (access.revokedAt) return false;
      const window = effectiveWindow(access);
      return !window.to || window.to >= now;
    });
  }

  // ── Writing ────────────────────────────────────────────────

  insert(access: Access): Access {
    this.accesses.push(access);
    this.persistAccesses();
    return { ...access };
  }

  update(id: string, patch: Partial<Access>): Access | undefined {
    const index = this.accesses.findIndex((a) => a.id === id);
    if (index < 0) return undefined;
    const updated = { ...this.accesses[index], ...patch, updatedAt: new Date().toISOString() };
    this.accesses[index] = updated;
    this.persistAccesses();
    return { ...updated };
  }

  remove(id: string): boolean {
    const before = this.accesses.length;
    this.accesses = this.accesses.filter((a) => a.id !== id);
    if (this.accesses.length === before) return false;
    this.persistAccesses();
    return true;
  }

  // ── The journal ────────────────────────────────────────────

  record(entry: Omit<JournalEntry, "at"> & { at?: string }): JournalEntry {
    const line: JournalEntry = { at: entry.at ?? new Date().toISOString(), ...entry };
    this.entries.push(line);
    if (this.entries.length > JOURNAL_MAX_ENTRIES) {
      this.entries = this.entries.slice(-JOURNAL_MAX_ENTRIES);
    }
    this.persistJournal();
    return line;
  }

  journal(filter: { accessId?: string; limit?: number } = {}): JournalEntry[] {
    const limit = filter.limit ?? 200;
    return this.entries
      .filter((e) => !filter.accessId || e.accessId === filter.accessId)
      .slice(-limit)
      .reverse();
  }

  /** Opens counted from the journal itself — no second bookkeeping to drift. */
  countOpens(since: Date, accessId?: string): number {
    const from = since.getTime();
    return this.entries.filter(
      (e) =>
        e.kind === "opened" &&
        new Date(e.at).getTime() >= from &&
        (!accessId || e.accessId === accessId),
    ).length;
  }

  countRecent(kind: JournalKind, since: Date, accessId?: string): number {
    const from = since.getTime();
    return this.entries.filter(
      (e) =>
        e.kind === kind &&
        new Date(e.at).getTime() >= from &&
        (!accessId || e.accessId === accessId),
    ).length;
  }

  // ── Housekeeping ───────────────────────────────────────────

  /**
   * Nulls the code of accesses that ended more than a week ago, and drops
   * journal lines older than a year.
   *
   * The code outlives the stay on purpose — for the client who rings back the
   * next morning asking what it was — and dies a week later, because a door
   * code nobody can use is still a door code somebody wrote down.
   */
  purge(now = new Date()): { codes: number; journal: number } {
    const codeCutoff = now.getTime() - CODE_RETENTION_DAYS * DAY_MS;
    let codes = 0;
    for (const access of this.accesses) {
      if (!access.code) continue;
      const window = effectiveWindow(access);
      const ended = window.to ? window.to.getTime() : null;
      if ((ended !== null && ended < codeCutoff) || (access.revokedAt && new Date(access.revokedAt).getTime() < codeCutoff)) {
        access.code = null;
        codes++;
      }
    }

    const journalCutoff = now.getTime() - JOURNAL_RETENTION_DAYS * DAY_MS;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => new Date(e.at).getTime() >= journalCutoff);
    const journal = before - this.entries.length;

    if (codes) this.persistAccesses();
    if (journal) this.persistJournal();
    return { codes, journal };
  }

  // ── Files ──────────────────────────────────────────────────

  private read<T>(name: string, fallback: T): T {
    const path = resolve(this.dir, name);
    if (!existsSync(path)) return fallback;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as T;
      if (!parsed || typeof parsed !== "object") throw new Error("not an object");
      return parsed;
    } catch (err) {
      // Never overwrite what could not be read: a half-written file is the
      // only copy of who may open the gate, and a fresh empty one would lock
      // every guest out with no way back.
      const kept = resolve(this.dir, `${name}.corrupt-${randomId()}`);
      try {
        renameSync(path, kept);
      } catch {
        /* best effort — the log line below is what matters */
      }
      this.logger.error(
        { err, file: name, kept },
        "Guest access store unreadable — kept aside, starting empty",
      );
      return fallback;
    }
  }

  private write(name: string, payload: unknown): void {
    const path = resolve(this.dir, name);
    const temp = `${path}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
      renameSync(temp, path);
    } catch (err) {
      this.logger.error({ err, file: name }, "Failed to write the guest access store");
    }
  }

  private persistAccesses(): void {
    this.write(ACCESSES_FILE, { version: 1, accesses: this.accesses } satisfies AccessesFile);
  }

  private persistJournal(): void {
    this.write(JOURNAL_FILE, { version: 1, entries: this.entries } satisfies JournalFile);
  }
}
