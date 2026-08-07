export const OPEN_GRAPH_UID = 'sitetune.open-graph';
export const SEO_UID = 'sitetune.seo';

export const TESTIMONIAL_UID = 'sitetune-blocks.testimonial';
export const TEAM_MEMBER_UID = 'sitetune-blocks.team-member';
export const FAQ_ITEM_UID = 'sitetune-blocks.faq-item';
export const CTA_UID = 'sitetune-blocks.cta';

// Single source of truth for "every component this plugin creates" — used
// by isReady() and by tests, so a fifth component only needs adding here
// (plus its schema file and its INDEPENDENT_COMPONENTS entry).
export const ALL_UIDS = [
  OPEN_GRAPH_UID,
  SEO_UID,
  TESTIMONIAL_UID,
  TEAM_MEMBER_UID,
  FAQ_ITEM_UID,
  CTA_UID,
];
