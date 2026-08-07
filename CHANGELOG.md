# strapi-plugin-sitetune

## 0.2.0

### Minor Changes

- [#2](https://github.com/SiteTuneOrg/strapi-plugin-sitetune/pull/2) [`027e951`](https://github.com/SiteTuneOrg/strapi-plugin-sitetune/commit/027e95199cdb0a557c9ed91dc2b2835d5ea3cbcf) Thanks [@marcosjunqueira](https://github.com/marcosjunqueira)! - Add Pillar E: reusable content-block components (`sitetune-blocks.testimonial`, `.team-member`, `.faq-item`, `.cta`), created on the host at boot the same way as `sitetune.seo`/`sitetune.open-graph`. Meant to be shared across any SiteTune site regardless of vertical (SEO tooling, real estate, tech consulting, personal training, …) — see `docs/SPEC-002-sitetune-content-blocks.md` for the full design.

- [#4](https://github.com/SiteTuneOrg/strapi-plugin-sitetune/pull/4) [`172b568`](https://github.com/SiteTuneOrg/strapi-plugin-sitetune/commit/172b568d0cc21337b24bf770b0bba62de450691a) Thanks [@marcosjunqueira](https://github.com/marcosjunqueira)! - Pillar C: Redirect Manager. Adds `plugin::sitetune.redirect`, a collection type
  for 301/302 redirects designed to be reused unmodified across any Strapi 5
  host — CRUD via the standard Content Manager UI, duplicate/circular-redirect
  validation enforced through a Document Service write guard (so it applies
  uniformly to Content Manager edits, the content-API route, and CSV import),
  a token-gated `GET /sitetune/redirects` content-API endpoint, and CSV bulk
  import with a small dedicated admin page.

## 0.1.0

### Minor Changes

- [#3](https://github.com/SiteTuneOrg/strapi-plugin-sitetune/pull/3) [`ab4b25d`](https://github.com/SiteTuneOrg/strapi-plugin-sitetune/commit/ab4b25d9b45ef59224b42be8b0752181a6fb6553) Thanks [@marcosjunqueira](https://github.com/marcosjunqueira)! - Initial release. Pillar A: automatic creation of the SiteTune SEO components
  (`sitetune-seo`, `sitetune-open-graph`) on Strapi 5 bootstrap. Pillars B/C/D
  (redirects, sitemap, OG image generation) are spec-only for now.
