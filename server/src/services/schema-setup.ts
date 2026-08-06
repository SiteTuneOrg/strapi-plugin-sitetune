import type { Core } from "@strapi/strapi";

import openGraphSchema from "../schemas/sitetune-open-graph.json";
import seoSchema from "../schemas/sitetune-seo.json";
import {
  OPEN_GRAPH_UID,
  SEO_UID,
  SEO_FIELD_NAME,
  TARGET_CONTENT_TYPES,
} from "../constants";

interface ComponentSchemaSource {
  category: string;
  displayName: string;
  icon: string;
  attributes: Record<string, unknown>;
}

const getContentTypeBuilder = (strapi: Core.Strapi) =>
  strapi.plugin("content-type-builder");

async function ensureComponent(
  strapi: Core.Strapi,
  uid: string,
  schema: ComponentSchemaSource
): Promise<boolean> {
  if (strapi.components[uid]) {
    return false;
  }

  await getContentTypeBuilder(strapi)
    .service("components")
    .createComponent({
      component: {
        category: schema.category,
        icon: schema.icon,
        displayName: schema.displayName,
        attributes: schema.attributes,
      },
    });

  return true;
}

async function ensureSeoField(
  strapi: Core.Strapi,
  contentTypeUid: string
): Promise<boolean> {
  const model = strapi.contentTypes[contentTypeUid];

  if (!model) {
    strapi.log.warn(
      `[sitetune] content-type "${contentTypeUid}" not found, skipping SEO field setup`
    );
    return false;
  }

  if (model.attributes[SEO_FIELD_NAME]) {
    return false;
  }

  await getContentTypeBuilder(strapi)
    .service("content-types")
    .editContentType(contentTypeUid, {
      contentType: {
        displayName: model.info.displayName,
        singularName: (model.info as Record<string, unknown>).singularName,
        pluralName: (model.info as Record<string, unknown>).pluralName,
        description: model.info.description,
        kind: model.kind,
        draftAndPublish: model.options?.draftAndPublish,
        options: model.options,
        pluginOptions: model.pluginOptions,
        attributes: {
          ...model.attributes,
          [SEO_FIELD_NAME]: {
            type: "component",
            component: SEO_UID,
            repeatable: false,
            pluginOptions: { i18n: { localized: true } },
          },
        },
      },
    });

  return true;
}

/**
 * Idempotent: only creates components/fields that don't already exist on the
 * host. Writing a new component/field via the Content-Type Builder service
 * triggers a Strapi restart, so this runs across two boots — see README.
 */
const schemaSetup = ({ strapi }: { strapi: Core.Strapi }) => ({
  async run(): Promise<{ schemaChanged: boolean }> {
    let schemaChanged = false;

    // sitetune.open-graph must exist before sitetune.seo, which nests it.
    schemaChanged =
      (await ensureComponent(
        strapi,
        OPEN_GRAPH_UID,
        openGraphSchema as ComponentSchemaSource
      )) || schemaChanged;
    schemaChanged =
      (await ensureComponent(
        strapi,
        SEO_UID,
        seoSchema as ComponentSchemaSource
      )) || schemaChanged;

    for (const { uid } of TARGET_CONTENT_TYPES) {
      schemaChanged = (await ensureSeoField(strapi, uid)) || schemaChanged;
    }

    return { schemaChanged };
  },

  isReady(): boolean {
    if (!strapi.components[OPEN_GRAPH_UID] || !strapi.components[SEO_UID]) {
      return false;
    }
    return TARGET_CONTENT_TYPES.every(
      ({ uid }) => strapi.contentTypes[uid]?.attributes?.[SEO_FIELD_NAME]
    );
  },
});

export default schemaSetup;
