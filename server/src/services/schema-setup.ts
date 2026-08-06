import type { Core } from "@strapi/strapi";

import openGraphSchema from "../schemas/sitetune-open-graph.json";
import seoSchema from "../schemas/sitetune-seo.json";
import testimonialSchema from "../schemas/sitetune-blocks-testimonial.json";
import teamMemberSchema from "../schemas/sitetune-blocks-team-member.json";
import faqItemSchema from "../schemas/sitetune-blocks-faq-item.json";
import ctaSchema from "../schemas/sitetune-blocks-cta.json";
import {
  OPEN_GRAPH_UID,
  SEO_UID,
  TESTIMONIAL_UID,
  TEAM_MEMBER_UID,
  FAQ_ITEM_UID,
  CTA_UID,
} from "../constants";

interface ComponentSchemaSource {
  category: string;
  displayName: string;
  icon: string;
  attributes: Record<string, unknown>;
}

const getContentTypeBuilder = (strapi: Core.Strapi) =>
  strapi.plugin("content-type-builder");

const toComponentInput = (schema: ComponentSchemaSource) => ({
  category: schema.category,
  icon: schema.icon,
  displayName: schema.displayName,
  attributes: schema.attributes,
});

async function createComponent(
  strapi: Core.Strapi,
  schema: ComponentSchemaSource
): Promise<void> {
  await getContentTypeBuilder(strapi)
    .service("components")
    .createComponent({ component: toComponentInput(schema) });
}

/**
 * Creates sitetune.open-graph and sitetune.seo together.
 *
 * The Content-Type Builder's `strapi.components` registry only refreshes on
 * a full reload — it isn't updated by a `createComponent()` call within the
 * same boot. Creating open-graph and seo as two separate sequential calls
 * (seo referencing open-graph by its final UID) fails with
 * `component.notFound` on the second call, because the schema-builder used
 * internally re-seeds itself from the still-stale `strapi.components` on
 * every call and has no way to see what the first call just wrote to disk.
 *
 * The Content-Type Builder API supports exactly this "create two
 * interdependent components in one shot" case via a temporary UID: the
 * dependency (open-graph) is passed in `components` with a `tmpUID`, and the
 * primary component's (seo) attribute references that `tmpUID` instead of
 * the real one. Both get resolved and written together by the same
 * schema-builder instance, so no live-registry lookup is needed.
 */
async function createDependentComponents(
  strapi: Core.Strapi,
  openGraphSchema: ComponentSchemaSource,
  seoSchema: ComponentSchemaSource
): Promise<void> {
  const OPEN_GRAPH_TMP_UID = "__tmp_sitetune_open_graph__";

  await getContentTypeBuilder(strapi)
    .service("components")
    .createComponent({
      component: {
        ...toComponentInput(seoSchema),
        attributes: {
          ...seoSchema.attributes,
          openGraph: {
            type: "component",
            component: OPEN_GRAPH_TMP_UID,
            repeatable: false,
            pluginOptions: { i18n: { localized: true } },
          },
        },
      },
      components: [
        { tmpUID: OPEN_GRAPH_TMP_UID, ...toComponentInput(openGraphSchema) },
      ],
    });
}

async function ensureComponents(
  strapi: Core.Strapi,
  openGraphSchema: ComponentSchemaSource,
  seoSchema: ComponentSchemaSource
): Promise<boolean> {
  const openGraphExists = Boolean(strapi.components[OPEN_GRAPH_UID]);
  const seoExists = Boolean(strapi.components[SEO_UID]);

  if (openGraphExists && seoExists) {
    return false;
  }

  if (!openGraphExists && !seoExists) {
    await createDependentComponents(strapi, openGraphSchema, seoSchema);
    return true;
  }

  // Partial state (e.g. a previous run created one and then crashed before
  // the other) — recover by creating just the missing one now that the
  // other is confirmed present in the live registry.
  if (!openGraphExists) {
    await createComponent(strapi, openGraphSchema);
  }
  if (!seoExists) {
    await createComponent(strapi, seoSchema);
  }

  return true;
}

/**
 * Pillar E's content blocks — unlike sitetune.seo/open-graph, none of these
 * nest inside one another, so each can be checked/created independently:
 * no tmpUID batching needed, since no attribute here ever references
 * another component's not-yet-live UID.
 */
const INDEPENDENT_COMPONENTS: Array<{ uid: string; schema: ComponentSchemaSource }> = [
  { uid: TESTIMONIAL_UID, schema: testimonialSchema as ComponentSchemaSource },
  { uid: TEAM_MEMBER_UID, schema: teamMemberSchema as ComponentSchemaSource },
  { uid: FAQ_ITEM_UID, schema: faqItemSchema as ComponentSchemaSource },
  { uid: CTA_UID, schema: ctaSchema as ComponentSchemaSource },
];

async function ensureIndependentComponents(strapi: Core.Strapi): Promise<boolean> {
  let changed = false;

  for (const { uid, schema } of INDEPENDENT_COMPONENTS) {
    if (!strapi.components[uid]) {
      await createComponent(strapi, schema);
      changed = true;
    }
  }

  return changed;
}

/**
 * Idempotent: only creates the sitetune.seo / sitetune.open-graph /
 * content-block components if they don't already exist on the host.
 * Deliberately does NOT touch any existing content-type (article, global,
 * or otherwise) — attaching any of these components to a content-type is a
 * manual step via the admin panel's Content-Type Builder, left to whoever
 * adopts the plugin. See README's "Pillar A design notes" for why: editing
 * an existing content-type's attributes programmatically (to add a field
 * referencing these components) risks corrupting unrelated relations on
 * that content-type, confirmed against a real host.
 */
const schemaSetup = ({ strapi }: { strapi: Core.Strapi }) => ({
  async run(): Promise<{ schemaChanged: boolean }> {
    // SEO/OG first, then the independent blocks — order doesn't affect
    // correctness (neither set references the other), kept stable so
    // callers relying on call order (e.g. tests) aren't surprised.
    const seoChanged = await ensureComponents(
      strapi,
      openGraphSchema as ComponentSchemaSource,
      seoSchema as ComponentSchemaSource
    );
    const blocksChanged = await ensureIndependentComponents(strapi);

    return { schemaChanged: seoChanged || blocksChanged };
  },

  isReady(): boolean {
    return Boolean(
      strapi.components[OPEN_GRAPH_UID] &&
        strapi.components[SEO_UID] &&
        strapi.components[TESTIMONIAL_UID] &&
        strapi.components[TEAM_MEMBER_UID] &&
        strapi.components[FAQ_ITEM_UID] &&
        strapi.components[CTA_UID]
    );
  },
});

export default schemaSetup;
