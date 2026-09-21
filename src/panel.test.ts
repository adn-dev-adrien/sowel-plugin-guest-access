// @vitest-environment jsdom
//
// The owner's page (ui/panel.js), drawn against a fake plugin API. The page
// holds no rule, so what is pinned here is what it draws and what it refuses
// to let the owner pick — and that it opens at all: a ranged access used to
// crash its own editor, and nothing tested the page.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
// @ts-expect-error — plain JavaScript module, shipped as is
import { mount, unmount } from "../ui/panel.js";

const GATE_A = { id: "g1", equipmentId: "eq-1", name: "Portail d'entrée", bound: true, gateState: "closed", accesses: 1 };
const GATE_B = { id: "g2", equipmentId: "eq-2", name: "Porte du garage", bound: true, gateState: "open", accesses: 0 };

function row(over: Record<string, unknown> = {}) {
  return {
    id: "a1", kind: "manual", label: "Artisan", gates: ["g1"], state: "scheduled", code: "VZVF-68BE",
    invitationUrl: null, validFrom: "2026-09-23T12:20:00.000Z", validUntil: "2026-09-23T16:00:00.000Z",
    stayWindow: null, earlyOpenedAt: null, extendedUntil: null, timeWindows: [], devices: 0,
    lastUsedAt: null, useCount: 0, suspendedAt: null, revokedAt: null, createdBy: "adrien", source: null,
    ...over,
  };
}

function state(over: Record<string, unknown> = {}) {
  return {
    accesses: [row()],
    groups: {},
    gates: [GATE_A, GATE_B],
    catalog: [
      { id: "eq-1", name: "Portail d'entrée", state: "closed", taken: true },
      { id: "eq-2", name: "Porte du garage", state: "open", taken: true },
      { id: "eq-3", name: "Portillon du jardin", state: "unknown", taken: false },
    ],
    recipe: { answering: true, lastResult: null },
    guestflow: { configured: false, linked: false },
    publicTree: { open: true, path: "/p/guest-access/", guestBaseUrl: "https://sowel.example", guestPath: "/p/guest-access/" },
    ...over,
  };
}

let container: HTMLElement;
const calls: Array<{ path: string; init?: { method?: string; body?: unknown } }> = [];

async function open(data = state(), params: Record<string, string> = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  await mount(container, {
    locale: "fr",
    params,
    api: async (path: string, init?: { method?: string; body?: unknown }) => {
      calls.push({ path, init });
      return path === "/state" ? data : {};
    },
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  calls.length = 0;
  // jsdom has no <dialog> behaviour; the page only needs it to open and close.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(() => {
  unmount(container);
  container.remove();
});

describe("the owner's page", () => {
  it("draws a tab per gate, and « Tous » once there are two", async () => {
    await open();
    const tabs = [...container.querySelectorAll(".tab")].map((t) => t.textContent);
    expect(tabs).toEqual(["Tous1", "Portail d'entrée1", "Porte du garage0", "portail"]);
  });

  it("opens the editor of an access that already has a period — it used to crash", async () => {
    await open();
    (container.querySelector('[aria-label="Modifier"]') as HTMLButtonElement).click();
    const dialog = container.querySelector("dialog[open]")!;
    expect(dialog).toBeTruthy();
    const rows = dialog.querySelectorAll(".dt-row");
    // 12:20 and 16:00 UTC are 14:20 and 18:00 on the Paris clock.
    expect((rows[0].querySelector(".dt-h") as HTMLSelectElement).value).toBe("14");
    expect((rows[0].querySelector(".dt-m") as HTMLSelectElement).value).toBe("20");
    expect((rows[1].querySelector(".dt-h") as HTMLSelectElement).value).toBe("18");
  });

  it("offers minutes in steps of five, and disables what comes before the start on its day", async () => {
    await open();
    (container.querySelector('[aria-label="Modifier"]') as HTMLButtonElement).click();
    const dialog = container.querySelector("dialog[open]")!;
    const until = () => dialog.querySelectorAll(".dt-row")[1];
    const hour = until().querySelector(".dt-h") as HTMLSelectElement;
    expect([...hour.options].filter((o) => o.disabled).map((o) => o.textContent)).toEqual(
      ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"],
    );
    hour.value = "14";
    hour.dispatchEvent(new Event("change"));
    const minute = until().querySelector(".dt-m") as HTMLSelectElement;
    expect([...minute.options].map((o) => o.textContent)).toHaveLength(12);
    expect([...minute.options].filter((o) => o.disabled).map((o) => o.textContent)).toEqual(["00", "05", "10", "15", "20"]);
    // The minute that did not fit moved to the first one that does.
    expect(minute.value).toBe("25");
  });

  it("strikes what cannot be picked — each rule of the picker's style intact", async () => {
    // A clean-up once merged these rules into one and every day came out
    // outlined and none struck. What the owner sees is the refusal, so its
    // look is pinned too.
    await open();
    const css = container.querySelector("style")!.textContent!;
    expect(css).toMatch(/^\.ga \.dt-cal button:disabled \{[^}]*line-through/m);
    expect(css).toMatch(/^\.ga \.dt-cal button\.bound \{ outline: 1px dashed/m);
    expect(css).toMatch(/^\.ga \.dt-cal button \{ all: unset;/m);
    // Sowel's reset zeroes every margin, and a modal dialog is centred by its
    // margin: without this the dialogs open in the top-left corner.
    expect(css).toMatch(/^\.ga dialog \{[^}]*margin: auto/m);
  });

  it("offers « + portail » as a choice among the recipe's gates, the listed ones not choosable", async () => {
    await open();
    ([...container.querySelectorAll(".tab")].at(-1) as HTMLButtonElement).click();
    const select = container.querySelector("dialog[open] select") as HTMLSelectElement;
    expect([...select.options].map((o) => [o.textContent, o.disabled])).toEqual([
      ["Choisir…", false],
      ["Portail d'entrée — déjà dans la liste", true],
      ["Porte du garage — déjà dans la liste", true],
      ["Portillon du jardin", false],
    ]);
    select.value = "eq-3";
    (container.querySelector("dialog[open] .btn.main") as HTMLButtonElement).click();
    await flush();
    expect(calls.find((c) => c.path === "/gates")?.init).toEqual({ method: "POST", body: { equipmentId: "eq-3" } });
  });

  it("says a recipe is missing instead of offering an empty list", async () => {
    await open(state({ catalog: [], recipe: { answering: false, lastResult: null } }));
    ([...container.querySelectorAll(".tab")].at(-1) as HTMLButtonElement).click();
    expect(container.querySelector("dialog[open]")!.textContent).toMatch(/Aucune recette/);
    expect(container.querySelector("dialog[open] select")).toBeNull();
  });

  it("arriving from an equipment's page shows its gate, or offers to add it already picked", async () => {
    await open(state(), { equipment: "eq-2" });
    expect(container.querySelector('.tab[aria-selected="true"]')!.textContent).toMatch(/Porte du garage/);
    unmount(container);
    container.remove();
    await open(state(), { equipment: "eq-3" });
    expect((container.querySelector("dialog[open] select") as HTMLSelectElement).value).toBe("eq-3");
  });
});
