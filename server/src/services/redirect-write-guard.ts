import type { Core, Modules } from '@strapi/strapi';

import { REDIRECT_UID } from '../constants';
import { assertValidStatusCode } from './redirect-validation';

const GUARDED_ACTIONS = new Set(['create', 'update', 'clone']);

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
 *
 * `clone` is guarded too — Content Manager's "Duplicate" button goes through
 * `documents(uid).clone()`, a separate document-service action from
 * `create`/`update` that would otherwise skip validation entirely (verified
 * against `@strapi/core`'s `services/document-service/repository.js`: clone
 * copies the source entry's fields, optionally overridden by `data`, into a
 * brand-new `documentId` — so unlike `update`, the source document must NOT
 * be excluded from the duplicate/cycle check, since the clone is a distinct
 * row that can legitimately collide with its own source).
 */
export function createRedirectWriteGuard(
  strapi: Core.Strapi
): Modules.Documents.Middleware.Middleware {
  return async (ctx, next) => {
    if (ctx.uid !== REDIRECT_UID || !GUARDED_ACTIONS.has(ctx.action)) {
      return next();
    }

    const params = ctx.params as {
      data?: { from?: string; to?: string; statusCode?: number };
      documentId?: string;
    };
    const incoming = params.data ?? {};
    // A clone's `documentId` names the *source* row being copied, not the
    // (not-yet-created) row being validated — so it's only used below to
    // fetch fallback from/to values, never passed to validateRedirectWrite
    // as the row to exclude from its own duplicate/cycle check.
    const isUpdate = ctx.action === 'update';
    const isClone = ctx.action === 'clone';
    const documentId = isUpdate ? params.documentId : undefined;

    if (incoming.statusCode !== undefined) {
      assertValidStatusCode(incoming.statusCode);
    }

    let from = incoming.from;
    let to = incoming.to;

    if ((isUpdate || isClone) && (from === undefined || to === undefined)) {
      const existing = (await strapi.documents(REDIRECT_UID).findOne({
        documentId: params.documentId,
        fields: ['from', 'to'],
      })) as unknown as { from: string; to: string } | null;

      from = from ?? existing?.from;
      to = to ?? existing?.to;
    }

    if (from !== undefined && to !== undefined) {
      const trimmedFrom = from.trim();
      const trimmedTo = to.trim();

      await strapi.plugin('sitetune').service('redirect-validation').validateRedirectWrite({
        documentId,
        from: trimmedFrom,
        to: trimmedTo,
      });

      // Persist the same normalized value that was just validated — writing
      // the raw, untrimmed input instead would let a payload like " /old "
      // pass validation against "/old" but save with the surrounding
      // whitespace, silently breaking the uniqueness/cycle guarantees the
      // validation above is supposed to provide. Only touches fields this
      // write actually supplied — the update/clone fallback values read from
      // the existing document above are already trimmed at their own
      // creation time, so leaving them out of the write here doesn't
      // reintroduce untrimmed data.
      if (incoming.from !== undefined) {
        params.data!.from = trimmedFrom;
      }
      if (incoming.to !== undefined) {
        params.data!.to = trimmedTo;
      }
    }

    return next();
  };
}
