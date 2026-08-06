import { describe, expect, it, vi } from "vitest";

import schemaSetup from "./schema-setup";
import { OPEN_GRAPH_UID, SEO_UID, SEO_FIELD_NAME } from "../constants";

const ARTICLE_UID = "api::article.article";
const GLOBAL_UID = "api::global.global";

function buildStrapiMock({
  components = {},
  contentTypes = {},
}: {
  components?: Record<string, unknown>;
  contentTypes?: Record<string, unknown>;
} = {}) {
  const createComponent = vi.fn().mockResolvedValue(undefined);
  const editContentType = vi.fn().mockResolvedValue(undefined);

  const strapi = {
    components,
    contentTypes,
    log: { warn: vi.fn(), info: vi.fn() },
    plugin: vi.fn((name: string) => {
      if (name !== "content-type-builder") throw new Error(`unexpected plugin ${name}`);
      return {
        service: (serviceName: string) => {
          if (serviceName === "components") return { createComponent };
          if (serviceName === "content-types") return { editContentType };
          throw new Error(`unexpected service ${serviceName}`);
        },
      };
    }),
  };

  return { strapi, createComponent, editContentType };
}

const articleModel = () => ({
  kind: "collectionType",
  info: { displayName: "Article", singularName: "article", pluralName: "articles" },
  options: { draftAndPublish: true },
  pluginOptions: {},
  attributes: {
    title: { type: "string", required: true },
    seo: { type: "component", component: "shared.seo", repeatable: false },
  },
});

describe("schema-setup", () => {
  it("does nothing when components and fields already exist", async () => {
    const { strapi, createComponent, editContentType } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
      contentTypes: {
        [ARTICLE_UID]: {
          ...articleModel(),
          attributes: { ...articleModel().attributes, [SEO_FIELD_NAME]: { type: "component" } },
        },
        [GLOBAL_UID]: {
          kind: "singleType",
          info: { displayName: "Global", singularName: "global", pluralName: "globals" },
          options: { draftAndPublish: false },
          pluginOptions: {},
          attributes: { [SEO_FIELD_NAME]: { type: "component" } },
        },
      },
    });

    const result = await schemaSetup({ strapi: strapi as any }).run();

    expect(result.schemaChanged).toBe(false);
    expect(createComponent).not.toHaveBeenCalled();
    expect(editContentType).not.toHaveBeenCalled();
  });

  it("creates open-graph and seo together in a single batched call when both are missing", async () => {
    // Two separate createComponent() calls in the same boot would fail:
    // strapi.components only refreshes on a full reload, so a second call
    // referencing what the first call just created (by its final UID)
    // throws component.notFound against the still-stale live registry.
    // Regression test for that — see createDependentComponents in
    // schema-setup.ts.
    const { strapi, createComponent } = buildStrapiMock({
      components: {},
      contentTypes: { [ARTICLE_UID]: articleModel() },
    });

    await schemaSetup({ strapi: strapi as any }).run();

    expect(createComponent).toHaveBeenCalledTimes(1);
    const [payload] = createComponent.mock.calls[0];
    expect(payload.component.displayName).toBe("SEO");
    expect(payload.component.category).toBe("sitetune");

    // The primary component's nested reference must NOT be the real
    // sitetune.open-graph UID (that would hit the same notFound bug) — it
    // must point at the tmpUID of the dependency shipped alongside it.
    const openGraphRef = payload.component.attributes.openGraph.component;
    expect(openGraphRef).not.toBe(OPEN_GRAPH_UID);

    expect(payload.components).toHaveLength(1);
    expect(payload.components[0].tmpUID).toBe(openGraphRef);
    expect(payload.components[0].displayName).toBe("Open Graph");
    expect(payload.components[0].category).toBe("sitetune");
  });

  it("recovers a partial state (e.g. a previous crashed run) with plain single-component calls", async () => {
    const { strapi, createComponent } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {} }, // open-graph already on disk from a prior run
      contentTypes: { [ARTICLE_UID]: articleModel() },
    });

    await schemaSetup({ strapi: strapi as any }).run();

    expect(createComponent).toHaveBeenCalledTimes(1);
    const [payload] = createComponent.mock.calls[0];
    expect(payload.component.displayName).toBe("SEO");
    expect(payload.components).toBeUndefined();
    // Now that open-graph is confirmed live, seo can reference its real UID directly.
    expect(payload.component.attributes.openGraph.component).toBe(OPEN_GRAPH_UID);
  });

  it("does not mark metaTitle/metaDescription as required, so a partially-filled backfill never blocks a save", async () => {
    const { strapi, createComponent } = buildStrapiMock({
      components: {},
      contentTypes: { [ARTICLE_UID]: articleModel() },
    });

    await schemaSetup({ strapi: strapi as any }).run();

    const seoComponentCall = createComponent.mock.calls.find(
      ([payload]) => payload.component.displayName === "SEO"
    );
    const { metaTitle, metaDescription } = seoComponentCall[0].component.attributes;
    expect(metaTitle.required).toBeFalsy();
    expect(metaDescription.required).toBeFalsy();
    expect(metaTitle.minLength).toBeUndefined();
    expect(metaDescription.minLength).toBeUndefined();
  });

  it("adds the sitetuneSeo field without dropping existing attributes, preserving draftAndPublish", async () => {
    const { strapi, editContentType } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
      contentTypes: { [ARTICLE_UID]: articleModel() },
    });

    await schemaSetup({ strapi: strapi as any }).run();

    expect(editContentType).toHaveBeenCalledTimes(1);
    const [uid, payload] = editContentType.mock.calls[0];
    expect(uid).toBe(ARTICLE_UID);
    expect(payload.contentType.draftAndPublish).toBe(true);
    expect(payload.contentType.attributes.title).toEqual({ type: "string", required: true });
    expect(payload.contentType.attributes.seo).toEqual({
      type: "component",
      component: "shared.seo",
      repeatable: false,
    });
    expect(payload.contentType.attributes[SEO_FIELD_NAME]).toEqual({
      type: "component",
      component: SEO_UID,
      repeatable: false,
      pluginOptions: { i18n: { localized: true } },
    });
  });

  it("warns and skips a target content-type that doesn't exist on the host yet", async () => {
    const { strapi, editContentType } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
      contentTypes: {},
    });

    const result = await schemaSetup({ strapi: strapi as any }).run();

    expect(result.schemaChanged).toBe(false);
    expect(editContentType).not.toHaveBeenCalled();
    expect((strapi.log.warn as any)).toHaveBeenCalled();
  });

  it("isReady reflects whether both components and both fields are present", () => {
    const { strapi } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
      contentTypes: {
        [ARTICLE_UID]: {
          attributes: { [SEO_FIELD_NAME]: {} },
        },
        [GLOBAL_UID]: {
          attributes: {},
        },
      },
    });

    expect(schemaSetup({ strapi: strapi as any }).isReady()).toBe(false);
  });
});
