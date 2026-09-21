// ============================================================
// The page a guest opens in front of the gate
//
// A few kilobytes of plain HTML, CSS and JavaScript — no framework, no bundle.
// Somebody is standing outside on 4G, possibly in the rain, possibly with one
// hand: loading an application to draw one control would be indefensible.
//
// Three decisions from the first version survive unchanged, and they are the
// ones worth keeping in view while reading this file:
//
//   • **The control is a slide, not a tap.** A phone in a pocket, a child
//     playing with the screen, a tap while the page is still loading — a gate
//     that opens for nobody is the failure this prevents. A keyboard confirms
//     too, because a gesture nobody can perform is a gate nobody can open.
//   • **Nothing is said on success.** The guest pressed and is already driving
//     in. The page speaks only when the gate will NOT move.
//   • **The gate's state is not shown.** A button reading « Fermer le portail »
//     is a state display wearing a verb, and this page is pollable by anyone
//     holding a code. What the guest is handed is one gesture that opens and
//     closes, and a caption saying so.
// ============================================================

export type Lang = "fr" | "en";

export function pickLang(acceptLanguage: string | undefined): Lang {
  if (!acceptLanguage) return "fr";
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "fr";
}

const STRINGS: Record<Lang, Record<string, string>> = {
  fr: {
    title: "Accès",
    intro: "Entrez le code qu'on vous a communiqué.",
    codeLabel: "Code d'accès",
    codePlaceholder: "XXXX-XXXX",
    submit: "Valider",
    action: "Glisser pour actionner",
    caption: "Le même geste ouvre et ferme",
    sent: "Commande envoyée",
    share: "Partager l'accès",
    shared: "Lien copié",
    bad_code: "Code incorrect ou expiré.",
    locked: "Trop d'essais sur ce code. Réessayez dans une heure.",
    revoked: "Cet accès a été retiré.",
    expired: "Cet accès a pris fin.",
    not_yet_active: "Votre accès commence le {when}.",
    suspended: "Votre accès est suspendu. Contactez la personne qui vous l'a donné.",
    outside_hours: "En dehors des heures autorisées. Prochaine ouverture à {when}.",
    too_many_opens: "Trop d'ouvertures sur la dernière heure.",
    gate_busy: "Une autre commande est en cours. Réessayez.",
    no_answer: "La maison n'a pas répondu. Réessayez, ou prévenez la personne qui vous a donné l'accès.",
    refused_by_house: "Commande refusée depuis la maison.",
    gate_error: "L'ouverture n'a pas pu être commandée.",
    offline: "Vous semblez hors ligne.",
    unknown: "Quelque chose n'a pas fonctionné.",
  },
  en: {
    title: "Access",
    intro: "Enter the code you were given.",
    codeLabel: "Access code",
    codePlaceholder: "XXXX-XXXX",
    submit: "Continue",
    action: "Slide to operate",
    caption: "The same gesture opens and closes",
    sent: "Command sent",
    share: "Share this access",
    shared: "Link copied",
    bad_code: "Wrong or expired code.",
    locked: "Too many tries on this code. Try again in an hour.",
    revoked: "This access has been withdrawn.",
    expired: "This access has ended.",
    not_yet_active: "Your access starts on {when}.",
    suspended: "Your access is on hold. Please contact the person who gave it to you.",
    outside_hours: "Outside the allowed hours. Next opening at {when}.",
    too_many_opens: "Too many openings in the last hour.",
    gate_busy: "Another command is running. Try again.",
    no_answer: "The house did not answer. Try again, or let the person who gave you access know.",
    refused_by_house: "The command was refused from the house.",
    gate_error: "The opening could not be sent.",
    offline: "You seem to be offline.",
    unknown: "Something did not work.",
  },
};

/**
 * The name of an equipment, set by whoever administers the house, printed into
 * a page anyone on the internet can load. Escaped, always — a name is data.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The strings with the page title taken from what opens, when the recipe has said. */
function stringsFor(lang: Lang, openingLabel: string | null): Record<string, string> {
  const base = STRINGS[lang];
  return openingLabel ? { ...base, title: openingLabel } : base;
}

