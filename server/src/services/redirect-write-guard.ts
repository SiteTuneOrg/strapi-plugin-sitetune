import type { Core, Modules } from '@strapi/strapi';

import { REDIRECT_UID } from '../constants';

/**
 * Content Manager's admin CRUD never calls a plugin's own controller — its
 * `document-manager` service calls `strapi.documents(uid).create/update`
 * directly (verified against `@strapi/content-manager`'s
 * `services/document-manager.js`). A controller-level `create`/`update`
 * override (the pattern used for e.g. Pillar B's custom actions) would
 * therefore silently never run for the normal admin editing flow.
 *
 * The Document Service's own middleware chain (`strapi.documents.use`) is
 * the one hook point every caller goes through — Content Manager, this
 * plugin's own content-API routes, and the CSV importer alike — so
 * duplicate/cycle validation is registered here instead of in a controller.
 */
export function createRedirectWriteGuard(
  strapi: Core.Strapi
): Modules.Documents.Middleware.Middleware {
  return async (ctx, next) => {
    if (ctx.uid !== REDIRECT_UID || (ctx.action !== 'create' && ctx.action !== 'update')) {
      return next();
    }

    const params = ctx.params as { data?: { from?: string; to?: string }; documentId?: string };
    const incoming = params.data ?? {};
    const documentId = ctx.action === 'update' ? params.documentId : undefined;

    let from = incoming.from;
    let to = incoming.to;

    if (ctx.action === 'update' && (from === undefined || to === undefined)) {
      const existing = (await strapi.documents(REDIRECT_UID).findOne({
        documentId,
        fields: ['from', 'to'],
      })) as unknown as { from: string; to: string } | null;

      from = from ?? existing?.from;
      to = to ?? existing?.to;
    }

    if (from !== undefined && to !== undefined) {
      await strapi
        .plugin('sitetune')
        .service('redirect-validation')
        .validateRedirectWrite({ documentId, from, to });
    }

    return next();
  };
}
