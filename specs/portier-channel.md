# Portier channel — the house holds a channel open to Portier (v1.0.0)

| Field | Value |
|---|---|
| **Status** | Draft — **the HTML summary is what decides** (`specs/portier-channel.html`); owner's answers of 2026-09-14 recorded |
| **Branch** | `spec/portier-channel` _(spec only — no code)_ |
| **Created** | 2026-09-14 |
| **Author** | Adrien |
| **Replaces** | the long-poll towards guestFlow of v0.3.0 |
| **Other parts of the feature** | guestFlow `specs/gate-access-portier.md` · Portier `specs/portier.md` · homelab `specs/002-portier/spec.md` |

## 0. The feature at a glance

> This section is **identical in the four repositories** that carry a part of the feature. Each spec
> then details its own component only. The HTML summary next to each spec follows the same split.

**Goal.** A guest of the gîte or the lodge opens the gate from their phone, for their stay only
(check-in hour → check-out + 1 h). The owner keeps every access — stay or hand-made — in one list
where any of them can be edited, suspended or revoked.

| Component | Repository | Owns |
|---|---|---|
| **guestFlow** | `adn-dev-adrien/guestFlow` | the reservations; pushes each stay's access to Portier; the owner's list and settings pages, behind guestFlow's login; the SAS step with the code and its QR; the emails |
| **Portier** | `adn-dev-adrien/portier` (private) | the accesses, their keys, the journal, the guest web app, the server end of the house channel |
| **Sowel plugin** | `adn-dev-adrien/sowel-plugin-guest-access` | opens and holds the channel from the house; hands each command to the recipe |
| **Sowel recipe** | `adn-dev-adrien/sowel-recipe-guest-gate` | unchanged: pulses the gate, reports the outcome and the contact |
| **Hosting** | `homelab` (private) | where Portier runs, its ports, firewall rules and reverse proxies |

| Connection | Opened by | Carries |
|---|---|---|
| guestFlow → Portier | guestFlow, on the same machine | stay pushes (creation, date change, cancellation), invitation reads, the owner's actions, the logo |
| Portier → guestFlow | Portier, on the same machine | one kind of event: a notification for the owner |
| house → Portier | **the house**, held open | Portier pushes commands down it; the house pushes back results and the gate contact |
| phone → Portier | the phone | enrolment, a state check when the app comes to the foreground, signed commands |
| anything → the house | **nobody** | the house network accepts no incoming connection for this feature |

**No polling.** Nothing asks « anything new? » on a timer. Three things run on a clock and none of
them fetches data: the channel's keep-alive ping every **10 minutes**, guestFlow's retries — its
outbox and the emails waiting for Portier — *only while something is failing*, and the daily purge.

**Decided by Adrien on 2026-09-14:** the name Portier · guestFlow configures an access automatically
when a reservation exists, and afterwards only a date/time change in guestFlow or a manual change in
the list alters it · a cancellation revokes the access · the list is reachable from anywhere, behind
guestFlow's login · Portier runs on guestFlow's machine · the SAS keeps the code and shows a QR that
carries it · one key per access · the channel pings every 10 minutes · the J-7 email waits for Portier
and retries · PR guestFlow#547 is not merged as it stands: this work lands in it · Portier's repository
is private.
---

## 1. Context

Up to v0.3.0 this plugin long-polls guestFlow: an outgoing HTTPS request held about 25 s, answered the
moment a guest presses, then asked again — day and night. It authenticates with an API key and signs
the outcomes with a secret. On 2026-09-14 the owner rejected polling: he wants a secure channel and
push. Commands now come from **Portier**, and the house still opens the connection itself, so the
house network keeps accepting nothing from outside.

## 2. Goal

Carry each command from Portier to the recipe and each outcome back, over **one connection the house
opens and holds**, with no request on a timer and no incoming connection to the house. The recipe does
not change.

## 3. Functional rules

> Rules are bulleted while this spec is a draft; refer to them by section.

### 3.1 Opening and holding the channel

- **The plugin opens a WebSocket to Portier when it starts and keeps it open.** Only `wss://` is
  accepted — `ws://` is refused except to `localhost`, for development. The URL guard of v0.3 carries
  over.
- **It proves itself by answering Portier's challenge** with the house key. The key never travels.
- **It reconnects after any close**, with back-off: 1, 2, 5, 10, 30, then 60 s at most; the sequence
  starts again once a connection has held 60 s. A close for a refused key (`4401`) goes straight to
  60 s and logs « clé de la maison refusée par Portier ».
- **The device's `link` is true only between `ready` and the close.**

### 3.2 Frames

- **Every frame is signed** with the house key and bound to the connection by the challenge nonce;
  a sequence number grows by one in each direction.
- A frame from Portier with a bad signature, a sequence gap or a repeat → the plugin closes with
  `4400`, logs it and reconnects.
- The exact signed string is pinned by a test on each side, as in v0.3: reordering it would break
  every signature in production with both suites green.

### 3.3 Commands

- **On `pulse`**, the plugin checks the deadline — in Portier's clock, corrected by the offset
  measured at the challenge. Past it: `result { status: error, detail: expired }` and nothing else.
- Otherwise it **increments `requests`**, sets `last_request_at` and `last_stay`, and keeps the
  command id as the one in flight. The recipe fires on the counter, as today.
- **The recipe's `result` order becomes a `result` frame** for the command in flight. An outcome with
  no command in flight is ignored with a warning (carried from v0.3).
