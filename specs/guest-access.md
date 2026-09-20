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
6. Two regenerations, because they answer two different accidents: **« Nouvelle invitation »** mints a
   new code and leaves the phones alone (the lost email); **« Régénérer l'accès »** mints a new code
   *and* cuts every phone off (the lost phone).

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
11. **Ceilings at both levels**: 12 opens per hour per access, 30 per hour for the gate.

### 3.3 The press

12. The decision comes first and the counter second: a refused press never reaches the recipe.
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
20. **The control is a slide**, with a keyboard equivalent. **Nothing is said on success.** A failure
    note replaces the previous one rather than stacking.
21. **Sharing is a feature, not an abuse**: the family arrives in two cars. The page shares the link
    through the phone's own apps, or copies it.
22. **No hard device cap.** A cap would lock a legitimate brother-in-law out at 23 h. Past six phones
    the owner gets an alarm — information, never a block.
23. French by default, English when the phone asks for it.

### 3.5 The owner's page

24. One page inside Sowel, under Administration, admin-only by construction: the core refuses anyone
    else before the plugin is reached.
25. The list carries both kinds side by side, grouped by state (actifs, à venir, suspendus, révoqués,
    terminés), each line showing the code, the validity in words, the hours, the phones, the last use.
26. **The page shapes nothing.** Groups, states and refusals arrive computed; the page draws them and
    formats dates in the viewer's own locale.
27. A header line says what the owner cannot otherwise know: the gate contact, whether a recipe has
    ever answered, whether the guests' door is open, and where guestFlow stands.
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
| `gate.ts` | The device, the counter, and waiting for the recipe's answer |
| `service.ts` | Every rule, applied once, for both surfaces |
| `admin-api.ts` | The owner's page, shaped server-side |
| `public-api.ts` | The guests' surface, on the anonymous tree |
| `guest-app.ts` | The guests' page: HTML, CSS, JS, manifest, icon |
| `guestflow.ts` | The connector, both ways, always outbound |
| `index.ts` | The Sowel contract: settings, device, orders, the two HTTP surfaces |
| `ui/panel.js` | The owner's page, plain DOM, Sowel's design tokens |

## 5. Data

`data/plugins/guest-access/accesses.json` and `journal.json` (core spec 180 — the directory survives
plugin updates and rides inside Sowel's backup). No database: a few dozen rows changed a handful of
times a week, and a file the owner can read after a power cut.

## 6. Test plan

162 unit tests, `npm test`:

| Suite | Covers |
|---|---|
| `paris` (9) | Both DST transitions, the hour that does not exist, wall clock ↔ instant |
| `codes` (8) | The alphabet, the foldings a guest actually types, the hashed token |
| `validity` (22) | The window in force, every refusal, what the owner may write |
| `store` (11) | Persistence, the corrupt file kept aside, the purge, the counters |
| `gate` (11) | The counter published last, the double tap, the queue, nothing answering |
| `service.owner` (14) | Creation, editing, the two regenerations, suspension, deletion |
| `service.guest` (15) | Enrolment, its throttles, the press, the ceilings |
| `service.stays` (10) | Stays applied, replayed, cancelled, reinstated |
| `admin-api` (10) | The state the page draws, the actions, the refusals |
| `public-api` (16) | The page, its CSP, enrolment statuses, the press |
| `guestflow` (13) | Pull, push, the pending push, the signature, the HTTP refusal |
| `index` (8) | The core contract, the orders, the data directory |
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
