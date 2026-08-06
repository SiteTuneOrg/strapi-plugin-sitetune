import type { Core } from "@strapi/strapi";

/**
 * Pilar A boots in two phases (see README): first boot creates the
 * sitetune.seo/open-graph components and the sitetuneSeo field via the
 * Content-Type Builder, which triggers a Strapi restart in development
 * (file-watcher driven) to load the new schema. The backfill migration only
 * runs once the schema is confirmed present, i.e. on the boot after that.
 *
 * The Content-Type Builder's auto-restart relies on the dev file watcher —
 * it does not happen in a production boot (no watcher there). Run this
 * against a development host first so the generated schema files land in
 * the host repo and get committed; don't rely on this running unattended
 * against production on every deploy.
 */
const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  const schemaSetup = strapi.plugin("sitetune").service("schema-setup");
  const { schemaChanged } = await schemaSetup.run();

  if (schemaChanged) {
    strapi.log.info(
      "[sitetune] SEO/Open Graph schema created or updated on the host — restart to load it. The SEO backfill migration runs on the next boot."
    );
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
