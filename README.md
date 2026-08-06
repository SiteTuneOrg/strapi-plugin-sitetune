# strapi-plugin-sitetune

Self-contained Strapi plugin for SEO, social sharing, redirects, and sitemap — with a template-based per-entry OG image generator built in.

**No dependency on other Strapi plugins.** Everything it needs (SEO/social schema, sitemap, redirect management, OG image rendering) is implemented inside the plugin itself. SiteTune "tunes" a site — SEO, social sharing, sitemap, and OG images are the tuning knobs.

## Status

**Pillar A implemented** (schema + migration, unverified against a live host — see [Testing against a host](#testing-against-a-host)). Pillars B, C, D are still spec-only. See [`docs/SPEC-001-sitetune-plugin.md`](docs/SPEC-001-sitetune-plugin.md) for the full design, including the decision log, the marketplace survey of existing SEO/sitemap/redirect plugins that led here, and open items to resolve before implementation starts.

## The four pillars

- **A. SEO + Social Sharing base** — `sitetune.seo` + nested `sitetune.open-graph` components, i18n-ready. Implemented as its own component namespace rather than editing the host's existing `shared.seo` in place — see [Pillar A design notes](#pillar-a-design-notes) below for why, since it deviates from the original spec text.
- **B. OG Image Editor** — per-entry, template-based PNG generation (Satori + resvg) from inside the Strapi admin panel, writing directly into `sitetuneSeo.openGraph.ogImage` (path updated to match Pillar A's actual field name — not yet implemented).
- **C. Redirect Manager** — CRUD + CSV import for 301/302 redirects, exposed via a content-API endpoint for any frontend to enforce.
- **D. Sitemap + robots.txt** — self-generated XML sitemap with hreflang/alternate-language links, plus a matching `robots.txt`.

Pillars C and D ship "dark" until an adopting site's frontend integrates their output — see the spec for why, and why that's a deliberate scope cut rather than an oversight.

## Pillar A design notes

Strapi plugins can't register real `components` (verified against `@strapi/core`'s `loaders/components.js` — components only ever load from the host's own `src/components`). So Pillar A creates its schema **at runtime**: the plugin's `bootstrap()` checks whether `sitetune.seo` / `sitetune.open-graph` and a `sitetuneSeo` field on `article`/`global` exist on the host, and if not, creates them through the Content-Type Builder's internal service. That write triggers a Strapi restart (dev file-watcher only — see the caveat in `server/src/bootstrap.ts`), and the idempotent backfill migration (`seo-migration` service) runs on the boot after that, once the schema is confirmed present.

**Note on Strapi's own docs**: the official page ["How to create components for Strapi plugins"](https://docs.strapi.io/cms/plugins-development/guides/create-components-for-plugins) claims a plugin can manually ship a component at `/my-plugin/server/components/category/component-name.json` and it'll "be available in both the Content-Type Builder and Content Manager." That's not what the shipping loader does — `loaders/index.ts` runs `loadComponents(strapi)` independently of, not nested inside, `loadPlugins(strapi)`, and `loadComponents` only ever reads `strapi.dirs.dist.components` (the host's own `src/components`, compiled). Nothing in `loaders/plugins/index.ts` reads a plugin's `server/components` directory — the `defaultPlugin` shape it merges plugins against has no `components` key at all, only `contentTypes`. Confirmed by reading the actual loader source (not just the docs page). The runtime-CTB-creation approach here isn't a workaround for a hypothetical constraint — it's the only approach that actually works against the code that ships.

The new field is named `sitetuneSeo` and is **additive** — the host's existing `article.seo` / `global.defaultSeo` (`shared.seo`) fields are left untouched; the migration only reads from them to backfill `sitetuneSeo`.

## Testing against a host

This repo has not been linked into a running Strapi host yet — that's out of scope for the session that implemented Pillar A. To try it against [`strapi-sitetune`](https://github.com/SiteTuneOrg) or any other Strapi 5 project:

```bash
yarn watch:link
```

Then, in the host project:

```bash
npx yalc add --link strapi-plugin-sitetune
```

And register it in the host's `config/plugins.ts`:

```typescript
sitetune: { enabled: true, resolve: './node_modules/strapi-plugin-sitetune' },
```

Run `yarn develop` in the host. On first boot the plugin creates its schema and the host restarts; on the next boot the SEO backfill migration runs. Commit the generated `src/components/sitetune/*.json` and updated `src/api/{article,global}/content-types/**/schema.json` files in the host repo once you've confirmed it looks right.

**Unverified against a real Strapi process** — the 20 unit tests mock the Document Service, Query Engine, and Content-Type Builder contracts; they confirm the migration logic is internally consistent, not that those APIs behave exactly as assumed. Things to watch on the first real link:

- `strapi.db.query(uid).update({ where: { documentId, publishedAt: { $notNull: true } }, data: { sitetuneSeo: {...} } })` — that the Query Engine writes nested component data through this path, and that the `where` matches exactly one row.
- The bare numeric media id passed for `metaImage`/`ogImage` — confirm the Document Service accepts that shape for a `media` attribute nested inside a component.
- Two known i18n gaps, both only relevant once a site enables i18n (nowhere does today — see SPEC §4): the migration doesn't pass `locale`, so on a localized site it only backfills the default locale; and the published-row patch has no locale filter, so on a localized site it would write the same `sitetuneSeo` data to every locale's published row instead of per-locale data. Not fixed here because there's no i18n-enabled project to validate the fix against yet.

## Target stack

Strapi 5.x, Node.js. Built and first deployed against the [SiteTune](https://github.com/SiteTuneOrg) `strapi-sitetune` project, designed to be reusable on any Strapi site.

## License

MIT
