// ============================================================
// What an access is
//
// One shape for both kinds, because the owner's list shows them side by side
// and every rule that is not about where an access CAME FROM applies to both.
// A `stay` access carries a `source` and a window guestFlow computed; a
// `manual` one carries a validity the owner typed. Everything else — the code,
// the phones, the hours, the suspension, the journal — is common.
// ============================================================

export type AccessKind = "stay" | "manual";

/** Where a `stay` access came from. Only guestFlow writes this today. */
export interface AccessSource {
  system: "guestflow";
  reservationId: number;
  reservationNumber: string | null;
  property: string | null;
  /** The feed revision that last wrote this access — see `guestflow.ts`. */
  revision: number;
}

/** A phone that has been set up on an access. */
export interface AccessDevice {
  id: string;
  /**
   * SHA-256 of the token handed to the phone. The token itself is never stored:
   * unlike the door code, nobody ever has to read it out over the telephone.
   */
  tokenHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  userAgent: string;
}

/** `08:00` → `20:00`, on the Paris wall clock, every day. */
export interface TimeWindow {
  from: string;
  to: string;
}

export interface Access {
  id: string;
  kind: AccessKind;
  /** Who it is for. Required — an access named « — » is one nobody dares delete. */
  label: string;
  /**
   * The code, in clear.
   *
   * Deliberate, and the reason is the telephone: a guest who rings up because
   * their phone is flat must be read their code, which a hash forbids. It is a
   * door code for one stay, it lives on the house's own machine, and the purge
   * nulls it seven days after the access ends. What is hashed is the phone's
   * token (`AccessDevice.tokenHash`), which nobody ever dictates.
   */
  code: string | null;
  source: AccessSource | null;
  /** Instants, as guestFlow computed them (check-in → check-out + 1 h). */
  stayWindow: { from: string; to: string } | null;
  /** A manual access: an instant range, or both null for « always ». */
  validFrom: string | null;
  validUntil: string | null;
  /** Owner's overrides on a stay. They can only ever widen (see `validity.ts`). */
  earlyOpenedAt: string | null;
  extendedUntil: string | null;
  timeWindows: TimeWindow[];
  suspendedAt: string | null;
  revokedAt: string | null;
  devices: AccessDevice[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  lastUsedAt: string | null;
  useCount: number;
}

export type JournalKind =
  | "created"
  | "edited"
  | "suspended"
  | "resumed"
  | "revoked"
  | "deleted"
  | "invitation"
  | "regenerated"
  | "enrolled"
  | "opened"
  | "refused"
  | "failed"
  | "bad_code"
  | "guessing"
  | "stay_updated"
  | "stay_cancelled";

/**
 * One line of the journal.
 *
 * The label is copied in rather than looked up: the journal answers « who came
 * in that night », and it has to keep answering it after the access is gone.
 */
export interface JournalEntry {
  at: string;
  accessId: string | null;
  label: string;
  kind: JournalKind;
  /** Machine reason (`out_of_window`, `suspended`…), never a sentence. */
  reason?: string;
  /** `guestflow`, a Sowel username, or `guest`. */
  actor?: string;
}

/** Why a press was refused. The guest app turns these into sentences. */
export type RefusalReason =
  | "suspended"
  | "revoked"
  | "not_yet_active"
  | "expired"
  | "outside_hours"
  | "too_many_opens"
  | "gate_busy"
  | "no_answer"
  | "refused_by_house"
  | "gate_error";

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";
export const CODE_LENGTH = 8;

/** Ceilings, per spec §6. Counted per access and across the gate. */
export const MAX_OPENS_PER_ACCESS_PER_HOUR = 12;
export const MAX_OPENS_PER_GATE_PER_HOUR = 30;
/**
 * The anti-guessing budget, counted on FAILURES and counted GLOBALLY.
 *
 * Not per IP, and that is not a simplification: behind a reverse proxy — which
 * is where this page is always served from — the plugin is handed the proxy's
 * address, never the visitor's. « Five tries per IP » therefore meant five
 * tries for the whole internet, and five wrong codes from anywhere shut every
 * guest out for ten minutes. Counting failures globally is honest about what
 * can actually be measured, and a correct code is never subject to it.
 */
export const ENROL_FAILURE_BUDGET = 10;
export const ENROL_FAILURE_WINDOW_MS = 10 * 60 * 1000;
/** Past the budget, a FAILING answer is held back: 1 s, 2, 4, 8, then this. */
export const ENROL_DELAY_MAX_MS = 10 * 1000;
/** Failures in the window past which the owner is told someone is trying. */
export const ENROL_ALERT_AT = 25;
export const CODE_LOCK_AFTER_FAILURES = 10;
export const CODE_LOCK_MS = 60 * 60 * 1000;

/** How long a code stays readable after the access has ended. */
export const CODE_RETENTION_DAYS = 7;
/** How long the journal is kept. */
export const JOURNAL_RETENTION_DAYS = 365;
/** Beyond this, the owner is told — information, never a block. */
export const DEVICE_COUNT_NOTICE = 6;