- **One command in flight at a time.** Portier waits for a result before sending the next; a `pulse`
  arriving while one is in flight answers `error busy`.
- **The house keeps its own ceiling**: more than 30 pulses in a rolling hour → `result refused
  ceiling`, without touching the counter, whatever Portier says. With the recipe's arm switch, it is
  the brake that stays in the house if Portier is ever compromised.
- **Nothing is buffered.** A pulse that could not be handed over is lost; the guest has already been
  told « maison injoignable ».

### 3.4 Keep-alive

- **A signed `ping` frame every `ping_minutes`, 10 by default** (decision 2026-09-14). No `pong`
  within 10 s → the plugin closes and reconnects.
- **Consequence, said plainly:** a clean restart of Portier or of a proxy closes the socket properly
  and the plugin reconnects within seconds. A *silent* break — a machine frozen, a cable — is noticed
  at the next ping: up to about 10 minutes during which a guest reads « maison injoignable ».
- A ping is an application frame rather than a WebSocket control frame, so Node's built-in
  `WebSocket` client can send it (Sowel runs Node 24): no dependency is added.

### 3.5 What does not change for the recipe

- The device keeps its data — `requests`, `last_request_at`, `last_stay`, `link` — and its orders —
  `result` and `gate_state`. **`sowel-recipe-guest-gate` is not modified.**
- `result` accepts `opened`, `refused`, `error`. `already_open`, unused since 2026-09-10, is removed.
- `gate_state` pushed by the recipe goes to Portier for the owner's list; it never reaches a guest.

### 3.6 Settings

| Key | Example | Note |
|---|---|---|
| `portier_url` | `wss://portier.<internal zone>/house/v1` | required; `wss://` only (§3.1) |
| `house_key` | (secret) | required; shared with Portier |
| `ping_minutes` | `10` | 1 to 30; default 10 |

The v0.3 settings `base_url`, `api_key`, `signing_secret` and `wait_seconds` are removed. Without
`portier_url` or `house_key` the plugin declares itself not configured and opens nothing.

### 3.7 The network path

- **The plugin reaches Portier by an internal name that resolves inside the house network, never by
  a public name.** Two reasons:
  - **no NAT on the path.** A home router's NAT loopback may drop an idle connection sooner than the
    10-minute ping, silently, and the channel would then be dead most of the time;
  - **the house endpoint is not published on the internet at all.**
- The name, the proxy and the firewall rules live in the private `homelab` repository.

**Edge cases:**
- Portier restarts → clean close → reconnect after 1 s → `link` back within seconds.
- The key is changed in Portier but not here → `4401` → retries every 60 s; `link` stays false.
- The clocks of the two machines drift by a minute → the offset measured at each challenge absorbs
  it; beyond ±2 min the challenge itself is refused and logged.
- Sowel restarts → a new connection; a command in flight at that moment is lost, and the recipe's
  « never trigger on the first counter reading » rule prevents a pulse at startup.

---

## 4. Architecture

| File | T/C | Responsibility |
|---|---|---|
| `src/portier-channel.ts` | C | connection, challenge, back-off, keep-alive, the command in flight, the ceiling; replaces `gate-poller.ts` |
| `src/frame-signature.ts` | C | signed frames and their pinned canonical string; replaces `gate-signature.ts` |
| `src/url-guard.ts` | T | `wss://` only, `localhost` tolerated |
| `src/index.ts` | T | the device, the orders, the settings |
| `manifest.json` | T | settings of §3.6, version **1.0.0** |
| `README.md` | T | rewritten in French for the owner: why the house holds the channel |

## 5. Device model

| Data | Type | Role |
|---|---|---|
| `requests` | number | counter of pulses received — the recipe's trigger (unchanged) |
| `last_request_at` | text | timestamp of the last pulse |
| `last_stay` | text | the access label carried by the pulse, e.g. « Gîte · 202609042 » |
| `link` | boolean | the channel to Portier is authenticated and open |

| Order | Values | Role |
|---|---|---|
| `result` | `opened`, `refused`, `error` | the recipe's outcome, sent back to Portier |
| `gate_state` | `open`, `closed`, `unknown` | the gate contact, pushed by the recipe |

## 6. UI / UX

The settings form of §3.6 and the `link` data on the device. The HTML summary
(`specs/portier-channel.html`) carries an interactive simulation of the channel: connection, ping every
10 minutes on an accelerated clock, a clean restart and a silent break, and what a guest reads during
each.

## 7. Test plan

- [ ] the challenge answer matches Portier's pinned vector; a wrong key yields `4401` and the 60 s back-off
- [ ] a frame with a bad signature, a gap or a repeat closes with `4400`
- [ ] a frame recorded on a previous connection is refused
- [ ] back-off sequence 1, 2, 5, 10, 30, 60 s, reset after 60 s connected
- [ ] a late `pong` closes and reconnects; a ping is sent every `ping_minutes`
- [ ] an expired pulse answers `error expired` and leaves `requests` untouched
- [ ] a pulse while one is in flight answers `error busy`
- [ ] the 31st pulse in an hour answers `refused ceiling`
- [ ] `ws://` to another machine is refused at start
- [ ] `link` is false before `ready` and after a close

## 8. Out of scope

- Any change to `sowel-recipe-guest-gate`.
- Buffering commands while the channel is down — never: the gate must not move minutes later.
- Several Portier instances or several gates.

## 9. Decisions

**Answered by Adrien on 2026-09-14:** no polling, a channel and push · the channel pings every
10 minutes.
