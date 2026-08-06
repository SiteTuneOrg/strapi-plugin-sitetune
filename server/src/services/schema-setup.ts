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
 * host.
 *
 * Only the Content-Type Builder's admin HTTP controller calls
 * `strapi.reload()` after a write — the service itself doesn't, and
 * `strapi.components`/`strapi.contentTypes` only refresh on that reload
 * (confirmed against a real boot: a second CTB write in the same process,
 * referencing something the first write just created, throws
 * `component.notFound` against the still-stale live registry). So this
 * makes at most one schema-changing call per `run()` and reports
 * `needsReload: true` whenever it did — the caller (`bootstrap.ts`) must
 * trigger the reload itself and skip the migration for that boot.
 */
const schemaSetup = ({ strapi }: { strapi: Core.Strapi }) => ({
  async run(): Promise<{ schemaChanged: boolean; needsReload: boolean }> {
    const componentsChanged = await ensureComponents(
      strapi,
      openGraphSchema as ComponentSchemaSource,
      seoSchema as ComponentSchemaSource
    );

    if (componentsChanged) {
      return { schemaChanged: true, needsReload: true };
    }

    // Safe to loop over multiple content-types here (unlike component
    // creation): each editContentType() call only adds a field referencing
    // sitetune.seo, which — at this point — is already confirmed present in
    // the live registry from a prior boot, not something just created in
    // this same call.
    let fieldsChanged = false;
    for (const { uid } of TARGET_CONTENT_TYPES) {
      fieldsChanged = (await ensureSeoField(strapi, uid)) || fieldsChanged;
    }

    return { schemaChanged: fieldsChanged, needsReload: fieldsChanged };
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
