# strapi-plugin-sitetune

Self-contained Strapi plugin for SEO, social sharing, redirects, and sitemap — with a template-based per-entry OG image generator built in.

**No dependency on other Strapi plugins.** Everything it needs (SEO/social schema, sitemap, redirect management, OG image rendering) is implemented inside the plugin itself. SiteTune "tunes" a site — SEO, social sharing, sitemap, and OG images are the tuning knobs.

## Status

Spec stage — no implementation yet. See [`docs/SPEC-001-sitetune-plugin.md`](docs/SPEC-001-sitetune-plugin.md) for the full design, including the decision log, the marketplace survey of existing SEO/sitemap/redirect plugins that led here, and open items to resolve before implementation starts.

## The four pillars

- **A. SEO + Social Sharing base** — `shared.seo` + nested `shared.open-graph` components, i18n-ready.
- **B. OG Image Editor** — per-entry, template-based PNG generation (Satori + resvg) from inside the Strapi admin panel, writing directly into `seo.openGraph.ogImage`.
- **C. Redirect Manager** — CRUD + CSV import for 301/302 redirects, exposed via a content-API endpoint for any frontend to enforce.
- **D. Sitemap + robots.txt** — self-generated XML sitemap with hreflang/alternate-language links, plus a matching `robots.txt`.

Pillars C and D ship "dark" until an adopting site's frontend integrates their output — see the spec for why, and why that's a deliberate scope cut rather than an oversight.

## Target stack

Strapi 5.x, Node.js. Built and first deployed against the [SiteTune](https://github.com/SiteTuneOrg) `strapi-sitetune` project, designed to be reusable on any Strapi site.

## License

MIT
