// ============================================================
// The owner's page, seen from the server
//
// Every rule is applied here and nothing is left to the page: the groups, the
// states, the refusals and the journal all arrive shaped. The page draws them.
// That is not ceremony — the page is a few hundred lines of plain DOM inside
// somebody else's application, and a rule that lives there is a rule that is
// wrong in the one place nobody tests.
// ============================================================

import type { Access, JournalEntry } from "./model.js";
import type { PluginHttpRequest, PluginHttpResponse } from "./plugin-contract.js";
import type { GuestAccessService } from "./service.js";
import type { GuestFlowConnector } from "./guestflow.js";
import { stateOf } from "./guestflow.js";
import type { Gates } from "./gates.js";
import { effectiveWindow } from "./validity.js";
import { formatCode } from "./codes.js";
import { DEFAULT_GUEST_PATH } from "./guest-url.js";

export interface AdminDeps {
  service: GuestAccessService;
  connector: GuestFlowConnector;
  gates: Gates;
  guestBaseUrl(): string | null;
  /** Where the guests' page answers under that address (see guest-url.ts). */
  guestPath(): string;
  publicTreeOpen(): boolean;
  /** Ask the connector to push what changed, without waiting for the loop. */
  onChanged(access: Access | undefined): void;
}

export interface AccessRow {
  id: string;
  kind: Access["kind"];
  label: string;
  gates: string[];
  state: string;
  code: string | null;
  invitationUrl: string | null;
  validFrom: string | null;
  validUntil: string | null;
  stayWindow: { from: string; to: string } | null;
  earlyOpenedAt: string | null;
  extendedUntil: string | null;
  timeWindows: Access["timeWindows"];
  devices: number;
  lastUsedAt: string | null;
  useCount: number;
  suspendedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  source: Access["source"];
}

const GROUPS = ["active", "scheduled", "suspended", "revoked", "ended"] as const;

export function shapeAccess(
  access: Access,
  guestBaseUrl: string | null,
  now: Date,
  service: GuestAccessService,
  guestPath: string = DEFAULT_GUEST_PATH,
): AccessRow {
  const window = effectiveWindow(access);
  const invitation = service.invitation(access, guestBaseUrl, guestPath);
  return {
    id: access.id,
    kind: access.kind,
    label: access.label,
    gates: service.gatesOf(access),
    state: stateOf(access, now),
    code: access.code ? formatCode(access.code) : null,
    invitationUrl: invitation.url,
    validFrom: window.from ? window.from.toISOString() : null,
    validUntil: window.to ? window.to.toISOString() : null,
    stayWindow: access.stayWindow,
    earlyOpenedAt: access.earlyOpenedAt,
    extendedUntil: access.extendedUntil,
    timeWindows: access.timeWindows,
    devices: access.devices.length,
    lastUsedAt: access.lastUsedAt,
    useCount: access.useCount,
    suspendedAt: access.suspendedAt,
    revokedAt: access.revokedAt,
    createdBy: access.createdBy,
    source: access.source,
  };
}

function ok(body: unknown): PluginHttpResponse {
  return { status: 200, body };
}

function refuse(refusal: { field: string; code: string }): PluginHttpResponse {
  return { status: 422, body: { error: "refused", ...refusal } };
}

const notFound: PluginHttpResponse = { status: 404, body: { error: "not_found" } };

