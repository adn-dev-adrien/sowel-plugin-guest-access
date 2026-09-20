import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { DEFAULT_GUEST_PATH, invitationUrl, normaliseGuestPath } from "./guest-url.js";
import { makeApiHarness, type ApiHarness } from "./apiFixtures.js";

// Spec §4.2 — the address the guest is given. The house may publish Sowel
// under a name of its own (`acces.domainesolio.com`), whose whole tree is
// rewritten onto `/p/guest-access/` upstream; the link then has no path at all.

describe("the guests' path", () => {
  it("defaults to the path the Sowel core serves", () => {
    expect(DEFAULT_GUEST_PATH).toBe("/p/guest-access/");
    expect(normaliseGuestPath(undefined)).toBeNull();
    expect(normaliseGuestPath("  ")).toBeNull();
  });

  it("accepts a root alias, which is the point of the setting", () => {
    expect(normaliseGuestPath("/")).toBe("/");
  });

  it("closes a path that was typed without its trailing slash", () => {
    // Without it the link reads `…/portail#i=CODE`, which the upstream rewrite
    // still serves but which resolves `app.js` one directory too high.
    expect(normaliseGuestPath("/portail")).toBe("/portail/");
    expect(normaliseGuestPath("  /portail/  ")).toBe("/portail/");
  });

  it("refuses what is an origin, a query or a fragment rather than a path", () => {
    expect(normaliseGuestPath("https://acces.domainesolio.com/")).toBeNull();
    expect(normaliseGuestPath("acces.domainesolio.com")).toBeNull();
    expect(normaliseGuestPath("/portail?lang=fr")).toBeNull();
    expect(normaliseGuestPath("/portail#i=CODE")).toBeNull();
    expect(normaliseGuestPath("//acces.domainesolio.com/")).toBeNull();
  });

  it("refuses traversal and anything not plainly a path", () => {
    expect(normaliseGuestPath("/p/../admin/")).toBeNull();
    expect(normaliseGuestPath("/p/%2e%2e/")).toBeNull();
    expect(normaliseGuestPath("/portail des invités/")).toBeNull();
    expect(normaliseGuestPath("\\portail\\")).toBeNull();
  });
});

describe("the invitation link", () => {
  it("puts the code in the fragment, under the alias, with no path", () => {
    expect(invitationUrl("https://acces.domainesolio.com", "/", "4K7M9QT2"))
      .toBe("https://acces.domainesolio.com/#i=4K7M9QT2");
  });

  it("keeps the core's path when no alias is configured", () => {
    expect(invitationUrl("https://sowel.adn-dev.fr", DEFAULT_GUEST_PATH, "4K7M9QT2"))
      .toBe("https://sowel.adn-dev.fr/p/guest-access/#i=4K7M9QT2");
  });

  it("tolerates a base address entered with trailing slashes", () => {
    expect(invitationUrl("https://acces.domainesolio.com///", "/", "4K7M9QT2"))
      .toBe("https://acces.domainesolio.com/#i=4K7M9QT2");
  });

  it("is absent — but the code is not — when the house has no public address", () => {
    expect(invitationUrl(null, "/", "4K7M9QT2")).toBeNull();
    expect(invitationUrl("https://acces.domainesolio.com", "/", null)).toBeNull();
  });
});

let harness: ApiHarness;
afterEach(() => {
  if (harness) rmSync(harness.dir, { recursive: true, force: true });
});

describe("the owner's page, under an alias", () => {
  it("shows every access's link on the alias, and names the path Sowel serves", async () => {
    const h = (harness = makeApiHarness({
      guestBaseUrl: "https://acces.domainesolio.com",
      guestPath: "/",
    }));
    const created = await h.admin("POST", "/accesses", {
      body: { kind: "manual", label: "Jardinier" },
    });
    expect(created.status).toBe(201);
    const url = (created.body as { access: { invitationUrl: string } }).access.invitationUrl;
    expect(url).toMatch(/^https:\/\/acces\.domainesolio\.com\/#i=[A-Z0-9]{8}$/);

    const state = await h.admin("GET", "/state");
    const tree = (state.body as {
      publicTree: { path: string; guestBaseUrl: string; guestPath: string };
    }).publicTree;
    // The two are deliberately distinct: `path` is where Sowel answers and is
    // what the owner checks when the page 404s; `guestPath` is what the guest
    // is handed.
    expect(tree.path).toBe(DEFAULT_GUEST_PATH);
    expect(tree.guestPath).toBe("/");
    expect(tree.guestBaseUrl).toBe("https://acces.domainesolio.com");
  });
});