export function guestHtml(lang: Lang, openingLabel: string | null = null): string {
  const t = stringsFor(lang, openingLabel);
  const title = escapeHtml(t.title);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1A4F6E">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon.svg">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  <header>
    <h1 id="who">${title}</h1>
    <p id="sub"></p>
  </header>

  <section id="enrol" hidden>
    <p class="intro">${t.intro}</p>
    <form id="enrol-form" novalidate>
      <label for="code">${t.codeLabel}</label>
      <input id="code" name="code" inputmode="latin" autocomplete="one-time-code"
             autocapitalize="characters" spellcheck="false" placeholder="${t.codePlaceholder}"
             maxlength="12" required>
      <button type="submit">${t.submit}</button>
    </form>
  </section>

  <section id="act" hidden>
    <p class="caption">${t.caption}</p>
    <div class="track" id="track">
      <div class="track-fill" id="track-fill"></div>
      <span class="track-label" id="track-label">${t.action}<svg class="chevrons" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 17l5-5-5-5M13 17l5-5-5-5"/></svg></span>
      <div class="knob" id="knob" role="button" tabindex="0" aria-label="${t.action}">
        <svg class="i-go" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 17l5-5-5-5M13 17l5-5-5-5"/></svg>
        <svg class="i-done" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
    </div>
    <button id="share" class="ghost" hidden>${t.share}</button>
  </section>

  <p id="note" class="note" role="status" aria-live="polite" hidden></p>
</main>
<script src="app.js?lang=${lang}" type="module"></script>
</body>
</html>
`;
}

export const GUEST_CSS = `:root {
  color-scheme: light dark;
  --bg: #f6f7f8;
  --fg: #16202a;
  --muted: #5c6b79;
  --card: #ffffff;
  --line: #dfe4e9;
  --primary: #1A4F6E;
  --error: #b3261e;
  /* design-system/tokens.css — a-500 (warning) and green-500 (success) */
  --warn: #F2C035;
  --warn-fill: rgba(242,192,53,.15);
  --ok: #1FA260;
  --ok-fill: rgba(31,162,96,.20);
  --ok-line: rgba(31,162,96,.40);
  --line-soft: rgba(24,24,27,.08);
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#10161c; --fg:#e9eef2; --muted:#9aa8b4; --card:#182028; --line:#2a353f; --primary:#7FB8D4;
    --warn:#F2BC6E; --warn-fill:rgba(242,188,110,.15); --ok:#3DDB89; --ok-fill:rgba(61,219,137,.20);
    --ok-line:rgba(61,219,137,.40); --line-soft:rgba(255,255,255,.06); }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
main { width: 100%; max-width: 420px; }
header { text-align: center; margin-bottom: 28px; }
h1 { font-size: 24px; margin: 0 0 4px; font-weight: 600; }
#sub { margin: 0; color: var(--muted); font-size: 14px; }
.intro { color: var(--muted); font-size: 14px; text-align: center; }
form { display: grid; gap: 12px; background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid var(--line); }
label { font-size: 13px; color: var(--muted); }
input {
  font: inherit; font-size: 22px; letter-spacing: 3px; text-align: center; text-transform: uppercase;
  padding: 14px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit;
}
button {
  font: inherit; font-weight: 600; min-height: 48px; padding: 0 18px;
  border: 0; border-radius: 8px; background: var(--primary); color: #fff; cursor: pointer;
}
button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--line); width: 100%; margin-top: 16px; }
.caption { text-align: center; color: var(--muted); font-size: 13px; margin: 0 0 10px; }
/* 260px and centred: tuned by hand on a phone. Full width puts the start of
   the gesture in the corner furthest from the thumb of the hand holding it. */
/* Spec 146 — the very control Sowel already uses to confirm a gate or a garage
   door, reproduced here in plain CSS because this page carries no framework.
   Same geometry (58 / 260 / 50 / 4), same two colours, same progress fill, same
   check on arrival. A guest who knows the Sowel app meets a control they have
   already used, and this page stops inventing one of its own. */
