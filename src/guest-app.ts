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
    title: "Portail",
    intro: "Entrez le code reçu par email.",
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
    too_many_attempts: "Trop d'essais. Réessayez dans quelques minutes.",
    revoked: "Cet accès a été retiré.",
    expired: "Cet accès a pris fin.",
    not_yet_active: "Votre accès commence le {when}.",
    suspended: "Votre accès est suspendu. Contactez votre hôte.",
    outside_hours: "En dehors des heures autorisées. Prochaine ouverture à {when}.",
    too_many_opens: "Trop d'ouvertures sur la dernière heure.",
    gate_busy: "Une autre commande est en cours. Réessayez.",
    no_answer: "La maison n'a pas répondu. Réessayez, ou appelez votre hôte.",
    refused_by_house: "Commande refusée depuis la maison.",
    gate_error: "Le portail n'a pas pu être actionné.",
    offline: "Vous semblez hors ligne.",
    unknown: "Quelque chose n'a pas fonctionné.",
  },
  en: {
    title: "Gate",
    intro: "Enter the code you received by email.",
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
    too_many_attempts: "Too many tries. Try again in a few minutes.",
    revoked: "This access has been withdrawn.",
    expired: "This access has ended.",
    not_yet_active: "Your access starts on {when}.",
    suspended: "Your access is on hold. Please contact your host.",
    outside_hours: "Outside the allowed hours. Next opening at {when}.",
    too_many_opens: "Too many openings in the last hour.",
    gate_busy: "Another command is running. Try again.",
    no_answer: "The house did not answer. Try again, or call your host.",
    refused_by_house: "The command was refused from the house.",
    gate_error: "The gate could not be operated.",
    offline: "You seem to be offline.",
    unknown: "Something did not work.",
  },
};

export function guestHtml(lang: Lang): string {
  const t = STRINGS[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1A4F6E">
<meta name="robots" content="noindex, nofollow">
<title>${t.title}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon.svg">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
  <header>
    <h1 id="who">${t.title}</h1>
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
      <span class="track-label" id="track-label">${t.action}</span>
      <div class="knob" id="knob" role="button" tabindex="0" aria-label="${t.action}">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
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
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#10161c; --fg:#e9eef2; --muted:#9aa8b4; --card:#182028; --line:#2a353f; --primary:#7FB8D4; }
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
.track {
  position: relative; width: min(260px, 100%); height: 58px; margin: 0 auto;
  border-radius: 999px; background: var(--card); border: 1px solid var(--line);
  display: grid; place-items: center; overflow: hidden; touch-action: none;
}
.track-label { color: var(--muted); font-size: 14px; pointer-events: none; padding-left: 40px; }
.knob {
  position: absolute; left: 4px; top: 4px; width: 50px; height: 50px; border-radius: 50%;
  background: var(--primary); color: #fff; display: grid; place-items: center; cursor: grab;
  transition: left .18s ease;
}
.knob.dragging { transition: none; cursor: grabbing; }
.knob:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
.track.done { border-color: var(--primary); }
.note { margin: 18px 0 0; text-align: center; font-size: 14px; color: var(--error); }
.note.calm { color: var(--muted); }
`;

export const GUEST_MANIFEST = JSON.stringify({
  name: "Portail",
  short_name: "Portail",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#f6f7f8",
  theme_color: "#1A4F6E",
  icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
});

export const GUEST_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#1A4F6E"/>
<g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round">
<path d="M14 46V26l18-10 18 10v20"/><path d="M14 46h36"/><path d="M23 46V32"/><path d="M32 46V30"/><path d="M41 46V32"/>
</g></svg>`;

/** The app, with its own strings already in it — one round trip fewer. */
export function guestJs(lang: Lang): string {
  return `const T = ${JSON.stringify(STRINGS[lang])};
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
const track = $("track");
const knob = $("knob");
const label = $("track-label");
let dragging = false;
let startX = 0;
let travel = 0;

function limit() { return track.clientWidth - knob.clientWidth - 8; }
function place(x) { knob.style.left = Math.max(4, Math.min(limit(), x)) + "px"; }
function rest() { knob.classList.remove("dragging"); knob.style.left = "4px"; track.classList.remove("done"); }

function fire() {
  track.classList.add("done");
  label.textContent = T.sent;
  void operate();
  // A rest, never a lock: a guest may command again to close the gate behind
  // them, and a locked control would contradict that.
  setTimeout(() => { rest(); label.textContent = T.action; }, 2000);
}

knob.addEventListener("pointerdown", (event) => {
  dragging = true;
  startX = event.clientX;
  travel = parseFloat(knob.style.left || "4");
  knob.classList.add("dragging");
  knob.setPointerCapture(event.pointerId);
});

knob.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  place(travel + (event.clientX - startX));
});

function release() {
  if (!dragging) return;
  dragging = false;
  knob.classList.remove("dragging");
  const reached = parseFloat(knob.style.left || "4") >= limit() - 6;
  if (reached) fire(); else rest();
}
knob.addEventListener("pointerup", release);
knob.addEventListener("pointercancel", () => { dragging = false; rest(); });

// A deliberate key press on a focused control is as much an intent as a drag.
knob.addEventListener("keydown", (event) => {
  if (["Enter", " ", "ArrowRight", "End"].includes(event.key)) {
    event.preventDefault();
    place(limit());
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
