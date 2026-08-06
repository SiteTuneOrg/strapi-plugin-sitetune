# strapi-plugin-sitetune

Self-contained Strapi plugin for SEO, social sharing, redirects, and sitemap — with a template-based per-entry OG image generator built in.

**No dependency on other Strapi plugins.** Everything it needs (SEO/social schema, sitemap, redirect management, OG image rendering) is implemented inside the plugin itself. SiteTune "tunes" a site — SEO, social sharing, sitemap, and OG images are the tuning knobs.

## Status

**Pillar A implemented, scoped down** (see [Pillar A design notes](#pillar-a-design-notes) — unverified against a live host beyond component creation, see [Testing against a host](#testing-against-a-host)). Pillars B, C, D are still spec-only. See [`docs/SPEC-001-sitetune-plugin.md`](docs/SPEC-001-sitetune-plugin.md) for the full design, including the decision log, the marketplace survey of existing SEO/sitemap/redirect plugins that led here, and open items to resolve before implementation starts.

## The four pillars

- **A. SEO + Social Sharing base** — `sitetune.seo` + nested `sitetune.open-graph` components, i18n-ready. The plugin creates these components on the host; attaching `sitetune.seo` to a content-type (article, global, or any other) is a manual step via the admin panel's Content-Type Builder — see [Pillar A design notes](#pillar-a-design-notes) for why.
- **B. OG Image Editor** — per-entry, template-based PNG generation (Satori + resvg) from inside the Strapi admin panel, writing into whatever field a site has manually attached `sitetune.seo` to. Not yet implemented.
- **C. Redirect Manager** — CRUD + CSV import for 301/302 redirects, exposed via a content-API endpoint for any frontend to enforce.
- **D. Sitemap + robots.txt** — self-generated XML sitemap with hreflang/alternate-language links, plus a matching `robots.txt`.

Pillars C and D ship "dark" until an adopting site's frontend integrates their output — see the spec for why, and why that's a deliberate scope cut rather than an oversight.

## Pillar A design notes

Strapi plugins can't register real `components` (verified against `@strapi/core`'s `loaders/components.js` — components only ever load from the host's own `src/components`). So Pillar A creates its schema **at runtime**: the plugin's `bootstrap()` checks whether `sitetune.seo` / `sitetune.open-graph` exist on the host, and if not, creates them through the Content-Type Builder's internal service, then triggers `strapi.reload()` (see `server/src/bootstrap.ts`) so they show up immediately in the current dev session.

**Deliberately does not touch any existing content-type.** An earlier version of this also added a `sitetuneSeo` field to `article`/`global` automatically, via `editContentType()`. That's what surfaced a real, serious bug: `editContentType()`'s diffing logic compares relation attributes by a field (`targetAttribute`) that the live-loaded `strapi.contentTypes[uid].attributes` shape doesn't carry (it has `inversedBy`/`mappedBy` instead) — so round-tripping the existing attributes back through an edit call makes every relation look "changed," and the diff tears down its inverse side on the _other_ content-type without re-creating it. Confirmed against a real host: adding `sitetuneSeo` to `article` silently dropped `author.articles` and `category.articles`, which only surfaced as an unrelated-looking DB error ("inversedBy attribute ... not found") on the _next_ boot — several steps removed from the actual cause. (The fix — using `content-types` service's own `formatContentType()` to get the correctly-shaped attributes — worked, but the class of risk wasn't worth carrying for an automated, unattended step touching a host's existing content-types. Attaching `sitetune.seo` to a content-type is now a manual step via the admin panel, which goes through the full, safe controller path.)

**Note on Strapi's own docs**: the official page ["How to create components for Strapi plugins"](https://docs.strapi.io/cms/plugins-development/guides/create-components-for-plugins) claims a plugin can manually ship a component at `/my-plugin/server/components/category/component-name.json` and it'll "be available in both the Content-Type Builder and Content Manager." That's not what the shipping loader does — `loaders/index.ts` runs `loadComponents(strapi)` independently of, not nested inside, `loadPlugins(strapi)`, and `loadComponents` only ever reads `strapi.dirs.dist.components` (the host's own `src/components`, compiled). Nothing in `loaders/plugins/index.ts` reads a plugin's `server/components` directory — the `defaultPlugin` shape it merges plugins against has no `components` key at all, only `contentTypes`. Confirmed by reading the actual loader source (not just the docs page). The runtime-CTB-creation approach here isn't a workaround for a hypothetical constraint — it's the only approach that actually works against the code that ships.

To use `sitetune.seo` on a content-type: after linking the plugin (below), open the host's admin panel → Content-Type Builder → pick the content-type → add field → Component → `sitetune.seo` (category "sitetune").

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