.track {
  position: relative; width: 100%; max-width: 260px; height: 58px; margin: 0 auto;
  border-radius: 12px; background: var(--line-soft); border: 1px solid var(--line);
  overflow: hidden; touch-action: none; user-select: none;
}
.track-fill {
  position: absolute; top: 0; bottom: 0; left: 0; width: 50px; border-radius: 12px;
  background: var(--warn-fill); transition: width .2s;
}
.track-label {
  position: absolute; top: 0; bottom: 0; left: 58px; right: 0;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  color: var(--muted); font-size: 13px; font-weight: 500; white-space: nowrap;
  pointer-events: none; padding: 0 8px;
}
.chevrons { fill: none; stroke: var(--warn); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.knob {
  position: absolute; top: 4px; left: 4px; width: 50px; height: 50px; border-radius: 9px;
  background: var(--warn); color: #fff; display: grid; place-items: center; cursor: grab;
  box-shadow: 0 2px 6px rgba(0,0,0,.18); z-index: 2; transition: left .2s, background .2s;
}
.knob svg { fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.knob .i-done { display: none; }
.knob.dragging { transition: background .2s; cursor: grabbing; }
.knob:focus-visible { outline: 3px solid var(--warn); outline-offset: 3px; }
/* Arrived. Green, a check — and NOT a word: nothing is said on success, so the
   colour is the whole answer. */
.track.done { border-color: var(--ok-line); }
.track.done .track-fill { width: 100% !important; background: var(--ok-fill); }
.track.done .track-label { opacity: 0; }
.track.done .knob { background: var(--ok); cursor: default; }
.track.done .knob .i-go { display: none; }
.track.done .knob .i-done { display: block; }
.note { margin: 18px 0 0; text-align: center; font-size: 14px; color: var(--error); }
.note.calm { color: var(--muted); }
`;

/** What the icon on the home screen is called — the same name as the page. */
export function guestManifest(lang: Lang, openingLabel: string | null = null): string {
  const name = stringsFor(lang, openingLabel).title;
  return JSON.stringify({ ...GUEST_MANIFEST_BASE, name, short_name: name.slice(0, 12) });
}

const GUEST_MANIFEST_BASE = {
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#f6f7f8",
  theme_color: "#1A4F6E",
  icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
};

export const GUEST_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#1A4F6E"/>
<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round">
<path d="M14 46V26l18-10 18 10v20"/><path d="M14 46h36"/><path d="M23 46V32"/><path d="M32 46V30"/><path d="M41 46V32"/>
</g></svg>`;

/** The app, with its own strings already in it — one round trip fewer. */
export function guestJs(lang: Lang, openingLabel: string | null = null): string {
  return `const T = ${JSON.stringify(stringsFor(lang, openingLabel))};
const LOCALE = ${JSON.stringify(lang === "en" ? "en-GB" : "fr-FR")};
const KEY = "guest-access-token";
const $ = (id) => document.getElementById(id);

let token = null;
try { token = localStorage.getItem(KEY); } catch { token = null; }

function say(message, calm) {
  const note = $("note");
  // One note, replaced — three refusals in a row must not build a wall.
  note.textContent = message;
  note.className = calm ? "note calm" : "note";
  note.hidden = !message;
}

function when(value) {
  if (!value) return "";
  if (/^\\d{1,2}:\\d{2}$/.test(value)) return value;
  try {
    return new Intl.DateTimeFormat(LOCALE, {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
  } catch { return value; }
}

function reason(payload) {
  const key = payload && payload.reason ? payload.reason : "unknown";
  const text = T[key] || T.unknown;
  return text.replace("{when}", when(payload && (payload.activeAt || payload.nextOpeningAt)));
}

async function call(path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  return { ok: response.ok, status: response.status, payload };
}

function showEnrol() {
  $("enrol").hidden = false;
  $("act").hidden = true;
  $("who").textContent = T.title;
  $("sub").textContent = "";
}

function showAccess(session) {
  $("enrol").hidden = true;
  $("act").hidden = false;
  $("who").textContent = session.label || T.title;
  $("sub").textContent = session.until ? when(session.until) : "";
  $("share").hidden = !session.invitationUrl;
  $("share").dataset.url = session.invitationUrl || "";
  if (session.decision && session.decision.ok === false) {
    say(reason(session.decision), true);
  } else {
    say("");
  }
}

async function refresh() {
  if (!token) { showEnrol(); return; }
  const { ok, status, payload } = await call("session");
  if (status === 401 || status === 404) {
    // The access was regenerated or deleted: back to the code form, which is
    // the one thing the guest can act on.
    token = null;
    try { localStorage.removeItem(KEY); } catch {}
    showEnrol();
    say(T.revoked, true);
    return;
  }
  if (!ok) { say(T.unknown); return; }
  showAccess(payload);
}

async function enrol(code) {
  const { ok, payload } = await call("enrol", { code });
  if (!ok) { say(reason(payload)); return; }
  token = payload.token;
  try { localStorage.setItem(KEY, token); } catch {}
  showAccess(payload);
}

async function operate() {
  // The previous answer goes first. Nothing is said on success, so a refusal
  // left on screen would still be there after the press that worked — the page
  // would be telling a guest the house did not answer while the gate moves in
  // front of them.
  say("");
  const { ok, payload } = await call("open", {});
  // Nothing is said on success — the gate is moving and the guest is driving in.
  if (!ok || payload.outcome !== "opened") say(reason(payload));
}

// ── The slide ──────────────────────────────────────────────
//
// Sowel's own slide-to-confirm (core spec 146), the control an owner already
// uses on a gate or a garage door, reproduced here without its framework. Same
// numbers: a 50 px knob inset by 4 in a track capped at 260, so the sweep is
// the one that was tuned by hand on a phone rather than picked round.
//
// Two deliberate departures from the core's version, each for a reason that
// only applies out here, in front of a gate:
//   · nothing is written when it arrives — the green IS the answer, because a
//     success says nothing on this page and never has;
//   · it returns to rest after two seconds instead of staying confirmed, since
//     the same gesture is what closes the gate behind you.
const KNOB = 50;
const PAD = 4;
const KNOB_SPAN = KNOB + PAD * 2;

const track = $("track");
const fill = $("track-fill");
const knob = $("knob");
const label = $("track-label");
let drag = null;
let x = 0;
let done = false;

function maxOffset() { return Math.max(0, track.clientWidth - KNOB_SPAN); }
function place(next) {
  x = next;
  knob.style.left = (PAD + x) + "px";
  fill.style.width = (KNOB + x) + "px";
}
function rest() {
  done = false;
  drag = null;
  knob.classList.remove("dragging");
  track.classList.remove("done");
  place(0);
}

function fire() {
  if (done) return;
  done = true;
  drag = null;
  knob.classList.remove("dragging");
  track.classList.add("done");
  place(maxOffset());
  void operate();
  // A rest, never a lock: a guest may command again to close the gate behind
  // them, and a locked control would contradict that.
  setTimeout(rest, 2000);
}

knob.addEventListener("pointerdown", (event) => {
  if (done) return;
  knob.setPointerCapture(event.pointerId);
  drag = { startX: event.clientX - x, max: maxOffset() };
  knob.classList.add("dragging");
});

knob.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const next = Math.max(0, Math.min(drag.max, event.clientX - drag.startX));
  place(next);
  // A positive max, so a track too narrow to have a sweep cannot confirm on the
  // first move — the core's guard, and the reason it is here too.
  if (drag.max > 0 && next >= drag.max - 1) fire();
});

function release() {
  if (!drag || done) return;
  const max = drag.max;
  drag = null;
  knob.classList.remove("dragging");
  if (x < max - 1) place(0);
}
knob.addEventListener("pointerup", release);
knob.addEventListener("pointercancel", () => { drag = null; rest(); });

// A deliberate key press on a focused control is as much an intent as a drag.
knob.addEventListener("keydown", (event) => {
  if (["Enter", " ", "ArrowRight", "End"].includes(event.key)) {
    event.preventDefault();
    fire();
  }
});

$("enrol-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = $("code").value.trim();
  if (code) void enrol(code);
});

$("share").addEventListener("click", async () => {
  const url = $("share").dataset.url;
  if (!url) return;
  // Sharing is a feature, not an abuse: the family arrives in two cars.
  if (navigator.share) { try { await navigator.share({ url }); return; } catch {} }
  try { await navigator.clipboard.writeText(url); say(T.shared, true); } catch { say(T.unknown); }
});

window.addEventListener("online", () => void refresh());
window.addEventListener("offline", () => say(T.offline, true));
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });

// The link carries the code in the FRAGMENT, which no server, proxy or access
// log ever sees. It is consumed once and removed from the address bar.
const fragment = /[#&]i=([A-Za-z0-9-]+)/.exec(location.hash || "");
if (fragment) {
  history.replaceState(null, "", location.pathname + location.search);
  void enrol(fragment[1]);
} else {
  void refresh();
}
`;
}
