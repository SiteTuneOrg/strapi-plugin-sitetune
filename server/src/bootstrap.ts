import type { Core } from "@strapi/strapi";

/**
 * Ensures the sitetune.seo / sitetune.open-graph / sitetune-blocks.*
 * components exist on the host (see schema-setup.ts). Does not touch any
 * existing content-type — attaching any of these to article/global/a page's
 * dynamic zone/etc. is a manual step via the admin panel, left to whoever
 * adopts the plugin.
 *
 * Only the Content-Type Builder's admin HTTP controller calls
 * `strapi.reload()` after a write — the service itself doesn't, and
 * `strapi.components` only refreshes on that reload (confirmed against a
 * real boot). Triggering it here mirrors that controller's own pattern
 * (`setImmediate(() => strapi.reload())`) so the new components show up in
 * the current dev session's admin panel without a manual restart.
 *
 * `strapi.reload()` sends an IPC message to the `strapi develop` parent
 * process (`@strapi/core`'s `services/reloader.js`) — it only works in
 * development, with `autoReload` on. There's no equivalent in a production
 * boot (no watcher/parent process to catch the signal).
 */
const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  const { schemaChanged } = await strapi
    .plugin("sitetune")
    .service("schema-setup")
    .run();

  if (schemaChanged) {
    strapi.log.info(
      "[sitetune] components created on the host — reloading to load them."
    );
    setImmediate(() => strapi.reload());
  }
};

export default bootstrap;
