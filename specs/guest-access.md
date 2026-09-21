# Guest gate access v3 — the house holds it

| Field | Value |
|---|---|
| **Status** | Implemented (2026-09-20) |
| **Supersedes** | the v1 transport (guestFlow's `specs/guest-gate-access.md`) and the v2 « Portier » model (`specs/gate-access-portier.md`) — both in the guestFlow repository |
| **Author** | Adrien |
| **Other parts** | Sowel core `specs/180-plugin-pages-and-public-tree/` · guestFlow `specs/gate-access-sowel-connector.md` · `sowel-recipe-guest-gate` |

## 0. The feature at a glance

> This section is **identical in the repositories that carry a part of the feature**. Each then
> details its own component only.

**Goal.** A guest of the gîte or the lodge opens the gate from their phone, for their stay only. The
owner keeps every access — stay or hand-made — in one list where any of them can be edited,
suspended, revoked or deleted. **And all of it keeps working without guestFlow.**

| Component | Repository | Owns |
|---|---|---|
| **Sowel core** | `mchacher/sowel` | two generic capabilities (spec 180): a plugin may bring a page into the UI, and may serve anonymous callers under `/p/<id>/*` |
| **This plugin** | `adn-dev-adrien/sowel-plugin-guest-access` | the accesses, their codes, their hours, the journal, the owner's page, the guests' page, the guestFlow connector |
| **The recipe** | `adn-dev-adrien/sowel-recipe-guest-gate` | decides and pulses; reports the outcome and the gate contact |
| **guestFlow** | `adn-dev-adrien/guestFlow` | the reservations: publishes a feed of stays, stores the invitation it is handed, shows the code and the QR in the SAS, the fiche and the emails |

| Connection | Opened by | Carries |
|---|---|---|
| phone → Sowel | the phone | enrolment, a state read, a press |
| Sowel → guestFlow | **Sowel** | the stay feed (read) and the invitations (written) |
| guestFlow → Sowel | **nobody** | guestFlow holds no credential over the house and opens nothing towards it |
| the recipe ↔ the plugin | the engine | the request counter, then the `result` and `gate_state` orders |

**Why the inversion.** v1 put the accesses in guestFlow because a Sowel API token inherits its
creator's role and actuates *every* equipment in the house — so the internet-facing machine could not
be given one. That reasoning is sound and it is answered better by **nobody holding a token at all**:
the house holds the rules, the recipe holds the trigger, and guestFlow is reduced to what it is
actually good for, which is knowing who is arriving and when.

**What it bought.** Three things v2 needed and v3 does not: a second service to deploy and back up,
an outbox with retries in guestFlow, and emails that waited on a machine being up. guestFlow now
holds a copy of the invitation, pushed to it, and composes its emails from what it already has.

---

## 1. Context

`sowel-plugin-guest-access` v0.3 was the house's half of v1: it long-polled guestFlow for pending
requests and handed each one to the recipe. Everything about who a guest was, when their stay ran and
whether their code was still good happened in guestFlow.

On 2026-09-20 the owner asked for the management interface to be on the Sowel side, for the connector
to be bidirectional, and for the whole thing to work without guestFlow. That is not a rearrangement of
v1: it moves the source of truth.

## 2. Goal

The plugin holds every access to the gate and everything about it, serves the owner a page inside
Sowel and the guests a page of their own, and treats guestFlow as one optional source of stays.

## 3. Functional rules

### 3.1 An access

1. An access carries a **kind**: `stay` (configured by guestFlow from a reservation) or `manual`
   (created by the owner on the page).
2. **A label is required** on both. An access named « — » is one nobody dares delete in six months.
3. **The code is the only secret a human handles.** Eight characters of Crockford base32 minus the
   ambiguous ones (no I, L, O, U), shown as `4K7M-9QT2`, compared with the dashes, spaces and case
   stripped, and with those four letters folded onto what they are mistaken for.
4. **The code is kept in clear**, deliberately: a guest who rings up because their phone is flat has
   to be read their code, which a hash forbids. It is a door code for one stay, on the house's own
   machine, and it is nulled seven days after the access ends. What is hashed is the phone's token
   (§3.4), which nobody ever dictates.
5. **A code is unique among everything that can still open the gate** — it identifies the access on
   its own, with no lodging picker anywhere.
6. **One « Changer le code »**, with a choice, because it answers two accidents: a new code that leaves
   the phones alone (the lost email), or a new code that *also* cuts every phone off (the lost phone).
   These used to be two buttons with names nobody could tell apart; the journal still records them as
   `invitation` and `regenerated`.

### 3.1.bis The gates

6.bis **One list of people per thing that opens.** A house may have a gate and a garage door, and who
   may open one is not who may open the other. Each gate is its **own Sowel device**, bound to its own
   equipment and driven by its own instance of the recipe — the plugin still never touches what opens.
   A new gate's device is named `Accès partagés · <name>`.
6.ter **An access lists the gates it opens — at least one, all known.** One code and one link for all
   of them: a person who may open two gates carries one link, and their phone shows one slide per gate
   (§3.4). An access that opens nothing is refused (`no_gate`), since nobody could tell it is broken.
6.quater **The first gate is the device every installation already had**, « Accès invités », under that
   name, so nothing bound to it has to be bound again. A file from before gates were plural is read as
   one gate that every access opens. A stay from guestFlow opens the first gate; the owner adds others
   by hand, and a later revision of the stay never takes them back.
6.quinquies **A gate goes away only if nobody still able to open depends on it alone** (`gate_in_use`),
   and never the last one (`last_gate`). Its device is marked offline rather than deleted — the plugin
   cannot remove a device — and every access forgets it.

### 3.2 When it may open the gate

7. In order: not revoked → not suspended → inside the window → inside a time window if any → under
   the ceilings. **Each refusal carries its own reason**, because « ça ne marche pas » in front of a
   gate at night is what produces a telephone call.
8. A `stay` window is the one guestFlow computed (check-in → check-out + 1 h, Paris wall clock, both
   DST transitions). A `manual` access is either ranged or permanent.
9. **An override can only ever widen**: « Ouvrir dès » must precede the start, « Prolonger jusqu'au »
   must exceed the end. That is what lets guestFlow rewrite a stay's dates whenever the reservation
   moves without shortening an access behind the owner's back. Cutting one short is « Suspendre ».
10. **Time windows apply every day**, may not cross midnight and may not overlap — two overlapping
    rules make the effective one unguessable. A press outside them is told **when the next one opens**.
11. **Ceilings at both levels**: 12 opens per hour per access, 30 per hour **per gate** — a busy gate
    does not starve the garage. Asked without a gate (the phone checking what it may do), the
    quietest of the access's gates stands in; every press is judged again on its own gate.
11.bis **A correct code is never refused by the anti-guessing budget.** Enrolment looks the code up
    *first* and only ever counts failures. The budget is **global** — ten failures in ten minutes,
    then every *failing* answer is held back 1 s, 2 s, 4 s, 8 s, capped at 10 s — and past 25
    failures in the window the owner is told once (journal kind `guessing`, and a notification).
    Not per IP, deliberately: the page is always served through a reverse proxy, so the plugin is
    handed the proxy's address and never the visitor's. The per-IP counter this replaces therefore
    counted the whole internet as one caller, and five wrong codes from anywhere refused every
    legitimate guest for ten minutes — proven on a running Sowel on 2026-09-21. The arithmetic that
    makes this enough: 32⁸ ≈ 1.1 × 10¹² codes; with 20 live accesses a guess succeeds once in ~55
    billion, and at a sustained 100 guesses a second a coin-flip's chance takes about twelve years.

### 3.3 The press

12. The decision comes first and the counter second: a refused press never reaches the recipe.
12.bis **A press names its gate.** A gate the access does not list is refused (`not_this_gate`) before
    anything else is looked at: the code is a key to *these* gates, not to the house. Unsaid is only
    accepted when the access opens exactly one gate.
13. **Two presses of the same access within two seconds are one press.** Two seconds and not ten: a
    guest is allowed to close the gate behind them, and that is a second, deliberate press.
14. Presses queue rather than race; the fourth caller is told to wait.
15. The plugin waits up to **10 s** for the recipe's `result`. Nothing answering is reported as such
    — the usual cause is a recipe nobody bound, and the owner's page says so.
16. **The gate's own state never reaches the guest.** The page is pollable by anyone holding a code,
    and a button reading « Fermer le portail » is a state display wearing a verb. The owner sees it.

### 3.4 The guests' page

17. Served on Sowel's anonymous tree at `/p/guest-access/`, which **answers 404 until an admin opens
    it** (core spec 180). Plain HTML, CSS and JavaScript, a few kilobytes, installable.
18. The invitation link carries the code **in the fragment** (`/#i=…`), which no server, proxy or
    access log ever sees. It is consumed once and removed from the address bar.
    Its address is **two settings, not a constant**: `guest_base_url`, the name the house publishes,
    and `guest_path`, where the page answers under that name (`/p/guest-access/` by default). A house
    that fronts Sowel under a name of its own — `acces.domainesolio.com`, a vhost whose tree is
    rewritten onto `/p/guest-access/` upstream — sets the path to `/` and hands its guests
    `https://acces.domainesolio.com/#i=CODE`. **That rewrite must cover the whole subtree, not just
    the root**: the page fetches `app.js`, `style.css`, `icon.svg` and `enrol` relative to itself, so
    a rule mapping the root alone serves an HTML page whose every asset 404s. A path that is not
    plainly a path is refused and logged rather than repaired — a nearly-right link is discovered by
    a guest standing at a gate. The owner's page states the link its guests get and the tree the
    alias has to rewrite onto.
19. A phone keeps a token of its own; only its SHA-256 is stored. The code is never kept on the phone.
20. **The control is Sowel's own slide-to-confirm** (core spec 146) — the one an owner already uses to
    confirm a gate or a garage door — reproduced in plain CSS and DOM because the page carries no
    framework: same 58 / 260 / 50 / 4 geometry, amber at rest, **green with a check on arrival and no
    text**, since nothing is said on success. Two departures from the core's version, both for use in
    front of a gate: it confirms without a word, and it returns to rest after two seconds rather than
    staying confirmed, because the same gesture closes the gate behind you. A keyboard equivalent
    remains. A failure note replaces the previous one rather than stacking, and a new press clears it.
21. **Sharing is a feature, not an abuse**: the family arrives in two cars. The page shares the link
    through the phone's own apps, or copies it.
22. **No hard device cap.** A cap would lock a legitimate brother-in-law out at 23 h. Past six phones
    the owner gets an alarm — information, never a block.
23. French by default, English when the phone asks for it.
23.bis **The words assume no gîte.** The plugin is « Accès partagés » (*Shared Access*): the same
    feature gives a child, a tradesperson or a neighbour the right to open, for a time. The plugin
    speaks only of an *access* and of *what opens*; stay, lodging and guest vocabulary appears only
    where a guestFlow connector supplies it. The technical id stays `guest-access` and the device
    stays « Accès invités » — renaming either would orphan an installation's settings, data and
    bound equipments.
20.bis **One slide per gate**, each carrying its gate's id and, when there are several, titled by its
    equipment's name. With a single gate the page looks exactly as it did.
23.ter **The page is titled after what opens**, by the name of the equipment the recipe drives —
    « Portail », « Porte du garage ». The recipe pushes it through an `opening_label` order at start
    and on every rename; the plugin learns a string and nothing about equipments. Until it has said,
    the page reads « Accès ». The name is escaped wherever it is printed: it comes from an admin's
    keyboard and lands on a page anyone can load. Before a code is typed, the title names a door only
    when the house has **one** gate: a page anyone can load does not list the house's doors.

### 3.5 The owner's page

24. One page inside Sowel, **in the main navigation** (`ui.placement: "main"`, core spec 180 R1.6.bis):
    who may open the gate this week is used day to day, not configured once. Still admin-only by
    construction: the core refuses anyone else before the plugin is reached.
25. **One tab per gate**, plus « Tous » once there are two, plus « + portail » to add one. On « Tous »
    each line says which gates it opens. The list carries both kinds side by side, grouped by state
    (actifs, à venir, suspendus, révoqués, terminés), each line showing the code, the validity in
    words, the hours, the phones, the last use.
25.bis **A line carries icons, not a wall of buttons** — Sowel's own (Lucide): copy the link, edit,
    hold / resume, and « ⋯ » for the rest (change the code, this access's journal, revoke). **Deleting
    is offered only once an access is revoked or ended**, and the server refuses it before
    (`still_live`): deleting a live access used to be revoking and erasing the line in one click.
    The guestFlow filters appear only when guestFlow is configured; the sync is an icon on its chip.
25.ter **The period is picked in order.** The first choice is « Valable » (en permanence / sur une
    période). « Jusqu'au » greys out and refuses every day, then every half hour of the same day, up
    to « À partir du »; moving the start past the end carries the end along, keeping the length. A
    stay's « Ouvrir dès » greys everything from the arrival on, « Prolonger jusqu'au » everything up
    to the departure. The browser's own date field is not used: it greys days but not hours, and not
    everywhere. The server keeps its own refusal (`end_before_start`, `not_earlier`, `not_later`).
26. **The page shapes nothing.** Groups, states and refusals arrive computed; the page draws them and
    formats dates in the viewer's own locale.
27. A header line says what the owner cannot otherwise know: each gate's contact, whether a recipe has
    ever answered for it, whether the guests' door is shut, and where guestFlow stands.
28. It reads when it is shown and when it comes back to the foreground. **No timer.**

### 3.6 The guestFlow connector

29. **Outbound only, both ways.** The house reads the stay feed from a cursor and writes back the
    invitations. guestFlow opens nothing towards the house and holds no credential over it.
30. Every call carries the API key **and** an HMAC signature over method, path, timestamp and body.
    Both halves fail closed without the secret, and anything outside ±2 min is refused.
31. **Plain HTTP towards another machine is refused.** The signature stops forging, not reading.
32. A stay arrives as a revision. Replaying a page changes nothing; a cancellation revokes; a
    reinstated reservation lifts the revocation **with the same code**.
33. A failed push stays pending and goes out at the next sync. A guest's email must never leave with
    a code that no longer opens anything.
34. **Without guestFlow, everything else works.** No configuration, no connector, no error.

### 3.7 Housekeeping

35. Every six hours: codes nulled seven days after the access ended, journal lines older than a year
    dropped. The journal **outlives the access it describes**.

---

## 4. Architecture

| File | Responsibility |
|---|---|
| `model.ts` | What an access is, and the ceilings |
| `paris.ts` | The Paris wall clock, both transitions, no dependency |
| `codes.ts` | The code a guest dictates and the token a phone keeps |
| `guest-url.ts` | The address the guest is given: the alias, its path, the fragment |
| `validity.ts` | The window in force, the decision, and what the owner may write |
| `store.ts` | Two JSON files in `dataDir`, written atomically, corrupt ones kept aside |
| `gate.ts` | One gate's device, its counter, and waiting for the recipe's answer |
| `gates.ts` | The list of gates: the first one kept, adding, removing, the label shown |
| `service.ts` | Every rule, applied once, for both surfaces |
| `admin-api.ts` | The owner's page, shaped server-side |
| `public-api.ts` | The guests' surface, on the anonymous tree |
| `guest-app.ts` | The guests' page: HTML, CSS, JS, manifest, icon |
| `guestflow.ts` | The connector, both ways, always outbound |
| `index.ts` | The Sowel contract: settings, device, orders, the two HTTP surfaces |
| `ui/panel.js` | The owner's page, plain DOM, Sowel's design tokens |

### The device's identity

Each gate is a device, declared and addressed by its own name; the first one is **« Accès invités »**. Sowel keys a discovered device by
its `friendlyName`: that string becomes `source_device_id`, and every later data update, status
change and order is matched against it. A lookup that misses is not an error anywhere, the core
simply returns. So a plugin whose declared name and published id differ publishes into a void: the
counter never moves, no recipe is ever triggered, and the recipe's answer comes back « Unknown
device ». v0.3 shipped exactly that. The name is also why it must not be renamed here: an installed
Sowel would file a second device and leave every equipment bound to the first.

**The counter is published at rest**, on start, before anyone can press. The recipe takes the
counter as it stands for its starting point and only fires above it, so an unpublished counter makes
the first guest's press its own starting point — swallowed, in front of a gate. Publishing the
resting value is also what re-bases the recipe after a Sowel restart, when the in-memory counter
begins again at zero.

## 5. Data

`data/plugins/guest-access/accesses.json` (version 2: the gates, then the accesses) and `journal.json` (core spec 180 — the directory survives
plugin updates and rides inside Sowel's backup). No database: a few dozen rows changed a handful of
times a week, and a file the owner can read after a power cut.

## 6. Test plan

192 unit tests, `npm test`:

| Suite | Covers |
|---|---|
| `paris` (9) | Both DST transitions, the hour that does not exist, wall clock ↔ instant |
| `codes` (8) | The alphabet, the foldings a guest actually types, the hashed token |
| `validity` (22) | The window in force, every refusal, what the owner may write |
| `store` (14) | Persistence, the corrupt file kept aside, the purge, the counters per gate, the version 1 file |
| `gate` (14) | The counter published last, the double tap, the queue, nothing answering |
| `gates` (6) | The first gate kept, a gate added as its own device, persistence, refusals, removal |
| `service.owner` (14) | Creation, editing, the new code, suspension, deletion |
| `service.guest` (22) | Enrolment, the anti-guessing budget, the owner's alert, the press on its gate, the per-gate ceiling |
| `service.stays` (10) | Stays applied, replayed, cancelled, reinstated |
| `admin-api` (14) | The state the page draws, the gates, the actions, the new code, deleting only once revoked |
| `public-api` (22) | The page, its CSP, its title and its escaping, enrolment statuses, the held answer, the gates listed, the press |
| `guestflow` (13) | Pull, push, the pending push, the signature, the HTTP refusal |
| `index` (9) | The core contract, the three orders, an order routed to its gate, the data directory |
| `url-guard` (5) | HTTPS or localhost, and the host that merely contains « localhost » |
| `guest-url` (10) | The alias, the path it is served under, what is refused, the fragment |

Manual: install, open the public access, flash the link on a phone, press in front of the gate, cut
guestFlow off and check that everything else still answers. Under an alias, check it on the alias:
the page must arrive styled and its slide must work, which is what proves the rewrite covers more
than the root.

## 7. Out of scope

- A QR rendered here. guestFlow already renders one for a stay; a hand-made access is shared by link.
- Days of the week on the time windows. « Every day 08:00 → 20:00 » covers the friend watering the
  plants; « only on Tuesdays » is a different need, added the day it exists.
- Accounts for guests. The code and the link, as before.
- Sending the invitation by SMS from the house.