export function createAdminApi(deps: AdminDeps) {
  const { service, connector, gates } = deps;

  const stateBody = (now = new Date()) => {
    const guestBaseUrl = deps.guestBaseUrl();
    const guestPath = deps.guestPath();
    const rows = service
      .list()
      .map((a) => shapeAccess(a, guestBaseUrl, now, service, guestPath))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));

    return {
      accesses: rows,
      groups: Object.fromEntries(
        GROUPS.map((group) => [group, rows.filter((r) => r.state === group).map((r) => r.id)]),
      ),
      // One entry per gate, in the owner's order — the page's tabs.
      gates: gates.list().map(({ record, gate }) => ({
        id: record.id,
        name: record.name,
        deviceId: record.deviceId,
        // What opens, by the equipment's own name — null until the recipe says.
        openingLabel: gate.getOpeningLabel(),
        // The contact the recipe pushes down. The guest never sees it — the
        // label of a button that names a direction is a state display wearing
        // a verb — but the owner does.
        gateState: gate.getGateState(),
        lastResult: gate.getLastResult(),
        recipeAnswering: gate.getLastResult() !== null,
        accesses: rows.filter((r) => r.gates.includes(record.id)).length,
      })),
      guestflow: connector.state(),
      publicTree: {
        open: deps.publicTreeOpen(),
        // Where Sowel itself answers, which is what the owner checks when the
        // page 404s — never the same field as the address the guests get.
        path: DEFAULT_GUEST_PATH,
        guestBaseUrl,
        guestPath,
      },
    };
  };

  return async function handle(request: PluginHttpRequest): Promise<PluginHttpResponse> {
    const actor = request.user?.username ?? "admin";
    const { method, path } = request;
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (method === "GET" && (path === "/" || path === "/state")) return ok(stateBody());

    if (method === "GET" && path === "/journal") {
      const accessId = request.query.accessId;
      const entries: JournalEntry[] = service.journal({
        accessId: accessId || undefined,
        limit: Number(request.query.limit) || 200,
      });
      return ok({ entries });
    }

    if (method === "POST" && path === "/accesses") {
      const result = service.createManual(body, actor);
      if (result.refusal) return refuse(result.refusal);
      return { status: 201, body: { access: shapeAccess(result.access!, deps.guestBaseUrl(), new Date(), service, deps.guestPath()) } };
    }

    if (method === "POST" && path === "/gates") {
      const result = gates.add(body.name);
      if (result.refusal) return refuse(result.refusal);
      service.publishSummary();
      return { status: 201, body: { gate: result.record } };
    }

    const gateMatch = /^\/gates\/([A-Za-z0-9_-]+)$/.exec(path);
    if (gateMatch && method === "DELETE") {
      const result = gates.remove(gateMatch[1], service.liveAccessGates());
      if (result.missing) return notFound;
      if (result.refusal) return refuse(result.refusal);
      return ok({ deleted: true });
    }

    if (method === "POST" && path === "/sync") {
      const state = await connector.syncNow();
      return ok({ guestflow: state });
    }

    const match = /^\/accesses\/([A-Za-z0-9_-]+)(\/[a-z-]+)?$/.exec(path);
    if (match) {
      const id = match[1];
      const action = match[2];

      if (method === "PATCH" && !action) {
        const result = service.edit(id, body, actor);
        if (result.missing) return notFound;
        if (result.refusal) return refuse(result.refusal);
        deps.onChanged(result.access);
        return ok({ access: shapeAccess(result.access!, deps.guestBaseUrl(), new Date(), service, deps.guestPath()) });
      }

      if (method === "DELETE" && !action) {
        const access = service.get(id);
        if (!access) return notFound;
        // Deleting a live access was revoking it and erasing the line in one
        // click. Revoke first; the line can go once nothing can open with it.
        const state = stateOf(access, new Date());
        if (state !== "revoked" && state !== "ended") {
          return refuse({ field: "access", code: "still_live" });
        }
        if (!service.delete(id, actor)) return notFound;
        deps.onChanged(access);
        return ok({ deleted: true });
      }

      if (method === "POST" && action) {
        const act: Record<string, () => Access | undefined> = {
          "/suspend": () => service.suspend(id, actor),
          "/resume": () => service.resume(id, actor),
          "/revoke": () => service.revoke(id, actor),
          // One route for a new code; whether the phones go with the old one
          // is the owner's choice, said in the body.
          "/code": () => service.changeCode(id, actor, body.cutPhones === true),
        };
        const run = act[action];
        if (!run) return notFound;
        const access = run();
        if (!access) return notFound;
        deps.onChanged(access);
        return ok({ access: shapeAccess(access, deps.guestBaseUrl(), new Date(), service, deps.guestPath()) });
      }
    }

    return notFound;
  };
}
