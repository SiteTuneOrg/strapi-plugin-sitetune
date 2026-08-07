# SPEC-001: SiteTune Plugin — SEO, Social Sharing, Sitemap & OG Image Editor

- **Spec ID:** SPEC-001
- **Title:** SiteTune — a self-contained Strapi plugin for SEO, social sharing, sitemap, and per-article OG image generation
- **Status:** New (Triagem / Revisão Inicial)
- **Author:** Claude
- **Created Date:** 2026-08-05
- **Target Stack:** Strapi 5.51.1, Node.js (Docker), `@strapi/sdk-plugin` (scaffolding), Satori (new dep), `@resvg/resvg-js` (new dep, native Node bindings — no wasm)
- **Supersedes:** `astro-sitetune` SPEC-003 ("OG Image Editor — Satori + resvg on Cloudflare Workers"). Scope has grown substantially since that spec (see revision log below) — this is no longer just a ported version of SPEC-003, it's a broader plugin SPEC-003's editor is one of four pillars of.
- **Design principle, decided with user (2026-08-05):** **no dependency on other Strapi plugins.** Everything the plugin needs (SEO/social schema, sitemap, OG image rendering) is implemented inside it — npm libraries (satori, resvg) are fine, depending on another Strapi ecosystem plugin (e.g. `pluginpal/strapi-webtools` for sitemap) is not. Name rationale: SiteTune "tunes" a site — SEO, social sharing, sitemap, and OG images are the tuning knobs.

### Revision log (decisions made in conversation, chronological)

