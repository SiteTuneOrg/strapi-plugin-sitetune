import type { Core, UID } from "@strapi/strapi";

import { SEO_FIELD_NAME, TARGET_CONTENT_TYPES } from "../constants";

interface LegacyMedia {
  id: number;
}

interface LegacySeo {
  metaTitle?: string;
  metaDescription?: string;
  metaImage?: LegacyMedia | number | null;
  noindex?: boolean;
  nofollow?: boolean;
  canonicalURL?: string;
  keywords?: string;
  structuredData?: unknown;
}

interface SitetuneSeoData {
  metaTitle?: string;
  metaDescription?: string;
  metaImage?: number | null;
  noindex?: boolean;
  nofollow?: boolean;
  canonicalURL?: string;
  keywords?: string;
  structuredData?: unknown;
  openGraph: {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: number | null;
    ogType: string;
  };
}

const mediaToId = (
  media: LegacyMedia | number | null | undefined
): number | null | undefined => {
  if (media === null || media === undefined) return media as null | undefined;
  return typeof media === "number" ? media : media.id;
};

/**
 * Pure mapping, no side effects — kept separate from I/O so it's trivial to
 * unit test without a Strapi instance.
 */
export function buildSitetuneSeoData(legacySeo: LegacySeo): SitetuneSeoData {
  return {
    metaTitle: legacySeo.metaTitle,
    metaDescription: legacySeo.metaDescription,
    metaImage: mediaToId(legacySeo.metaImage),
    noindex: legacySeo.noindex,
    nofollow: legacySeo.nofollow,
    canonicalURL: legacySeo.canonicalURL,
    keywords: legacySeo.keywords,
    structuredData: legacySeo.structuredData,
    openGraph: {
      ogTitle: legacySeo.metaTitle,
      ogDescription: legacySeo.metaDescription,
      ogImage: mediaToId(legacySeo.metaImage),
      ogType: "website",
    },
  };
}

interface EntryLike {
  documentId: string;
  locale?: string | null;
  [key: string]: unknown;
}

interface MigrateEntryResult {
  migrated: boolean;
  publishedAlsoMigrated: boolean;
  reason?: "no-legacy-seo" | "already-populated" | "error";
}

/**
 * Migrates one entry, check-then-write so re-running is a no-op once done.
 *
 * Writes the draft through the Document Service (the normal path). The
 * published version, when one exists, is patched directly through the Query
 * Engine (`strapi.db.query`) instead of `documents().update({status:
 * 'published'})` — the latter would republish whatever is currently in
 * draft, which could include unrelated in-progress edits an editor hasn't
 * published yet. Patching the published row's `sitetuneSeo` field directly
 * avoids that side effect while still making the backfill visible to a
 * frontend reading the published version.
 *
 * The draft-populated and published-populated checks are independent: an
 * entry whose draft was already backfilled (e.g. a previous run died right
 * after the draft write) still gets its published row checked/patched here,
 * rather than being skipped outright.
 *
 * Wrapped in try/catch per write so one bad row (e.g. legacy data that fails
 * validation) can't abort the whole migration loop from bootstrap().
 */
