import { describe, expect, it, vi } from "vitest";

import seoMigration, { buildSitetuneSeoData, migrateEntry } from "./seo-migration";
import { SEO_FIELD_NAME } from "../constants";

const ARTICLE_UID = "api::article.article";
const GLOBAL_UID = "api::global.global";

describe("buildSitetuneSeoData", () => {
  it("maps legacy seo fields into the sitetune.seo + nested openGraph shape", () => {
    const result = buildSitetuneSeoData({
      metaTitle: "Title",
      metaDescription: "Description",
      metaImage: { id: 42 },
      noindex: true,
      nofollow: false,
      canonicalURL: "https://example.com",
      keywords: "a, b",
      structuredData: { "@type": "Article" },
    });

    expect(result).toEqual({
      metaTitle: "Title",
      metaDescription: "Description",
      metaImage: 42,
      noindex: true,
      nofollow: false,
      canonicalURL: "https://example.com",
      keywords: "a, b",
      structuredData: { "@type": "Article" },
      openGraph: {
        ogTitle: "Title",
        ogDescription: "Description",
        ogImage: 42,
        ogType: "website",
      },
    });
  });

  it("passes a plain numeric media id through unchanged", () => {
    expect(buildSitetuneSeoData({ metaImage: 7 }).metaImage).toBe(7);
  });

  it("leaves a missing media field as undefined/null", () => {
    expect(buildSitetuneSeoData({ metaImage: null }).metaImage).toBeNull();
    expect(buildSitetuneSeoData({}).metaImage).toBeUndefined();
  });
});

function buildDocumentsMock({
  publishedEntry,
}: { publishedEntry?: Record<string, unknown> | null } = {}) {
  const update = vi.fn().mockResolvedValue(undefined);
  const findOne = vi.fn().mockResolvedValue(publishedEntry ?? null);
  return { update, findOne };
}

describe("migrateEntry", () => {
  it("skips an entry with no legacy seo, making no calls", async () => {
    const documents = buildDocumentsMock();
    const strapi = {
      documents: vi.fn(() => documents),
      db: { query: vi.fn() },
    };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: null },
    });

    expect(result).toEqual({ migrated: false, publishedAlsoMigrated: false, reason: "no-legacy-seo" });
    expect(documents.update).not.toHaveBeenCalled();
  });

  it("skips an entry that already has sitetuneSeo populated", async () => {
    const documents = buildDocumentsMock();
    const strapi = { documents: vi.fn(() => documents), db: { query: vi.fn() } };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: { metaTitle: "x" }, [SEO_FIELD_NAME]: { metaTitle: "already set" } },
    });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe("already-populated");
    expect(documents.update).not.toHaveBeenCalled();
  });

  it("updates only the draft when the content-type has no draftAndPublish (e.g. global)", async () => {
    const documents = buildDocumentsMock();
    const dbQuery = { update: vi.fn() };
    const strapi = { documents: vi.fn(() => documents), db: { query: vi.fn(() => dbQuery) } };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: GLOBAL_UID,
      legacySeoField: "defaultSeo",
      hasDraftAndPublish: false,
      entry: { documentId: "doc-1", defaultSeo: { metaTitle: "x" } },
    });

    expect(result).toEqual({ migrated: true, publishedAlsoMigrated: false });
    expect(documents.update).toHaveBeenCalledTimes(1);
    expect(documents.findOne).not.toHaveBeenCalled();
    expect(dbQuery.update).not.toHaveBeenCalled();
  });

  it("patches the published row directly via the query engine when a published version exists without sitetuneSeo", async () => {
    const documents = buildDocumentsMock({ publishedEntry: { documentId: "doc-1" } });
    const dbQuery = { update: vi.fn().mockResolvedValue(undefined) };
    const strapi = { documents: vi.fn(() => documents), db: { query: vi.fn(() => dbQuery) } };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: { metaTitle: "x" } },
    });

    expect(result).toEqual({ migrated: true, publishedAlsoMigrated: true });
    expect(documents.update).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1", data: expect.any(Object) })
    );
    expect(documents.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: "doc-1", status: "published" })
    );
    expect(dbQuery.update).toHaveBeenCalledWith({
      where: { documentId: "doc-1", publishedAt: { $notNull: true } },
      data: expect.any(Object),
    });
    // Must never republish the current draft to update the published copy.
    expect(documents.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "published" })
    );
  });

  it("does not touch the published row again if it already has sitetuneSeo", async () => {
    const documents = buildDocumentsMock({
      publishedEntry: { documentId: "doc-1", [SEO_FIELD_NAME]: { metaTitle: "already there" } },
    });
    const dbQuery = { update: vi.fn() };
    const strapi = { documents: vi.fn(() => documents), db: { query: vi.fn(() => dbQuery) } };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: { metaTitle: "x" } },
    });

    expect(result).toEqual({ migrated: true, publishedAlsoMigrated: false });
    expect(dbQuery.update).not.toHaveBeenCalled();
  });

  it("skips the published patch when no published version exists yet", async () => {
    const documents = buildDocumentsMock({ publishedEntry: null });
    const dbQuery = { update: vi.fn() };
    const strapi = { documents: vi.fn(() => documents), db: { query: vi.fn(() => dbQuery) } };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: { metaTitle: "x" } },
    });

    expect(result).toEqual({ migrated: true, publishedAlsoMigrated: false });
    expect(dbQuery.update).not.toHaveBeenCalled();
  });

  it("still patches the published row when the draft was already backfilled by a previous, interrupted run", async () => {
    const documents = buildDocumentsMock({ publishedEntry: { documentId: "doc-1" } });
    const dbQuery = { update: vi.fn().mockResolvedValue(undefined) };
    const strapi = { documents: vi.fn(() => documents), db: { query: vi.fn(() => dbQuery) } };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: { metaTitle: "x" }, [SEO_FIELD_NAME]: { metaTitle: "already backfilled" } },
    });

    expect(result).toEqual({ migrated: true, publishedAlsoMigrated: true });
    // Draft is already populated — must not be rewritten.
    expect(documents.update).not.toHaveBeenCalled();
    expect(dbQuery.update).toHaveBeenCalledTimes(1);
  });

  it("returns an 'error' result instead of throwing when the draft write fails, and skips the published patch", async () => {
    const documents = buildDocumentsMock({ publishedEntry: { documentId: "doc-1" } });
    documents.update.mockRejectedValueOnce(new Error("validation failed"));
    const dbQuery = { update: vi.fn() };
    const strapi = {
      documents: vi.fn(() => documents),
      db: { query: vi.fn(() => dbQuery) },
      log: { error: vi.fn() },
    };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: { metaTitle: "x" } },
    });

    expect(result).toEqual({ migrated: false, publishedAlsoMigrated: false, reason: "error" });
    expect(documents.findOne).not.toHaveBeenCalled();
    expect(dbQuery.update).not.toHaveBeenCalled();
    expect(strapi.log.error).toHaveBeenCalled();
  });

  it("logs and continues (does not throw) when the published patch itself fails", async () => {
    const documents = buildDocumentsMock({ publishedEntry: { documentId: "doc-1" } });
    const dbQuery = { update: vi.fn().mockRejectedValueOnce(new Error("db error")) };
    const strapi = {
      documents: vi.fn(() => documents),
      db: { query: vi.fn(() => dbQuery) },
      log: { error: vi.fn() },
    };

    const result = await migrateEntry({
      strapi: strapi as any,
      uid: ARTICLE_UID,
      legacySeoField: "seo",
      hasDraftAndPublish: true,
      entry: { documentId: "doc-1", seo: { metaTitle: "x" } },
    });

    expect(result).toEqual({ migrated: true, publishedAlsoMigrated: false });
    expect(strapi.log.error).toHaveBeenCalled();
  });
});