1. Feature originally scoped in `astro-sitetune` SPEC-003 as a secret-gated Astro route, PNG download-only. Moved here because running inside Strapi's own admin panel removes both that spec's biggest blockers: no new secret/token needed (Strapi's own RBAC), and no wasm-loading risk (native Node, not Workers).
2. Custom Field vs. Plugin: rejected custom field — Strapi custom fields cannot be of type `media`/`relation`/`component`, so a custom field could never own `seo.openGraph.ogImage` directly. Chose a Content Manager **Edit View side panel** instead (`addEditViewSidePanel`), which has full document read/write access.
3. Local admin customization vs. real plugin: chose real plugin (`src/plugins/`), for isolation, its own RBAC permission namespace, and reuse across future SiteTune sites.
4. Evaluated 15 marketplace SEO/sitemap/redirect plugins (see [Marketplace survey](#marketplace-survey-summary) below) — confirmed none do server-side templated OG image generation, and the most-established SEO component schema (`strapi-community-plugin-seo`'s `shared.seo` + `shared.open-graph`) is a dead, archived repo — so we adopt its **schema shape** (proven, MIT) without depending on the dead package.
5. Scope expanded from "OG image editor" to three pillars: SEO+social base components, the OG image editor, and sitemap (+ robots.txt).
6. i18n confirmed as a hard product requirement ("SiteTune é para todos os sites") even though this specific project doesn't have i18n enabled yet — components must be i18n-ready from day one.
7. Sitemap decided **in scope for v1**, specifically because of i18n/hreflang support — this project's Astro frontend already has its own sitemap (`@astrojs/sitemap`, confirmed live at [astro-sitetune.marcos-junqueira.workers.dev/sitemap-0.xml](https://astro-sitetune.marcos-junqueira.workers.dev/sitemap-0.xml)) with no hreflang, so it's redundant here today but is the product differentiator for sites that don't already have equivalent tooling. **Open item, not decided:** whether `astro-sitetune` ever switches to consuming Strapi's sitemap instead of its own — out of scope for this spec.
8. **Sequencing: Redirect Manager built _before_ Sitemap, both in v1.** Reason offered initially — "redirects has immediate value, sitemap doesn't until a site proxies it" — doesn't fully hold up: a redirect only takes effect on real traffic once a site's frontend/edge enforces it too, same fundamental dependency as the sitemap (see §3.4/§3.5's "ships dark" notes — both apply now). The sequencing decision stands anyway, on a narrower, correct basis: Redirects is simpler to build (no hreflang/i18n correctness burden) and has _some_ standalone value pre-integration — a single source-of-truth CRUD list of intended redirects that editors can maintain even before any frontend enforces them — which a sitemap genuinely has none of. So: Redirects (Pillar C) is built first, Sitemap (relabeled Pillar D) second.
9. **Pillar A's schema ended up as `sitetune.seo` + `sitetune.open-graph`, not `shared.seo`/`shared.open-graph` as §2/§3.2 originally describe.** Discovered during implementation (`strapi-plugin-sitetune` repo, separate from this host): Strapi plugins cannot register real `components` — verified against `@strapi/core`'s `loaders/components.js`, which only ever loads from the host's own `src/components`; a plugin's `strapi-server.js` surface has no `components` export, only `contentTypes`. Since this plugin repo is intentionally kept separate from any one host (README: "reusable on any Strapi site"), and the SPEC's own no-dependency principle argues against baking plugin schema into a specific host's files by hand, Pillar A instead creates its schema **at runtime** from the plugin's `bootstrap()`, via the Content-Type Builder's internal service (`strapi.plugin('content-type-builder').service('components'|'content-types')`, verified directly against its source — `packages/core/content-type-builder/server/src/services/{components,content-types}.ts`), on first boot against a linked host. (`strapi-community-plugin-seo`'s marketplace listing describes similar auto-detect-and-create behavior for `shared.seo`, cited here as prior art for the _pattern_, not verified against that plugin's own source.) To avoid colliding with this project's existing `shared.seo` (real data, different shape) or risking a destructive in-place component swap, the new schema lives under its own `sitetune` category (`sitetune.seo`, `sitetune.open-graph`, UIDs computed from `${categorySlug}.${displayNameSlug}` — verified in `component-builder.js`).
10. **Superseding item 9's `sitetuneSeo` auto-field: reverted, scope cut back to component creation only — no automated edits to `article`/`global` (or any existing content-type).** Verified against a real boot of this host (`strapi-sitetune`): the `editContentType()` call that added the additive `sitetuneSeo` field also silently corrupted unrelated relations. `editContentType()`'s diff logic compares relation attributes by a `targetAttribute` field; the live-loaded `strapi.contentTypes[uid].attributes` shape being round-tripped back through the edit only carries `inversedBy`/`mappedBy`, so every relation attribute read as "changed," and the diff tore down its inverse side on the _other_ content-type without re-creating it. This dropped `author.articles` and `category.articles` from their schemas — not a boot failure at the time it happened, only surfacing as an unrelated-looking DB metadata error ("inversedBy attribute articles not found") on the _next_ boot, several steps removed from the actual cause. A fix was found and verified (use the content-types service's own `formatContentType()`, which does the `inversedBy`/`mappedBy` → `targetAttribute` conversion Strapi's admin UI itself relies on) — but decided the risk class wasn't worth carrying for an unattended step touching a host's existing content-types, for a field that's genuinely optional to auto-create. **Result:** Pillar A now only creates the `sitetune.seo`/`sitetune.open-graph` components (verified working against a real host, including the batched-creation fix for the two-component interdependency and the `strapi.reload()` trigger, both required and confirmed necessary along the way). Attaching `sitetune.seo` to a content-type, and any backfill from the old `shared.seo` shape, is now a manual step via the admin panel's Content-Type Builder — which goes through the full, safe controller path this spec's automation was trying to shortcut. The backfill migration service (originally planned in §3.2) was removed along with the auto-field, since it had nothing to write to without it; re-adding both is possible later if the field-creation step is redesigned around the admin UI's own edit path instead of calling the service directly. **This changes §3.3 again**: Pillar B's write path depends on wherever a given host manually attaches `sitetune.seo` — no longer a fixed `sitetuneSeo.openGraph.ogImage` on `article`. See the `strapi-plugin-sitetune` repo's README ("Pillar A design notes" section) for the full rationale — the plugin's code lives in that separate repo, not in this project's `src/plugins/`.
11. **§3.4's "validation at the controller level" was wrong — corrected during Pillar C implementation to a Document Service middleware instead.** Verified against `@strapi/content-manager`'s `services/document-manager.js`: the Content Manager admin UI's generic CRUD never calls a plugin's own controller — it calls `strapi.documents(uid).create/update` directly. A `factories.createCoreController` override of `create`/`update` (the pattern §3.4 assumed, and the one Pillar B's custom actions correctly use for genuinely custom actions) would therefore never run for a normal admin edit of a redirect. The actual hook every caller goes through — Content Manager, this plugin's own content-API routes, and the CSV importer — is `strapi.documents.use((ctx, next) => ...)`, Strapi's own Document Service middleware chain, registered once in `register.ts`. This also means CSV-imported rows get the same validation as a Content Manager edit for free, with no separate call needed in the importer. Content-type registration itself needed no equivalent correction — plugin content-types load through the same native path `api::` ones do (confirmed against `loaders/plugins/index.js`), unlike Pillar A's components. See the `strapi-plugin-sitetune` repo's README ("Pillar C design notes" section) for the full rationale.
12. **§3.4's `statusCode` field — spec'd as `enumeration` with values `"301"`/`"302"` — doesn't boot against a real Strapi host; caught by this repo's CI `smoke` job, not by local build/typecheck/unit tests.** `@strapi/core`'s content-type validator unconditionally rejects `enumeration` values that don't start with a letter (`GRAPHQL_ENUM_REGEX`, enforced regardless of whether the GraphQL plugin is installed, since enum values must stay valid GraphQL identifier names). `"301"`/`"302"` fail that check. This class of bug — schema _shape_ invalid against real Strapi rules — is exactly what the `smoke` CI job (added on `main`, landed on this pillar's PR mid-review via a merge) exists to catch, and did: it installs the built plugin into a fresh `create-strapi` app and boots it for real, which local `tsc`/`vitest`/`strapi-plugin build` have no way to do. Fixed by changing `statusCode` to a plain `integer` (default `301`) and enforcing "only 301 or 302" at the application layer instead (`assertValidStatusCode()` in `redirect-validation.ts`, called from the write-guard middleware). See the `strapi-plugin-sitetune` repo's README ("Pillar C design notes" section, `statusCode` paragraph) for the full rationale.
13. **Pillar C manually verified end-to-end against a real, disposable Strapi 5 app — two more corrections found in the process, neither caught by CI's `smoke` job (which only checks that the plugin boots, not that anything works).** Method: `create-strapi` + sqlite, production boot (`npm run build && npm run start`, not dev-mode `develop` — avoids the dev watcher's inotify limits and matches how a real deployment actually runs), then drove the real admin/content-API HTTP surface directly with `curl` (Content Manager's collection-types API, the content-API route, the CSV import route), rather than only exercising the plugin's own code through unit-test mocks. Findings: (a) **the content-API route's real path is `GET /api/sitetune/redirects`, not `GET /sitetune/redirects`** as §3.4 and the DoD said — content-API routes are mounted under Strapi's `api.rest.prefix` (`/api` by default) same as any `api::` route, confirmed both by reading `@strapi/core`'s `services/server/content-api.js` and by getting a literal `404` at the undocumented path on a real boot; the plugin's admin-type CSV-import route (`POST /sitetune/redirects/import`) is unaffected — plugin _admin_ routes don't get an extra prefix, only _content-api_ ones do. (b) **a `read-only`-type API token does not grant access to the endpoint** — read-only tokens auto-grant only the standard `find`/`findOne`/`count` action names on `api::` content-types, and this is a custom action (`redirect.publicList`) on a plugin content-type; confirmed a `read-only` token gets `403`, while a `custom` token with the single permission `plugin::sitetune.redirect.publicList` (found via `GET /admin/content-api/permissions`) works, least-privilege. Everything else — CRUD (including the partial-update merge-and-revalidate path), all four validation-rejection cases, and the CSV import round-trip — matched what the unit tests already predicted. See the `strapi-plugin-sitetune` repo's README ("Pillar C design notes" section) for the full verification log.

---

## 1. Executive Summary & Context

SiteTune is a self-contained Strapi admin panel plugin with four pillars, in build order:

- **A. SEO + Social Sharing base** — `shared.seo` + nested `shared.open-graph` components, i18n-ready, replacing the project's current ad hoc `shared.seo`.
- **B. OG Image Editor** — per-article, template-based PNG generation (Satori + resvg), writing directly into `seo.openGraph.ogImage` via an Edit View side panel.
- **C. Redirect Manager** — CRUD + CSV import for 301/302 redirects, exposed via a content-API endpoint for any frontend to enforce.
- **D. Sitemap + robots.txt** — self-generated XML sitemap with hreflang/alternate-language links, plus a matching `robots.txt`.

**C and D share the same fundamental limitation, worth stating once up front:** Strapi doesn't own a site's canonical public domain (see §2). Neither redirects nor the sitemap have any real-world effect until a site's frontend/edge integrates them — Strapi is the source of truth and the API, not the thing serving public traffic. Both pillars ship "dark" in v1 (see §3.4, §3.5); C is still built first because it has some standalone value pre-integration (a maintained list of intended redirects) that D genuinely doesn't (an unserved sitemap has zero value, not even organizational).

None of these depend on another Strapi plugin. See [Marketplace survey](#marketplace-survey-summary) for what exists today and why it doesn't cover this.

### Marketplace survey summary

15 SEO/sitemap/redirect plugins from `community.strapi.io` were reviewed against GitHub's API (not just marketplace copy) for real maintenance signal:

| Category                 | Plugins                                                                                   | Verdict                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI text/image generation | `strapi-plugin-seo-gemini`, `strapi-seo-ai-generator`, `blogseo`                          | Text-only or third-party SaaS; none fit "no external dependency"                                                                                                                                                                                                                                 |
| SEO component + scoring  | `strapi-community-plugin-seo`, `seo-vitals`, `seo-analyzer`, `content-optimizer`          | `strapi-community-plugin-seo` has the most proven schema (`shared.seo`+`shared.open-graph`) but its repo is **archived since April 2026** — dead. Others are small/unverifiable but validate that live scoring/feedback is a real, recurring pattern worth doing eventually (not in v1, see §6). |
| Sitemap                  | `strapi-5-sitemap-plugin`, `webtools-addon-sitemap`, `webbycrown-strapi-advanced-sitemap` | `webtools-addon-sitemap` (pluginpal) is the most mature (59★, commits days old) but pulling it in would violate the no-dependency principle.                                                                                                                                                     |
| Redirects                | `strapi-plugin-redirect-urls`, `strapi-v-5-redirects`, `strapi-plugin-redirect-manager`   | Real gap (slug changes → broken links), low-maturity options exist; built in-house as Pillar C, in v1.                                                                                                                                                                                           |
| OG/social                | `spencercooley-strapi-plugin-og-pretty-link`, `littlebox-strapi-suite`                    | Neither generates images — `og-pretty-link` fetches OG data from _external_ URLs, the opposite of our use case.                                                                                                                                                                                  |

**Conclusion: no ready-made plugin does what Pillar B needs; the schema convention for Pillar A is worth adopting (not depending on); sitemap tooling worth building in-house per the no-dependency principle.**

---

## 2. Current State

- **`shared.seo`** ([src/components/shared/seo.json](../../src/components/shared/seo.json)) has `metaTitle`, `metaDescription`, `metaImage`, `noindex`, `nofollow`, `canonicalURL`, `keywords`, `structuredData` — one flat component, one image reused for both search and social. Used by `article` and `global` ([src/api/global/content-types/global/schema.json](../../src/api/global/content-types/global/schema.json)).
- **No `openGraph` sub-component exists.** The target shape (adapted from `strapi-community-plugin-seo`'s archived-but-proven schema) separates search metadata from social metadata:
  ```jsonc
  // shared.seo (ours, extended)
  metaTitle, metaDescription, metaImage, noindex, nofollow, canonicalURL, keywords, structuredData,
  openGraph: component → shared.open-graph   // NEW

  // shared.open-graph (NEW)
  ogTitle, ogDescription, ogImage, ogUrl, ogType
  ```
  Keeping `noindex`/`nofollow` as booleans (existing, admin-friendly checkboxes) rather than switching to the single `metaRobots` string the reference schema uses — no reason to regress UX for parity with a dead repo.
- **i18n is not enabled anywhere in this project today** — no `@strapi/plugin-i18n` reference, no content-type has `pluginOptions.i18n.localized`. This spec still designs `shared.seo`/`shared.open-graph` fields as i18n-ready (`pluginOptions.i18n.localized: true` on the text/media fields) since i18n is a confirmed future requirement for the product, not just this project.
- **`astro-sitetune` already has a working sitemap** — `@astrojs/sitemap` in `astro.config.mjs`, confirmed live: [sitemap-index.xml](https://astro-sitetune.marcos-junqueira.workers.dev/sitemap-index.xml) → [sitemap-0.xml](https://astro-sitetune.marcos-junqueira.workers.dev/sitemap-0.xml). No hreflang (single-locale site today). Redundant with Pillar C for this specific project until/unless the frontend is switched over — **not decided in this spec**.
- **Deployment topology matters for Pillars C and D:** Strapi and the public site are different hosts (Strapi's admin/API domain vs. the Astro Worker's public domain). Strapi-generated `/sitemap.xml`, `/robots.txt`, and redirect enforcement are only useful at the **canonical site URL**, which Strapi doesn't own. Whichever site adopts this needs to either proxy those routes from its frontend (an Astro API route that fetches from Strapi and re-serves at `/sitemap.xml`, or middleware enforcing redirects) or configure edge routing. This is exactly the "frontend adjustment" flagged at the very start of this conversation — it's real, and it's Pillars C/D's concern, not Pillar B's.
- **Media uploads** already go through Strapi's `upload` service, configured for Cloudflare R2 via the `aws-s3` provider ([config/plugins.ts](../../config/plugins.ts)) — Pillar B's generated PNGs go through the same path, no new upload code needed beyond calling the existing service.
- **No plugins exist yet** (`src/plugins/` doesn't exist); `src/admin/app.tsx` is still the unmodified example.
- **No font assets exist in this repo.** Satori needs a non-variable TTF/OTF/WOFF. **Open item:** confirm which font to bundle before implementation.
- **`Dockerfile.prod` builds on `node:22-slim`** (Debian, glibc) — mainstream target for `@resvg/resvg-js`'s prebuilt native bindings. `sharp` (used by Strapi's own `upload` plugin) is already a working precedent for native napi modules in this exact image.
- **`article` has `draftAndPublish: true`** — Pillar B's write path must decide whether generating an OG image also publishes, or stays draft-only (see §3.3).

---

## 3. Design

### 3.1 Plugin scaffolding

```bash
npx @strapi/sdk-plugin@latest init src/plugins/sitetune
```

```
src/plugins/sitetune/
├── admin/src/
│   ├── index.ts                    # register()/bootstrap()
│   └── components/
│       ├── OgImagePanel.tsx        # Pillar B: addEditViewSidePanel entry
│       └── OgImageEditorModal.tsx  # two-pane editor (preview + form)
├── server/src/
│   ├── routes/{og-image,sitemap}.ts
│   ├── controllers/{og-image,sitemap}.ts
│   ├── services/{og-image,og-template,sitemap}.ts
│   ├── content-types/                # shared.seo, shared.open-graph component defs
│   └── index.ts                      # permission actions, bootstrap migration
├── strapi-admin.js
└── strapi-server.js
```

Registered in `config/plugins.ts`:

```typescript
sitetune: { enabled: true, resolve: './src/plugins/sitetune' },
```

### 3.2 Pillar A — SEO + Social Sharing components

- New `shared.open-graph` component (§2 shape) and an added `openGraph` field on the existing `shared.seo` component.
- **Migration, not just a schema edit:** existing `article`/`global` entries already have `seo.metaTitle`/`metaDescription`/`metaImage` data. A bootstrap migration script (Strapi `bootstrap()` lifecycle, idempotent — check-then-write) backfills `openGraph.ogTitle ← metaTitle`, `ogDescription ← metaDescription`, `ogImage ← metaImage` for every existing entry that already has a `seo` component but no `openGraph` value.
  - **Deviation from the reference schema, deliberate:** the source schema (`strapi-community-plugin-seo`) marks `ogTitle`/`ogDescription` as `required: true`. Ours does not. Entries whose `seo` component is unset entirely (e.g. `global`, or any article never given SEO data) would otherwise get a required field silently created empty by the migration, which fails validation on that entry's _next_ unrelated save — a mystery error for whoever's editing it, far removed from the migration that caused it. The migration only touches entries that already have `seo` populated; entries with no `seo` at all are left alone, and `ogTitle`/`ogDescription` stay optional in our schema so a partially-filled `openGraph` never blocks a save.
- **i18n localization is two-level, confirmed against Strapi's own i18n plugin source** (`content-types.ts`'s `isLocalizedAttribute`/`isLocalizedContentType`, and the article fixture in Strapi's document-service tests): marking fields _inside_ `shared.seo`/`shared.open-graph` with `pluginOptions.i18n.localized: true` is necessary but not sufficient. The **component attribute itself** — `seo` on `article`'s and `global`'s schema — also needs `pluginOptions.i18n.localized: true` once i18n is enabled on those content-types, or Strapi treats the whole `seo` block as a shared, non-localized value copied identically across locales regardless of what's marked inside it. Both levels need the flag; this repo doesn't set either today (i18n is off everywhere), so there's nothing to break now, but whoever turns on i18n later (here or on another SiteTune site) needs to set both.
- Fields marked `pluginOptions.i18n.localized: true` inside the components: everything except structural ones (`ogType` could arguably be shared, but simplest to localize the whole component and not special-case).

### 3.3 Pillar B — OG Image Editor

(Unchanged in substance from the previous revision of this spec — repeated here for completeness now that it's one pillar of three.)

- **Rendering:** `satori` + `@resvg/resvg-js`, one template (`darkDiagonalTemplate`) this phase, fonts loaded once via `fs.readFile` at module scope (no wasm, no per-isolate cold start).
- **Routes:** `POST /sitetune/og-image/preview` (renders, returns PNG, no write) and `POST /sitetune/og-image/generate` (renders, uploads via `strapi.plugin('upload').service('upload').upload()`, updates `article.seo.openGraph.ogImage` via the Document Service — writing to the new Pillar A field, not the old flat `metaImage`).
- **`draftAndPublish` decision, must be made explicitly:** either `generate` also publishes the change, or the panel UI explicitly tells the operator the change is draft-only until republished. Carries through to the DoD's "verified end-to-end" criterion — must mean the image resolves live on the frontend, not just that the CM field changed.
- **Admin panel:** `OgImagePanel`, a `PanelComponent` (receives `model`/`document`/`documentId` as props directly — no extra context hook needed), self-filters to `api::article.article`, opens a modal with live preview + form (title override, colors, optional CTA) prefilled from `seo.openGraph.ogTitle || seo.metaTitle || article.title`.
- **Permissions:** `plugin::sitetune.og-image.generate`, a registered admin permission action, visible in Settings → Roles like any built-in Strapi permission.

### 3.4 Pillar C — Redirect Manager

- New collection type owned by the plugin, `plugin::sitetune.redirect`: `from` (string, required, unique), `to` (string, required), `statusCode` (~~enum `301`/`302`~~ **integer, default `301`, only `301`/`302` allowed via application-level validation — `enumeration` doesn't boot against real Strapi, see revision log item 12**), `enabled` (boolean, default `true`), `hitCount` (integer, optional, incremented if a frontend reports hits back).
- **Validation:** reject duplicate `from` values and circular redirects (`from === to`, or `to` pointing at another redirect's `from` in a way that loops) ~~at the controller level~~ **as a Document Service middleware (`strapi.documents.use`) — corrected during implementation, see revision log item 11: Content Manager's admin CRUD bypasses a plugin's own controller entirely.**
- **Content-API endpoint:** `GET /sitetune/redirects` ~~(public or token-gated, decided explicitly during implementation)~~ **implemented as `GET /api/sitetune/redirects` (note the `/api` prefix, content-API routes are mounted under Strapi's `api.rest.prefix` same as any `api::` route — confirmed both by source and by a real boot, see revision log item 13) — token-gated, decided explicitly during implementation** — returns the enabled redirect list for a frontend to enforce in its own middleware/edge function. CSV import via the admin UI for bulk migration scenarios (site relaunch, URL structure change).
- **Admin UI:** ~~either a plain Content Manager collection-type view... or a dedicated plugin settings page...~~ **implemented as both**: standard CRUD uses the plain Content Manager view (no custom code needed once the content-type exists), CSV import got its own small admin page since it needs a file picker and a per-row result report that Content Manager's default view has no hook for.
- **Ships dark in v1, same as Pillar D (§3.5) and for the same reason (§1):** this plugin provides the data and the API; a specific site's frontend still has to fetch `/api/sitetune/redirects` and actually issue the 301/302 (e.g. Astro middleware, or a build step emitting a platform-specific redirects file). Not scheduled for any site here.

### 3.5 Pillar D — Sitemap + robots.txt

- `GET /sitetune/sitemap.xml` — self-built, walks published entries of configured content-types (`article` at minimum; extensible via plugin config to `category`, `author`, static pages), emits `<url>` entries with `lastmod`, `changefreq`, `priority`.
- **hreflang / i18n:** for each URL, if the entry has Strapi `localizations`, emit `<xhtml:link rel="alternate" hreflang="{locale}" href="{url}">` siblings — this is the feature that doesn't exist in this project's current Astro-only sitemap and is Pillar C's actual differentiator (see §1's marketplace survey — this is exactly what made `webtools-addon-sitemap` stand out, done here without the dependency).
- `GET /sitetune/robots.txt` — references the sitemap URL, configurable disallow rules from an admin Settings page.
- **Settings page** (plugin's own admin section, not tied to any single content-type's edit view): per-content-type inclusion toggle, default `changefreq`/`priority`, manual URL exclusion list.
- **Deployment note (repeated from §2, important) — Pillar C ships dark in v1.** These routes live on Strapi's own host, not the canonical site domain. Without a frontend proxying `/sitemap.xml`/`/robots.txt` to Strapi (or edge routing), **no search engine or browser ever reaches them** — "the routes exist and return correct XML" is not the same as "the feature works for any site," and this spec does not schedule that frontend work for any site, including `astro-sitetune`. That's a deliberate scope cut, not an oversight: proxying is per-site frontend work (different stack per SiteTune client), tracked separately when a specific site adopts it. The DoD (§5) reflects this explicitly rather than implying Pillar C is user-visible on completion.

---

## 4. Testing Considerations

- **`@resvg/resvg-js` native binary compatibility** — low risk given `node:22-slim` + the `sharp` precedent (§2), but confirm with a real `Dockerfile.prod` build, not just local dev, before considering it settled.
- **Component creation idempotency (Pillar A)** — verify running `bootstrap()` twice against a host that already has both components doesn't error or duplicate anything. Verified against a real host; also cover the two-components-interdependent-in-one-call path and the partial-state (one exists, one doesn't) recovery path, both of which have real failure modes if built naively — see revision log items 9–10.
- **Document Service partial-update semantics** — verify updating only `seo.openGraph.ogImage` (Pillar B) doesn't clobber sibling `seo` fields; same open risk as before, now scoped to a nested path one level deeper.
- **i18n field behavior** — with i18n not yet enabled anywhere in this project, `pluginOptions.i18n.localized: true` on unlaunched fields can't be manually verified end-to-end here; at minimum, confirm the schema change alone doesn't break anything with i18n _disabled_ (the common case today), and unit/manually test localization behavior once any project enables i18n.
- **Sitemap XML validity** — validate output against the sitemap protocol schema and against a hreflang validator (e.g. checking reciprocal alternate links between locale pairs, a common hreflang mistake).
- **Redirect validation (Pillar C)** — verify duplicate `from` values and circular redirects are actually rejected, not just intended; verify CSV import applies the same validation row-by-row rather than bypassing it.
- **Side panel content-type filtering** (Pillar B) — verify `OgImagePanel` renders `null`, not just visually hidden, outside the Article edit view.
- **Permission enforcement** — verify unauthorized roles get 403 on write routes (`og-image/generate`); read-only preview/sitemap routes can use a lighter check.
- Satori CSS subset and template accuracy — same caveat as prior revisions, verify visually, don't assume.

---

## 5. Definition of Done (DoD) & Acceptance Criteria

**Pillar A — SEO + Social** (scope cut per revision log item 10 — see there for why the field-attach and migration steps below are no longer part of this pillar's automation):

- [x] `sitetune.open-graph` component created; `sitetune.seo` created with a nested `openGraph` field. Verified against a real host (`strapi-sitetune`).
- [x] i18n-ready field options set on both components.
- [ ] ~~Idempotent migration backfills `openGraph` from existing `metaTitle`/`metaDescription`/`metaImage`~~ — removed; attaching `sitetune.seo` to a content-type (and any backfill) is now manual, via the admin panel.

**Pillar B — OG Image Editor:**

- [ ] Font choice confirmed; font files bundled.
- [ ] `satori` + `@resvg/resvg-js` added; render service + template implemented.
- [ ] `/og-image/preview` and `/og-image/generate` routes, `generate` gated by `plugin::sitetune.og-image.generate` permission.
- [ ] `draftAndPublish` behavior decided and implemented (§3.3).
- [ ] `OgImagePanel` injected, visible only on Article edit view, live preview + form + generate-and-save.
- [ ] Verified the generated image resolves as `og:image` on a real published article on the frontend — not just that the CM field is set.

**Pillar C — Redirect Manager (ships dark in v1, see §3.4; see revision log items 11–13 for corrections to this section's original design):**

- [x] `plugin::sitetune.redirect` collection type with validation against duplicates and circular redirects. Validation implemented as a Document Service middleware, not a controller override — see revision log item 11. Verified end-to-end against a real Strapi 5 boot (create/update/delete, all four validation-rejection cases), see revision log item 13.
- [x] `GET /api/sitetune/redirects` content-API endpoint (note the `/api` prefix — see revision log item 13). Requires a Strapi API token (decided explicitly, not left public-by-default). Verified against a real Strapi 5 boot: `403` unauthenticated, correct JSON with a valid token.
- [x] CSV import working from the admin UI. Hand-rolled RFC-4180 parser, dedicated admin route + permission action, small custom admin page. Verified against a real Strapi 5 boot: a 3-row CSV with one deliberately-duplicate row produced the expected per-row report and DB state.
- [ ] Not built this pass, deliberately: a `hitCount` increment route — the field exists in the schema but no route increments it (not listed in this DoD's original scope; see README's "Pillar C design notes").
- [ ] Explicitly **not** in this DoD: any site's frontend actually enforcing these redirects.

**Pillar D — Sitemap + robots.txt (ships dark in v1, see §3.5):**

- [ ] `/sitemap.xml` and `/robots.txt` routes implemented on Strapi, correct XML/text output, validated against the sitemap protocol schema.
- [ ] hreflang alternate links emitted for localized content, using Strapi's `localizations` relation shape — **unverified design, confirm the relation shape empirically before implementing** (structurally correct even with i18n off, since no site here has i18n on yet).
- [ ] Settings page for per-content-type sitemap config.
- [ ] Explicitly **not** in this DoD: any site's frontend actually serving these at its canonical domain. This spec's "done" means the Strapi-side feature is correct and ready to be adopted; it does not mean any site (including this one) is live with it. Frontend proxy work is out of scope here per site.

**Cross-cutting:**

- [ ] `@resvg/resvg-js` verified against the real `Dockerfile.prod` build, not just local dev.
- [ ] `yarn build` passes.
- [ ] `astro-sitetune`'s SPEC-003 marked as superseded by this spec (follow-up action in that repo).

---

## 6. Implementation Plan (pending approval — later phase)

**Phases:**

1. Scaffold the plugin. Pillar A: components + migration script — lowest-risk, unblocks Pillar B since it writes into `seo.openGraph`.
2. Pillar B: render service → routes → verify PNG output against the real Docker target (resolves the resvg-binary risk before any admin UI) → `OgImagePanel` → permission action.
3. Pillar C: `plugin::sitetune.redirect` collection type + validation → content-API endpoint → CSV import.
4. Pillar D: sitemap route → hreflang logic → robots.txt → Settings page.
5. Manual visual pass on the OG template; XML validation pass on the sitemap.
6. `yarn build`.

**Explicitly deferred to a future phase (not v1), surfaced during the marketplace survey but out of scope here:**

- Auto-generate a default OG image on publish if the operator never opened the editor (fallback via lifecycle hook).
- Live per-field SEO scoring/feedback (character/pixel truncation, keyword density) — validated as a recurring pattern across 3 competing marketplace plugins, worth doing, not blocking v1.
- SERP + social preview cards reusing Pillar B's preview modal infrastructure.
- Site-wide SEO health dashboard (missing OG images, duplicate meta, accidental noindex, missing alt text).
- Distributing the plugin for reuse outside this repo (versioning, marketplace submission).

**Not planned at all (contradicts the no-external-dependency principle):** AI-assisted text/image generation requiring a third-party API key.
