# The Sowel core change this plugin needs (spec 180)

This plugin brings a page into Sowel's UI and serves the guests' page on Sowel's anonymous tree.
Neither capability exists in Sowel today, so this directory carries the core change that adds them.

**It is now open as a pull request:** [mchacher/sowel#969](https://github.com/mchacher/sowel/pull/969),
branch `feat/plugin-pages-and-public-tree`. The patch below is kept in step with it, for anyone who
wants to run this plugin against a local Sowel before that PR is merged.

**It is generic on purpose.** The core learns nothing about gates, guests or gîtes: it gains three
capabilities any plugin can use, and this plugin is simply the first to.

| Capability | What it is |
| --- | --- |
| `ui: { entry, label, icon, placement?, equipmentLink? }` | A manifest may declare an ES module; the SPA imports it at `/plugins/<id>/page` and calls `mount(container, ctx)`, with `ctx.api()` already bound to `/api/v1/plugins/<id>/page/*`. Admin-only, assets under `/plugin-ui/<id>/*`. `placement: "main"` lists it in the main navigation rather than under Administration; `equipmentLink: { types }` puts a card on those equipments' pages, with a sentence the plugin writes (`GET equipment-link`), and the page gets `ctx.params`. This plugin asks for both. |
| `publicTree: true` | A manifest may declare an anonymous tree at `/p/<id>/*`. It answers the same 404 as an undeclared plugin **until an admin opens it** (audit-logged), then 60 req/min per IP, `X-Robots-Tag: noindex`, 30 s timeout, and `Set-Cookie` from a plugin refused. |
| `deps.dataDir` | `data/plugins/<id>/`, created before the factory runs, never touched by install, update or uninstall — and carried by the backup. `pluginDir` is not a place to keep state: an update removes it and unpacks the new release in its place. |

## Applying it

The branch is on the upstream remote, so the shortest path is to fetch it:

```bash
git clone https://github.com/mchacher/sowel
cd sowel
git fetch origin feat/plugin-pages-and-public-tree
git checkout feat/plugin-pages-and-public-tree
npm install && npm run validate       # backend + UI: typecheck, lint, format, tests
```

Or, from the patch kept here (eight commits, `git am` takes them in one go):

```bash
git checkout -b feat/plugin-pages-and-public-tree origin/main
git am < path/to/0001-sowel-core-spec-180-plugin-pages-and-public-tree.patch
```

Beyond the code it carries `specs/180-plugin-pages-and-public-tree/`
(spec, architecture, plan), the row in both spec indexes, and the EN/FR sections of
`docs/technical/plugin-development.md` and `docs/technical/api-reference.md` — the documentation
gates that repository runs on every pull request.

**Tests it adds:** 25 route cases (`src/api/routes/plugin-surface.test.ts`), 9 on the page listing, 2 on the sidebar/drawer split, 3 on the equipment card,
3 on `getDataDir`, 3 on the settings proxy, 2 on the backup, and 7 on the SPA page. `npm run validate`
is green on the branch: 2 621 backend tests, 1 128 UI tests.

## Until it is merged

This plugin declares `"sowelVersion": ">=1.72.0"`. On an older Sowel the store button stays disabled,
which is the honest outcome: the page would have nowhere to render and the guests' door would answer
404.
