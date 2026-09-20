// ============================================================
// The guest's half, served on Sowel's anonymous tree (/p/guest-access/*)
//
// Nothing authenticated these calls. What stands between the internet and the
// gate is this file and `service.ts`: a code that matches an access, a window
// that is open, an owner who has not suspended it — and the throttles, which
// are here because the core only counts requests, not what they were trying.
//
// Every answer is a machine reason; the page turns it into a sentence in the
// guest's own language. An error that cannot be acted on says as little as
// possible: a wrong code and a locked code are told apart only by the number of
// tries, never by the answer.
// ============================================================

import type { PluginHttpRequest, PluginHttpResponse } from "./plugin-contract.js";
import type { GuestAccessService } from "./service.js";
import { effectiveWindow } from "./validity.js";
import {
  GUEST_CSS,
  GUEST_ICON,
  GUEST_MANIFEST,
  guestHtml,
  guestJs,
  pickLang,
  type Lang,
} from "./guest-app.js";

export interface PublicDeps {
  service: GuestAccessService;
  guestBaseUrl(): string | null;
  guestPath(): string;
}

const NO_STORE = { "cache-control": "no-store" };

function json(status: number, body: unknown): PluginHttpResponse {
  return { status, body, headers: NO_STORE };
}

function bearer(request: PluginHttpRequest): string {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function createPublicApi(deps: PublicDeps) {
  const { service } = deps;

  const sessionBody = (access: Parameters<GuestAccessService["invitation"]>[0], now: Date) => {
    const window = effectiveWindow(access);
    const decision = service.decideFor(access, now);
    return {
      // The guest's own first name is what tells them they are on their own
      // access. The lodging is deliberately not named — a guest knows where
      // they are sleeping.
      label: access.label,
      until: window.to ? window.to.toISOString() : null,
      invitationUrl: service.invitation(access, deps.guestBaseUrl(), deps.guestPath()).url,
      decision: decision.ok ? { ok: true } : { ...decision, reason: decision.reason },
    };
  };

  return async function handle(request: PluginHttpRequest): Promise<PluginHttpResponse> {
    const { method, path } = request;
    const lang: Lang = (request.query.lang === "en" || request.query.lang === "fr"
      ? request.query.lang
      : pickLang(request.headers["accept-language"])) as Lang;

    if (method === "GET" && (path === "/" || path === "")) {
      return {
        status: 200,
        body: guestHtml(lang),
        contentType: "text/html; charset=utf-8",
        headers: {
          ...NO_STORE,
          // The page needs nothing from anywhere else, and says so.
          "content-security-policy":
            "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'",
        },
      };
    }

    if (method === "GET" && path === "/app.js") {
      return { status: 200, body: guestJs(lang), contentType: "text/javascript; charset=utf-8", headers: NO_STORE };
    }
    if (method === "GET" && path === "/style.css") {
      return { status: 200, body: GUEST_CSS, contentType: "text/css; charset=utf-8" };
    }
    if (method === "GET" && path === "/manifest.webmanifest") {
      return { status: 200, body: GUEST_MANIFEST, contentType: "application/manifest+json" };
    }
    if (method === "GET" && path === "/icon.svg") {
      return { status: 200, body: GUEST_ICON, contentType: "image/svg+xml" };
    }

    if (method === "POST" && path === "/enrol") {
      const code = (request.body as { code?: unknown })?.code;
      const result = service.enrol(
        typeof code === "string" ? code : "",
        request.ip,
        request.headers["user-agent"] ?? "",
      );
      if (!result.ok || !result.access) {
        // 401 for a code that matches nothing, deliberately: that is the status
        // a brute-force ban counts on at the edge. The others are told apart
        // because the guest can act on them differently.
        const status = result.reason === "bad_code" ? 401 : 429;
        return json(result.reason === "revoked" || result.reason === "expired" ? 403 : status, {
          reason: result.reason,
        });
      }
      return json(200, { token: result.token, ...sessionBody(result.access, new Date()) });
    }

    if (method === "GET" && path === "/session") {
      const session = service.session(bearer(request));
      if (!session) return json(401, { reason: "revoked" });
      return json(200, sessionBody(session.access, new Date()));
    }

    if (method === "POST" && path === "/open") {
      const token = bearer(request);
      if (!token) return json(401, { reason: "revoked" });
      const result = await service.open(token);
      if (result.outcome === "opened") return json(200, { outcome: "opened" });
      if (!result.access) return json(401, { reason: "revoked" });
      const decision = result.decision;
      return json(200, {
        outcome: result.outcome,
        reason: result.outcome,
        ...(decision && !decision.ok
          ? { activeAt: decision.activeAt, nextOpeningAt: decision.nextOpeningAt }
          : {}),
      });
    }

    return json(404, { reason: "not_found" });
  };
}
