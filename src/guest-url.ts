// ============================================================
// The address the guest is given
//
// Sowel serves the guests' page under a path it chooses itself:
// `/p/<plugin-id>/`, here `/p/guest-access/`. That path is the core's, not
// ours, and it is not the address anybody wants to read in an e-mail.
//
// So the link is composed from two settings rather than hard-coded. A house
// that publishes Sowel under its own name — `acces.domainesolio.com`, a vhost
// whose whole tree is rewritten onto `/p/guest-access/` upstream — sets the
// path to `/` and hands its guests `https://acces.domainesolio.com/#i=CODE`.
// A house with no alias leaves the default and nothing changes.
//
// The rewrite has to cover the WHOLE subtree, not just the root: the page
// fetches `app.js`, `style.css`, `icon.svg` and `enrol` relative to itself, so
// a rule that maps `/` alone serves an HTML page whose every asset 404s.
//
// The code stays in the fragment in every variant. A fragment is never sent to
// a server, which is what keeps a guest's code out of the access log of Sowel,
// of the alias, and of anything sitting between them.
// ============================================================

/** Where the Sowel core serves this plugin's anonymous tree. */
export const DEFAULT_GUEST_PATH = "/p/guest-access/";

/**
 * The configured path, or `null` when it is unusable.
 *
 * Unusable is answered with `null` rather than a repaired guess: the caller
 * falls back to the default and says so, because a path that is nearly right
 * hands every guest a dead link, and a dead link is discovered by a guest
 * standing at a gate.
 */
export function normaliseGuestPath(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  // A path, not an origin and not a query: no scheme, no host, no `?`, no `#`.
  if (!/^[A-Za-z0-9._~/-]+$/.test(value)) return null;
  if (value.includes("//")) return null;
  if (value.split("/").includes("..")) return null;
  return value.endsWith("/") ? value : `${value}/`;
}

/**
 * The link as every surface shows it, or `null` when the house has no public
 * address — in which case the code alone still works, typed on the page.
 */
export function invitationUrl(
  baseUrl: string | null,
  path: string,
  code: string | null,
): string | null {
  if (!baseUrl || !code) return null;
  return `${baseUrl.replace(/\/+$/, "")}${path}#i=${code}`;
}
