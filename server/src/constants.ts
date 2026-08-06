export const OPEN_GRAPH_UID = "sitetune.open-graph";
export const SEO_UID = "sitetune.seo";
export const SEO_FIELD_NAME = "sitetuneSeo";

/**
 * Host content-types Pilar A targets, and the legacy `shared.seo` field name
 * each one uses today (they differ: article.seo vs. global.defaultSeo).
 */
export const TARGET_CONTENT_TYPES = [
  { uid: "api::article.article", legacySeoField: "seo" },
  { uid: "api::global.global", legacySeoField: "defaultSeo" },
] as const;
