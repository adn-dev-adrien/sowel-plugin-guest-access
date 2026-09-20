# The Sowel core change this plugin needs (spec 180)

This plugin brings a page into Sowel's UI and serves the guests' page on Sowel's anonymous tree.
Neither capability exists in Sowel today, so this directory carries the core change that adds them —
as a patch, because the session that wrote it could not push to `mchacher/sowel`.

**It is generic on purpose.** The core learns nothing about gates, guests or gîtes: it gains three
capabilities any plugin can use, and this plugin is simply the first to.

| Capability | What it is |
| --- | --- |
| `ui: { entry, label, icon }` | A manifest may declare an ES module; the SPA imports it at `/plugins/<id>/page` and calls `mount(container, ctx)`, with `ctx.api()` already bound to `/api/v1/plugins/<id>/page/*`. Admin-only, assets under `/plugin-ui/<id>/*`. |
| `publicTree: true` | A manifest may declare an anonymous tree at `/p/<id>/*`. It answers the same 404 as an undeclared plugin **until an admin opens it** (audit-logged), then 60 req/min per IP, `X-Robots-Tag: noindex`, 30 s timeout, and `Set-Cookie` from a plugin refused. |
| `deps.dataDir` | `data/plugins/<id>/`, created before the factory runs, never touched by install, update or uninstall — and carried by the backup. `pluginDir` is not a place to keep state: an update removes it and unpacks the new release in its place. |

## Applying it

```bash
git clone https://github.com/mchacher/sowel
cd sowel
git checkout -b feat/plugin-pages-and-public-tree
git am < path/to/0001-sowel-core-spec-180-plugin-pages-and-public-tree.patch
npm install && npm run validate       # backend + UI: typecheck, lint, format, tests
git push -u origin feat/plugin-pages-and-public-tree
gh pr create --base main --title "feat(plugins): a plugin may bring a page, a door and a drawer (spec 180)"
```

The patch is based on `mchacher/sowel@cd29c71` (v1.71.0) and carries, beyond the code:
`specs/180-plugin-pages-and-public-tree/spec.md`, the row in both spec indexes, and the EN/FR
sections of `docs/technical/plugin-development.md` and `docs/technical/api-reference.md` — the three
documentation gates that repository runs on every pull request.

**Tests it adds:** 23 route cases (`src/api/routes/plugin-surface.test.ts`), 7 on the page listing,
3 on `getDataDir`, 3 on the settings proxy, 2 on the backup, and 6 on the SPA page. The whole suite
was green when the patch was written: 2 614 backend, 1 122 UI.

## Until it is merged

This plugin declares `"sowelVersion": ">=1.72.0"`. On an older Sowel the store button stays disabled,
which is the honest outcome: the page would have nowhere to render and the guests' door would answer
404.
