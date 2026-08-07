---
'strapi-plugin-sitetune': minor
---

Pillar C: Redirect Manager. Adds `plugin::sitetune.redirect`, a collection type
for 301/302 redirects designed to be reused unmodified across any Strapi 5
host — CRUD via the standard Content Manager UI, duplicate/circular-redirect
validation enforced through a Document Service write guard (so it applies
uniformly to Content Manager edits, the content-API route, and CSV import),
a token-gated `GET /sitetune/redirects` content-API endpoint, and CSV bulk
import with a small dedicated admin page.
