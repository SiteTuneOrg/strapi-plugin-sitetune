import type { Core } from "@strapi/strapi";

/**
 * Pilar A's schema is created incrementally across one or more boots (see
 * README's "Pillar A design notes"). Each boot makes at most one
 * schema-changing Content-Type Builder call, then explicitly triggers
 * `strapi.reload()` — mirroring what the CTB's own admin HTTP controller
 * does after a write (see `content-type-builder`'s
 * `controllers/{components,content-types}.js`).
 *
 * This is required, not optional: `strapi.components` /
 * `strapi.contentTypes` only refresh on that reload, not automatically
 * within the same process. A second schema-changing call in the same boot,
 * referencing something the first call just created, throws
 * `ApplicationError: component.notFound` against the still-stale live
 * registry — confirmed against a real boot. The backfill migration only
 * runs once `schema-setup.isReady()` is true, i.e. no schema change was
 * needed this boot.
 *
 * `strapi.reload()` sends an IPC message to the `strapi develop` parent
 * process (see `@strapi/core`'s `services/reloader.js`) — it only works in
 * development, with `autoReload` on. There's no equivalent in a production
 * boot (no watcher/parent process to catch the signal), so don't rely on
 * this running unattended against production; run it against a development
 * host first so the generated schema files land in the host repo and get
 * committed.
 */
const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  const schemaSetup = strapi.plugin("sitetune").service("schema-setup");
  const { needsReload } = await schemaSetup.run();

  if (needsReload) {
    strapi.log.info(
      "[sitetune] SEO/Open Graph schema changed on the host — reloading to load it before the SEO backfill migration runs."
    );
    setImmediate(() => strapi.reload());
    return;
  }

  if (!schemaSetup.isReady()) {
    strapi.log.warn(
      "[sitetune] SEO/Open Graph schema isn't fully set up yet; skipping the SEO backfill migration this boot."
    );
    return;
  }

  await strapi.plugin("sitetune").service("seo-migration").run();
};

export default bootstrap;