describe("seoMigration.run", () => {
  it("paginates collectionType entries, uses findFirst for singleType, and aggregates a summary", async () => {
    const articlePage1 = Array.from({ length: 100 }, (_, i) => ({
      documentId: `art-${i}`,
      seo: { metaTitle: `T${i}` },
    }));
    const articlePage2 = [{ documentId: "art-100", seo: null }];

    const articleFindMany = vi
      .fn()
      .mockResolvedValueOnce(articlePage1)
      .mockResolvedValueOnce(articlePage2);
    const articleUpdate = vi.fn().mockResolvedValue(undefined);
    const articleFindOne = vi.fn().mockResolvedValue(null);

    const globalFindFirst = vi
      .fn()
      .mockResolvedValue({ documentId: "global-1", defaultSeo: { metaTitle: "G" } });
    const globalUpdate = vi.fn().mockResolvedValue(undefined);

    const strapi = {
      contentTypes: {
        [ARTICLE_UID]: { kind: "collectionType", options: { draftAndPublish: true } },
        [GLOBAL_UID]: { kind: "singleType", options: { draftAndPublish: false } },
      },
      documents: vi.fn((uid: string) => {
        if (uid === ARTICLE_UID) {
          return { findMany: articleFindMany, update: articleUpdate, findOne: articleFindOne };
        }
        return { findFirst: globalFindFirst, update: globalUpdate };
      }),
      db: { query: vi.fn(() => ({ update: vi.fn() })) },
      log: { info: vi.fn(), warn: vi.fn() },
    };

    const summary = await seoMigration({ strapi: strapi as any }).run();

    expect(articleFindMany).toHaveBeenCalledTimes(2);
    // Must paginate with start/limit (raw Query Engine keys) — page/pageSize
    // are silently ignored by strapi.db.query()'s findMany and would return
    // every row unpaginated, looping forever.
    expect(articleFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ start: 0, limit: 100 })
    );
    expect(articleFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ start: 100, limit: 100 })
    );
    expect(globalFindFirst).toHaveBeenCalledTimes(1);
    expect(summary.migrated).toBe(101); // 100 articles + 1 global
    expect(summary.skippedNoLegacySeo).toBe(1); // art-100
    expect(summary.errored).toBe(0);
    expect(articleUpdate).toHaveBeenCalledTimes(100);
    expect(globalUpdate).toHaveBeenCalledTimes(1);
  });

  it("counts a failed entry as errored without aborting the rest of the batch", async () => {
    const entries = [
      { documentId: "art-0", seo: { metaTitle: "ok" } },
      { documentId: "art-1", seo: { metaTitle: "will fail" } },
      { documentId: "art-2", seo: { metaTitle: "also ok" } },
    ];
    const articleFindMany = vi.fn().mockResolvedValueOnce(entries).mockResolvedValueOnce([]);
    const articleUpdate = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const articleFindOne = vi.fn().mockResolvedValue(null);

    const strapi = {
      contentTypes: {
        [ARTICLE_UID]: { kind: "collectionType", options: { draftAndPublish: true } },
        [GLOBAL_UID]: { kind: "singleType", options: { draftAndPublish: false } },
      },
      documents: vi.fn((uid: string) => {
        if (uid === ARTICLE_UID) {
          return { findMany: articleFindMany, update: articleUpdate, findOne: articleFindOne };
        }
        return { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() };
      }),
      db: { query: vi.fn(() => ({ update: vi.fn() })) },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    const summary = await seoMigration({ strapi: strapi as any }).run();

    expect(summary.migrated).toBe(2);
    expect(summary.errored).toBe(1);
    expect(articleUpdate).toHaveBeenCalledTimes(3);
  });
});
