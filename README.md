# strapi-plugin-sitetune

Self-contained Strapi plugin for SEO, social sharing, redirects, and sitemap — with a template-based per-entry OG image generator built in.

**No dependency on other Strapi plugins.** Everything it needs (SEO/social schema, sitemap, redirect management, OG image rendering) is implemented inside the plugin itself. SiteTune "tunes" a site — SEO, social sharing, sitemap, and OG images are the tuning knobs.

## Status

**Pillars A and C implemented.** Pillar A is scoped down (see [Pillar A design notes](#pillar-a-design-notes) — unverified against a live host beyond component creation, see [Testing against a host](#testing-against-a-host)). Pillar C is implemented but **not yet verified against a real host** (see [Pillar C design notes](#pillar-c-design-notes)) — only unit-tested so far. Pillars B and D are still spec-only. See [`docs/SPEC-001-sitetune-plugin.md`](docs/SPEC-001-sitetune-plugin.md) for the full design, including the decision log, the marketplace survey of existing SEO/sitemap/redirect plugins that led here, and open items to resolve before implementation starts.

## The four pillars

- **A. SEO + Social Sharing base** — `sitetune.seo` + nested `sitetune.open-graph` components, i18n-ready. The plugin creates these components on the host; attaching `sitetune.seo` to a content-type (article, global, or any other) is a manual step via the admin panel's Content-Type Builder — see [Pillar A design notes](#pillar-a-design-notes) for why.
- **B. OG Image Editor** — per-entry, template-based PNG generation (Satori + resvg) from inside the Strapi admin panel, writing into whatever field a site has manually attached `sitetune.seo` to. Not yet implemented.
- **C. Redirect Manager** — `plugin::sitetune.redirect` collection type (CRUD via the standard Content Manager UI, plus CSV import) for 301/302 redirects, exposed via a token-gated content-API endpoint for any frontend to enforce. See [Pillar C design notes](#pillar-c-design-notes).
- **D. Sitemap + robots.txt** — self-generated XML sitemap with hreflang/alternate-language links, plus a matching `robots.txt`.

Pillars C and D ship "dark" until an adopting site's frontend integrates their output — see the spec for why, and why that's a deliberate scope cut rather than an oversight.

## Pillar A design notes

Strapi plugins can't register real `components` (verified against `@strapi/core`'s `loaders/components.js` — components only ever load from the host's own `src/components`). So Pillar A creates its schema **at runtime**: the plugin's `bootstrap()` checks whether `sitetune.seo` / `sitetune.open-graph` exist on the host, and if not, creates them through the Content-Type Builder's internal service, then triggers `strapi.reload()` (see `server/src/bootstrap.ts`) so they show up immediately in the current dev session.

**Deliberately does not touch any existing content-type.** An earlier version of this also added a `sitetuneSeo` field to `article`/`global` automatically, via `editContentType()`. That's what surfaced a real, serious bug: `editContentType()`'s diffing logic compares relation attributes by a field (`targetAttribute`) that the live-loaded `strapi.contentTypes[uid].attributes` shape doesn't carry (it has `inversedBy`/`mappedBy` instead) — so round-tripping the existing attributes back through an edit call makes every relation look "changed," and the diff tears down its inverse side on the _other_ content-type without re-creating it. Confirmed against a real host: adding `sitetuneSeo` to `article` silently dropped `author.articles` and `category.articles`, which only surfaced as an unrelated-looking DB error ("inversedBy attribute ... not found") on the _next_ boot — several steps removed from the actual cause. (The fix — using `content-types` service's own `formatContentType()` to get the correctly-shaped attributes — worked, but the class of risk wasn't worth carrying for an automated, unattended step touching a host's existing content-types. Attaching `sitetune.seo` to a content-type is now a manual step via the admin panel, which goes through the full, safe controller path.)

**Note on Strapi's own docs**: the official page ["How to create components for Strapi plugins"](https://docs.strapi.io/cms/plugins-development/guides/create-components-for-plugins) claims a plugin can manually ship a component at `/my-plugin/server/components/category/component-name.json` and it'll "be available in both the Content-Type Builder and Content Manager." That's not what the shipping loader does — `loaders/index.ts` runs `loadComponents(strapi)` independently of, not nested inside, `loadPlugins(strapi)`, and `loadComponents` only ever reads `strapi.dirs.dist.components` (the host's own `src/components`, compiled). Nothing in `loaders/plugins/index.ts` reads a plugin's `server/components` directory — the `defaultPlugin` shape it merges plugins against has no `components` key at all, only `contentTypes`. Confirmed by reading the actual loader source (not just the docs page). The runtime-CTB-creation approach here isn't a workaround for a hypothetical constraint — it's the only approach that actually works against the code that ships.

To use `sitetune.seo` on a content-type: after linking the plugin (below), open the host's admin panel → Content-Type Builder → pick the content-type → add field → Component → `sitetune.seo` (category "sitetune").

## Pillar C design notes

**Content-types are a natively supported plugin loader path — no runtime-creation workaround needed.** Unlike Pillar A's components, `@strapi/core`'s `loaders/plugins/index.js` reads a plugin's `server/src/content-types` directly (the same path `api::` content-types go through), so `plugin::sitetune.redirect` is declared as an ordinary `schema.json` (`server/src/content-types/redirect/`), registered like any other content-type.

**Validation lives in a Document Service middleware, not a controller override — this was a real course correction, not the original design.** The spec (SPEC-001 §3.4) said "reject duplicates and circular redirects at the controller level." That's wrong for this content-type: Strapi's Content Manager (the admin panel's generic CRUD UI) never calls a plugin's own controller for standard create/update — its `document-manager` service calls `strapi.documents(uid).create/update` directly (verified against `@strapi/content-manager`'s `services/document-manager.js`). A `factories.createCoreController` override would simply never run for the normal admin editing flow. The actual hook every caller goes through — Content Manager, this plugin's own content-API routes, and the CSV importer alike — is the Document Service's own middleware chain: `strapi.documents.use((ctx, next) => ...)`, registered once in `register.ts` (`server/src/services/redirect-write-guard.ts` holds the middleware itself). This also means CSV-imported rows get exactly the same validation as a Content Manager edit, with no separate call needed in the importer.

**`statusCode` is a plain `integer`, not an `enumeration` — caught by this repo's CI smoke test, not by local dev.** The first version of this schema declared `statusCode` as `enumeration` with values `"301"`/`"302"`, since that's genuinely the more natural fit (a fixed set of two choices, rendered as a dropdown in Content Manager) and matches how the field reads in the spec. It fails to boot against a real Strapi host: `@strapi/core`'s content-type validator (`domain/content-type/validator.js`) rejects any `enumeration` value that doesn't start with a letter, unconditionally — not just when the GraphQL plugin is installed, since enum values have to stay valid GraphQL names regardless (`Invalid enumeration value. Values should have at least one alphabetical character preceding the first occurence of a number.`). This repo's own build/typecheck/unit-test suite has no way to catch this — schema _shape_ was never runtime-validated against real Strapi rules until the CI workflow's `smoke` job (added on `main` while this pillar's PR was open) installed the plugin into a fresh `create-strapi` app and tried to actually boot it, which is exactly the kind of gap that job exists to catch. Fixed by switching `statusCode` to `integer` (default `301`), with the "only 301 or 302" constraint enforced instead at the application layer — `assertValidStatusCode()` in `redirect-validation.ts`, called from the write-guard middleware alongside the `from`/`to` checks. Trade-off: Content Manager now shows a plain number input instead of a dropdown for this field.

**Duplicate/cycle validation** (`server/src/services/redirect-validation.ts`): rejects `from === to`, rejects a `from` that collides with another document's `from`, and rejects a `to` that — walking the existing `from → to` graph — eventually loops back to the document's own `from`. Runs on every create/update of a redirect, including on updates that don't touch `from`/`to` at all (the middleware fetches the existing document and re-validates the merged state, since a redirect can be re-enabled or otherwise edited without resending `from`/`to`).

**Known, accepted limitation: no protection against a race between two concurrent writes.** Two simultaneous creates that individually pass validation (each checked against a database snapshot that doesn't yet include the other's in-flight write) could together form a duplicate or a cycle. The schema's `unique: true` on `from` closes the pure-duplicate race at Strapi's own entity-validator layer, but not the cycle race. Not solved here — a low-traffic admin-only write path didn't seem to warrant the complexity, but it's a real gap, not an oversight.

**The public `GET /sitetune/redirects` content-API endpoint requires a Strapi API token** (no `auth: false`) — a deliberate choice over the more "reusable-by-default" option of leaving it fully public, made explicitly with the plugin's author rather than defaulted. Each adopting site provisions its own content-API token to read the endpoint.

**`hitCount` exists in the schema but has no increment route in this pass.** The spec mentions it ("incremented if a frontend reports hits back") without listing a route in Pillar C's Definition of Done — left out deliberately rather than half-built; the field is still editable manually via Content Manager. Building a `POST .../hit`-style route later means also deciding rate-limiting/abuse handling for a public write endpoint, which wasn't worth resolving speculatively.

**CSV import** (`server/src/services/redirect-import.ts`, `server/src/utils/csv.ts`) is a dedicated admin route (`POST /sitetune/redirects/import`, gated by a custom `plugin::sitetune.redirect.import` permission action) rather than Content Manager's own import feature — no import-related code was found anywhere in this project's pinned `@strapi/content-manager` version, consistent with that being an Enterprise-only feature. The CSV parser is hand-rolled (RFC-4180-aware: quoted fields, embedded commas, `""`-escaped quotes) rather than a dependency, since `dependencies` was empty and a naive `split(',')` would mis-parse a `to`/`from` value containing a comma (e.g. an old query string). Rows are imported one at a time, awaited sequentially, so the write-guard middleware's own database-backed checks already see every earlier row in the same file — no separate in-memory duplicate tracking needed.

**The new admin UI strings (import page/form) are hardcoded English, not wired through `registerTrads`/`getTranslation`.** Deliberate scope trim — the existing i18n scaffolding stays in place for whenever it's needed, but a CSV-import form didn't seem to warrant translating every label for a plugin where no adopting host has i18n enabled yet.

**Boot-verified by CI, not yet feature-verified against a real host.** This repo's `smoke` CI job installs the built plugin into a fresh `create-strapi` app and boots it, confirming `plugin::sitetune.redirect` registers correctly and `register.ts`'s Document Service middleware/permission-action setup don't crash the server (this is what caught the `statusCode` enum bug above). It does **not** exercise CRUD, validation rejections, the content-API endpoint, or CSV import — those are still only covered by unit tests (`server/src/services/redirect-validation.test.ts`, `redirect-write-guard.test.ts`, `redirect-import.test.ts`, `server/src/utils/csv.test.ts`) with hand-rolled `strapi` mocks. This hasn't yet been linked into `strapi-sitetune` (or any other host) and exercised through the real admin UI. Do that (see [Testing against a host](#testing-against-a-host)) before relying on this pillar in production: confirm the content-type appears in Content Manager, CRUD and validation work through the real UI, `GET /sitetune/redirects` returns the expected JSON when authenticated, and a CSV round-trip (including a deliberately-bad row) produces the expected per-row report.

## Testing against a host

To try this against [`strapi-sitetune`](https://github.com/SiteTuneOrg) or any other Strapi 5 project:

```bash
yarn watch:link
```

Then, in the host project:

```bash
npx yalc add --link strapi-plugin-sitetune
```

No `config/plugins.ts` entry needed — installed this way the plugin is a real `node_modules` dependency, and Strapi auto-discovers any dependency whose `package.json` has `strapi.kind === "plugin"` (confirmed in `packages/core/strapi/src/node/core/plugins.ts`'s `getEnabledPlugins`).

Run `yarn develop` in the host. On first boot the plugin creates its components and reloads; the components then exist as of the next boot. Commit the generated `src/components/sitetune/*.json` files in the host repo once you've confirmed they look right.

**Verified against a real host**: component creation (including the batched two-component creation and the `strapi.reload()` trigger) has been confirmed working against `strapi-sitetune`. The bug described above (relation corruption via `editContentType`) was also confirmed there before this scope cut removed that code path entirely.

## Target stack

Strapi 5.x, Node.js. Built and first deployed against the [SiteTune](https://github.com/SiteTuneOrg) `strapi-sitetune` project, designed to be reusable on any Strapi site.

## License

MIT