export async function migrateEntry({
  strapi,
  uid,
  legacySeoField,
  hasDraftAndPublish,
  entry,
}: {
  strapi: Core.Strapi;
  uid: UID.ContentType;
  legacySeoField: string;
  hasDraftAndPublish: boolean;
  entry: EntryLike;
}): Promise<MigrateEntryResult> {
  const legacySeo = entry[legacySeoField] as LegacySeo | null | undefined;

  if (!legacySeo) {
    return { migrated: false, publishedAlsoMigrated: false, reason: "no-legacy-seo" };
  }

  const sitetuneSeoData = buildSitetuneSeoData(legacySeo);
  const draftAlreadyPopulated = Boolean(entry[SEO_FIELD_NAME]);

  if (!draftAlreadyPopulated) {
    try {
      await strapi.documents(uid).update({
        documentId: entry.documentId,
        locale: entry.locale ?? undefined,
        data: { [SEO_FIELD_NAME]: sitetuneSeoData },
      });
    } catch (error) {
      strapi.log.error(
        `[sitetune] failed to backfill sitetuneSeo draft for ${uid} ${entry.documentId}: ${(error as Error).message}`
      );
      return { migrated: false, publishedAlsoMigrated: false, reason: "error" };
    }
  }

  let publishedAlsoMigrated = false;

  if (hasDraftAndPublish) {
    try {
      const published = await strapi.documents(uid).findOne({
        documentId: entry.documentId,
        locale: entry.locale ?? undefined,
        status: "published",
      });

      if (published && !(published as EntryLike)[SEO_FIELD_NAME]) {
        await strapi.db.query(uid).update({
          where: { documentId: entry.documentId, publishedAt: { $notNull: true } },
          data: { [SEO_FIELD_NAME]: sitetuneSeoData },
        });
        publishedAlsoMigrated = true;
      }
    } catch (error) {
      strapi.log.error(
        `[sitetune] failed to backfill sitetuneSeo published row for ${uid} ${entry.documentId}: ${(error as Error).message}`
      );
    }
  }

  if (draftAlreadyPopulated && !publishedAlsoMigrated) {
    return { migrated: false, publishedAlsoMigrated: false, reason: "already-populated" };
  }

  return { migrated: true, publishedAlsoMigrated };
}

async function collectDraftEntries(
  strapi: Core.Strapi,
  uid: UID.ContentType,
  legacySeoField: string
): Promise<EntryLike[]> {
  const kind = strapi.contentTypes[uid]?.kind;
  const populate = { [legacySeoField]: { populate: ["metaImage"] }, [SEO_FIELD_NAME]: true };

  if (kind === "singleType") {
    const entry = await strapi.documents(uid).findFirst({ populate });
    return entry ? [entry as EntryLike] : [];
  }

  // `start`/`limit` are the raw Query Engine pagination keys — the
  // Document Service's `page`/`pageSize` never reach the underlying
  // query-builder (it only reads `limit`/`offset`), so using page/pageSize
  // here would silently return every row unpaginated and this loop would
  // never terminate.
  const entries: EntryLike[] = [];
  const limit = 100;
  let start = 0;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const results = await strapi.documents(uid).findMany({
      status: "draft",
      populate,
      // Deterministic order so offset pagination can't skip/repeat rows
      // across pages if entries are created/updated mid-migration.
      sort: "id",
      start,
      limit,
    });
    entries.push(...(results as EntryLike[]));
    if (results.length < limit) break;
    start += limit;
  }

  return entries;
}

const seoMigration = ({ strapi }: { strapi: Core.Strapi }) => ({
  async run(): Promise<{
    migrated: number;
    publishedAlsoMigrated: number;
    skippedNoLegacySeo: number;
    skippedAlreadyPopulated: number;
    errored: number;
  }> {
    const summary = {
      migrated: 0,
      publishedAlsoMigrated: 0,
      skippedNoLegacySeo: 0,
      skippedAlreadyPopulated: 0,
      errored: 0,
    };

    for (const { uid, legacySeoField } of TARGET_CONTENT_TYPES) {
      const hasDraftAndPublish = Boolean(
        strapi.contentTypes[uid]?.options?.draftAndPublish
      );

      // eslint-disable-next-line no-await-in-loop
      const entries = await collectDraftEntries(strapi, uid, legacySeoField);

      for (const entry of entries) {
        // eslint-disable-next-line no-await-in-loop
        const result = await migrateEntry({
          strapi,
          uid,
          legacySeoField,
          hasDraftAndPublish,
          entry,
        });

        if (result.migrated) {
          summary.migrated += 1;
          if (result.publishedAlsoMigrated) summary.publishedAlsoMigrated += 1;
        } else if (result.reason === "no-legacy-seo") {
          summary.skippedNoLegacySeo += 1;
        } else if (result.reason === "already-populated") {
          summary.skippedAlreadyPopulated += 1;
        } else if (result.reason === "error") {
          summary.errored += 1;
        }
      }
    }

    strapi.log.info(
      `[sitetune] SEO migration: ${summary.migrated} migrated (${summary.publishedAlsoMigrated} also patched published), ${summary.skippedAlreadyPopulated} already populated, ${summary.skippedNoLegacySeo} had no legacy seo, ${summary.errored} errored.`
    );

    return summary;
  },
});

export default seoMigration;
