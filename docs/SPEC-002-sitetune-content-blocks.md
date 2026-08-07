# SPEC-002: SiteTune Content Blocks — reusable components across SiteTune sites

- **Spec ID:** SPEC-002
- **Title:** Pillar E — a set of institutional-site content-block components (testimonial, team member, FAQ item, CTA) shared across every SiteTune host, regardless of vertical
- **Status:** Implemented (v1 — 4 blocks; see §6 for what's deferred)
- **Author:** Claude
- **Created Date:** 2026-08-05
- **Target Stack:** Same as [SPEC-001](./SPEC-001-sitetune-plugin.md) — Strapi 5.x, Node.js, no new dependencies.
- **Relationship to SPEC-001:** Same plugin (`strapi-plugin-sitetune`), same runtime-component-creation mechanism (`bootstrap()` → `schema-setup.ts`), same `strapi.reload()` trigger. Not folded into SPEC-001 because that spec's own title and four pillars (A–D) are specifically about SEO/social/sitemap/redirects — these four blocks are unrelated to that domain and deserve their own DoD instead of stretching SPEC-001's scope.
- **Design principle (inherited from SPEC-001):** no dependency on other Strapi plugins; deliberately does not touch any existing content-type on the host — attaching a component to a content-type or a page's dynamic zone stays a manual step via the admin panel's Content-Type Builder (see SPEC-001 revision log item 10 for why: `editContentType()` corrupted unrelated relations on a real host).

### Revision log (decisions made in conversation, chronological)

1. Started from a brainstorm of content-types reusable across SiteTune's client sites, which span very different verticals — SEO tooling (`strapi-sitetune`), real estate (`realty`), tech consulting ([`strapi-tech`](https://github.com/ConstelacaoTech/strapi-tech)), personal training ([`evolucaopersonal-backend`](https://github.com/Evolucao-Personal-Trainer/evolucaopersonal-backend)). ~16 candidate content-types were surfaced; grouped by how universal/stable their shape is across verticals (see §6, "Deferred").
2. Chose to build the 4 with the most stable shape across verticals first: **testimonial, team member, FAQ item, CTA**. The rest (service/offering, pricing plan, location/branch, partner logo, case study, event, booking/lead request, job posting) need more per-vertical shape decisions and are deferred (§6).
3. **Architecture: same plugin, new pillar — not a separate package.** Considered splitting into a dedicated `strapi-plugin-sitetune-blocks` package to keep `strapi-plugin-sitetune` scoped strictly to SEO tuning. Decided against it: a separate plugin means a new repo/`package.json`/CI and hosts installing and linking two plugins instead of one, for zero gain in this plugin's actual risk profile. Reusing the already-verified `schema-setup.ts`/`bootstrap.ts` runtime-creation pipeline (SPEC-001 §3.2, revision log items 9–10) outweighs keeping the name narrowly "SEO tuning."
4. **Components, not standalone content-types.** The four blocks are meant to eventually be dropped into a `page` content-type's dynamic zone (a "page builder," not built yet — see §6) — dynamic zones only accept Components, not Content-Types, so Components is the only shape that keeps that door open. This also keeps the same safe creation path already proven for `sitetune.seo`/`sitetune.open-graph`: components are the _only_ schema plugins can create at runtime via the Content-Type Builder's internal service (SPEC-001 revision log item 9 — plugins have no `contentTypes`-adjacent `components` export, so this isn't a choice between "component vs. content-type creation," it's the only mechanism that works at all without hand-editing a host's files).
5. **New category `sitetune-blocks`, not reusing `sitetune`.** `sitetune` stays SEO/Open-Graph only; the four new blocks group under their own category so the Content-Type Builder UI doesn't mix unrelated concerns under one heading. Purely a UI-grouping choice, not a technical constraint.
6. **No interdependency between the four blocks** (unlike `sitetune.seo` nesting `sitetune.open-graph`), so none of them need the `tmpUID`/batched-creation trick from `createDependentComponents`. Each is checked (`strapi.components[uid]`) and created independently in a loop (`ensureIndependentComponents` in `schema-setup.ts`) — simpler than SPEC-001's Pillar A path precisely because there's nothing to batch.
7. **Verified the UID-slugging assumption before hardcoding constants**, instead of assuming — this is exactly the class of unverified assumption that caused SPEC-001's `editContentType()` relation-corruption bug (revision log item 10). Read `@strapi/content-type-builder`'s `component-builder.js` (`createComponentUID = ({category, displayName}) => \`${strings.nameToSlug(category)}.${strings.nameToSlug(displayName)}\``) and `@strapi/utils`'s `nameToSlug`(thin wrapper over`@sindresorhus/slugify`), then ran the actual slugify function against every candidate `displayName` (`"FAQ Item"`→`faq-item`, `"CTA"`→`cta`, `"Team Member"`→`team-member`, `"Testimonial"`→`testimonial`, `"sitetune-blocks"`→`sitetune-blocks`, unchanged) — confirmed against the real installed package in a live Strapi 5 host (`strapi-sitetune`'s `node_modules`), not just read from source. No acronym-decamelization surprises for any of the four.
8. **Verified against a real host before finalizing this doc** (per the sequencing risk flagged during planning: the "independent sequential `createComponent()` calls are safe" assumption was plausible but untested, and if wrong would have changed the implementation to a batched call, requiring this doc to be rewritten). Linked into `strapi-sitetune` via `yarn watch:link` + `npx yalc add --link` + `yarn develop`: `bootstrap()` ran, logged `"[sitetune] components created on the host — reloading to load them."`, and all four `src/components/sitetune-blocks/*.json` files were written correctly on the host, with `src/components/sitetune/{seo,open-graph}.json` untouched. Confirms the four independent `createComponent()` calls do not collide with the same live-registry-staleness bug SPEC-001 hit for the SEO/OG pair — none of the four blocks reference each other's UID, so there was nothing for the stale registry to get wrong. **Second-boot idempotency was not verified in this same session** — the local `strapi-sitetune` dev environment hit an unrelated `ENOSPC` (inotify watcher limit) crash on rebooting Strapi, before a second boot could complete.
9. **Second-boot idempotency subsequently verified**, via a disposable `create-strapi` sqlite app (mirroring the CI `smoke` job) instead of retrying against `strapi-sitetune`, to sidestep the `ENOSPC` from item 8 — `strapi develop`'s Vite dev-server file watcher is what exhausts inotify instances; `strapi build` + `strapi start` (production mode) uses neither, so it never hits the limit. This surfaced a real, non-obvious precondition: `loadComponents` (`@strapi/core`'s `loaders/components.js`) reads only from `strapi.dirs.dist.components` (`dist/src/components`, confirmed in `@strapi/core`'s `configuration/get-dirs.js`), which `strapi build` populates by copying whatever exists in `src/components` **at build time**. A first `strapi start` that creates the components at runtime writes them to `src/components` (the source dir), not `dist/src/components` — so a second `strapi start` _without an intervening `strapi build`_ still finds `strapi.components` empty and silently re-runs `createComponent()`, overwriting the same JSON files again (confirmed via file mtimes, not a crash, just genuinely non-idempotent). Re-running `strapi build` (which now copies the just-created `src/components/*` into `dist/src/components`) and then a third `strapi start` showed **no** `"[sitetune] components created..."` log line — true idempotency confirmed once dist reflects what's on disk. This is exactly why this repo's own README instructs committing the generated component JSON files after confirming them: a real deploy's next `build` step is what makes the following boot idempotent, mirroring the dev-mode `strapi.reload()` trigger's role within a single session. `bootstrap()`/`schema-setup.ts` need no code change for this — it's a property of how Strapi loads schema in production, not a bug in this plugin's logic.
10. **Corrected `authorPhoto`/`photo` from i18n-localized to not localized** (originally both were localized, mechanically copied from the `metaImage`/`ogImage` convention in `sitetune.seo`/`sitetune.open-graph` without reconsidering per field). Flagged in review: a testimonial author's or team member's photo is tied to the _person_, not the locale — unlike an OG/meta image, which plausibly differs per language. Localizing it would mean an editor has to re-attach the identical file once per locale for no benefit, and — because this plugin's hard rule is never to auto-edit an existing component's schema once created (see SPEC-001 revision log item 10) — flipping a field's `pluginOptions.i18n.localized` after a site has adopted it would need to be a manual admin-panel edit per host, not something `schema-setup.ts` could safely automate later. Fixed now, before any host has this in `main` or has committed the generated files, which is the cheapest point this could ever be corrected. `backgroundImage` (CTA) stays localized — a CTA's background can carry locale-specific art or embedded copy, unlike a person's photo.

---

## 1. Executive Summary & Context

SiteTune's existing four pillars (SPEC-001) are specifically about SEO/social/sitemap/redirects. Separately, a brainstorm of content-types reusable across SiteTune's client sites — which span unrelated business verticals (SEO tooling, real estate, tech consulting, personal training) — surfaced a set of content blocks that recur across almost any institutional site regardless of vertical: testimonials, team bios, FAQs, calls-to-action, service listings, pricing plans, locations, partner logos, case studies, events, lead/booking requests, job postings.

This spec (Pillar E of the same plugin) covers the four with the most stable shape across verticals — the ones where a generic schema doesn't have to guess at vertical-specific fields. The rest are deliberately deferred (§6) until enough sites have adopted these four to validate the pattern, and until the shape questions for the remaining ones (which vary more per vertical) are worth resolving.

## 2. Components

Category: `sitetune-blocks` (kept separate from `sitetune`, which stays SEO/Open-Graph only). No field is `required`, matching Pillar A's convention (an editor should be able to save a partially-filled block without being blocked).

### `sitetune-blocks.testimonial`

| Field         | Type                                                                 | i18n |
| ------------- | -------------------------------------------------------------------- | ---- |
| `authorName`  | string                                                               | —    |
| `authorRole`  | string                                                               | ✓    |
| `authorPhoto` | media (single, images)                                               | —    |
| `quote`       | text                                                                 | ✓    |
| `rating`      | integer                                                              | —    |
| `source`      | enumeration (`manual`/`google`/`facebook`/`other`, default `manual`) | —    |
| `sourceUrl`   | string                                                               | —    |

### `sitetune-blocks.team-member`

| Field                                         | Type                   | i18n |
| --------------------------------------------- | ---------------------- | ---- |
| `name`                                        | string                 | —    |
| `role`                                        | string                 | ✓    |
| `photo`                                       | media (single, images) | —    |
| `bio`                                         | text                   | ✓    |
| `email`                                       | string                 | —    |
| `linkedinUrl` / `twitterUrl` / `instagramUrl` | string                 | —    |

### `sitetune-blocks.faq-item`

| Field      | Type     | i18n |
| ---------- | -------- | ---- |
| `question` | string   | ✓    |
| `answer`   | richtext | ✓    |
| `category` | string   | —    |

### `sitetune-blocks.cta`

| Field             | Type                   | i18n |
| ----------------- | ---------------------- | ---- |
| `title`           | string                 | ✓    |
| `description`     | text                   | ✓    |
| `buttonLabel`     | string                 | ✓    |
| `buttonUrl`       | string                 | ✓    |
| `backgroundImage` | media (single, images) | ✓    |

`buttonUrl` is i18n-localized on the assumption a CTA's target page can differ per locale (e.g. `/pt/contato` vs. `/en/contact`) — same treatment as `canonicalURL` in `sitetune.seo`.

`authorPhoto`/`photo` are deliberately **not** i18n-localized (see revision log item 10) — unlike `backgroundImage`, which stays localized because a CTA's background can legitimately carry locale-specific art or embedded copy.

## 3. Implementation

Extends `schema-setup.ts` rather than adding a parallel service — it was already "ensure this schema exists on the host," and the four new components are more of that, not a different concern.

- `server/src/schemas/sitetune-blocks-{testimonial,team-member,faq-item,cta}.json` — same `{ category, displayName, icon, attributes }` shape as `sitetune-seo.json`.
- `server/src/constants.ts` — `TESTIMONIAL_UID`, `TEAM_MEMBER_UID`, `FAQ_ITEM_UID`, `CTA_UID`.
- `server/src/services/schema-setup.ts` — `ensureIndependentComponents()`: loops the four `{ uid, schema }` pairs, checks `strapi.components[uid]`, calls the already-generic `createComponent()` for whichever are missing. No `tmpUID` batching (unlike `createDependentComponents` for SEO/OG) since none of the four reference each other. `run()` combines this with the existing SEO/OG path (`schemaChanged = seoChanged || blocksChanged`); `isReady()` now requires all six UIDs.
- `server/src/bootstrap.ts` — log message generalized from "SEO/Open Graph components created" to "components created," reload trigger unchanged.

## 4. Testing

`server/src/services/schema-setup.test.ts` extended with: idempotency across all six components, the independent-creation-with-no-batching case (asserts `payload.components` is `undefined` for each of the four, unlike the SEO/OG batched call), a non-required-fields check for representative fields (`testimonial.quote`, `cta.title`), and `isReady()` now requiring all six UIDs (including a partial-state case: SEO/OG present but blocks missing → still not ready).

## 5. Definition of Done (DoD)

- [x] All four components created via `bootstrap()`, category `sitetune-blocks`, verified against a real host (`strapi-sitetune`) — components written correctly to `src/components/sitetune-blocks/*.json`, existing `sitetune/*.json` untouched.
- [x] i18n field options set per §2's table.
- [x] No independent-creation regression on the SEO/OG dependent-pair path (existing Pillar A tests still pass, `yarn build` passes).
- [x] Unit tests cover idempotency, independent (non-batched) creation, and non-required fields.
- [x] Second-boot idempotency — verified via a disposable production-mode (`strapi build` + `strapi start`) sqlite app rather than `strapi-sitetune`'s dev mode, to avoid the `ENOSPC` from item 8. Confirmed no `"[sitetune] components created..."` log and no file rewrites on a boot that follows a `build` reflecting the already-created components (see revision log item 9 for the real precondition this surfaced: production requires a `strapi build` between the boot that creates the components and the boot that should treat them as already present, since `loadComponents` only reads from the built `dist/src/components`, not live `src/components`).
- [ ] Any site actually attaching one of these components to a content-type or dynamic zone — out of scope here, same "ships as available, not as adopted" posture as SPEC-001's Pillars C/D.

## 6. Deferred to future review

Surfaced in the original brainstorm, not designed or built yet:

- **`service`/offering, `pricing-plan`, `location`/branch, `partner-logo`** — still fairly universal across verticals, but the exact field set needs more thought per vertical (e.g. a real-estate "service" and a personal-trainer "service" don't share much beyond title/description/CTA).
- **`case-study`/portfolio item, `event`/agenda, `booking`/lead request, `job-posting`** — shape varies more between verticals (a tech case study's "results" metrics look nothing like a personal-trainer transformation's); needs a per-field genericity/extensibility decision (e.g. a free-form `metadata` JSON field for vertical-specific extras) before schema-setup-style automation makes sense.
- **The actual payoff: a `page` content-type with a dynamic zone** combining these blocks (and the ones above once built) — not worth building until enough of the block library exists to make a page builder meaningfully useful. This is the reason Components (not standalone Content-Types) was chosen for all of the above (see revision log item 4).
