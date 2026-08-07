import { describe, expect, it, vi } from 'vitest';

import schemaSetup from './schema-setup';
import { OPEN_GRAPH_UID, SEO_UID } from '../constants';

function buildStrapiMock({
  components = {},
}: {
  components?: Record<string, unknown>;
} = {}) {
  const createComponent = vi.fn().mockResolvedValue(undefined);

  const strapi = {
    components,
    log: { warn: vi.fn(), info: vi.fn() },
    plugin: vi.fn((name: string) => {
      if (name !== 'content-type-builder') throw new Error(`unexpected plugin ${name}`);
      return {
        service: (serviceName: string) => {
          if (serviceName === 'components') return { createComponent };
          throw new Error(`unexpected service ${serviceName}`);
        },
      };
    }),
  };

  return { strapi, createComponent };
}

describe('schema-setup', () => {
  it('does nothing when both components already exist', async () => {
    const { strapi, createComponent } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
    });

    const result = await schemaSetup({ strapi: strapi as any }).run();

    expect(result).toEqual({ schemaChanged: false });
    expect(createComponent).not.toHaveBeenCalled();
  });

  it('creates open-graph and seo together in a single batched call when both are missing', async () => {
    // Two separate createComponent() calls in the same boot would fail:
    // strapi.components only refreshes on a full reload, so a second call
    // referencing what the first call just created (by its final UID)
    // throws component.notFound against the still-stale live registry.
    // Regression test for that — see createDependentComponents in
    // schema-setup.ts.
    const { strapi, createComponent } = buildStrapiMock({ components: {} });

    const result = await schemaSetup({ strapi: strapi as any }).run();

    expect(result).toEqual({ schemaChanged: true });
    expect(createComponent).toHaveBeenCalledTimes(1);
    const [payload] = createComponent.mock.calls[0];
    expect(payload.component.displayName).toBe('SEO');
    expect(payload.component.category).toBe('sitetune');

    // The primary component's nested reference must NOT be the real
    // sitetune.open-graph UID (that would hit the same notFound bug) — it
    // must point at the tmpUID of the dependency shipped alongside it.
    const openGraphRef = payload.component.attributes.openGraph.component;
    expect(openGraphRef).not.toBe(OPEN_GRAPH_UID);

    expect(payload.components).toHaveLength(1);
    expect(payload.components[0].tmpUID).toBe(openGraphRef);
    expect(payload.components[0].displayName).toBe('Open Graph');
    expect(payload.components[0].category).toBe('sitetune');
  });

  it('recovers a partial state (e.g. a previous crashed run) with a plain single-component call', async () => {
    const { strapi, createComponent } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {} }, // open-graph already on disk from a prior run
    });

    const result = await schemaSetup({ strapi: strapi as any }).run();

    expect(result).toEqual({ schemaChanged: true });
    expect(createComponent).toHaveBeenCalledTimes(1);
    const [payload] = createComponent.mock.calls[0];
    expect(payload.component.displayName).toBe('SEO');
    expect(payload.components).toBeUndefined();
    // Now that open-graph is confirmed live, seo can reference its real UID directly.
    expect(payload.component.attributes.openGraph.component).toBe(OPEN_GRAPH_UID);
  });

  it('does not mark metaTitle/metaDescription as required, so a partially-filled backfill never blocks a save', async () => {
    const { strapi, createComponent } = buildStrapiMock({ components: {} });

    await schemaSetup({ strapi: strapi as any }).run();

    const seoComponentCall = createComponent.mock.calls.find(
      ([payload]) => payload.component.displayName === 'SEO'
    );
    const { metaTitle, metaDescription } = seoComponentCall[0].component.attributes;
    expect(metaTitle.required).toBeFalsy();
    expect(metaDescription.required).toBeFalsy();
    expect(metaTitle.minLength).toBeUndefined();
    expect(metaDescription.minLength).toBeUndefined();
  });

  it('isReady reflects whether both components are present', () => {
    const { strapi } = buildStrapiMock({ components: {} });
    expect(schemaSetup({ strapi: strapi as any }).isReady()).toBe(false);

    const { strapi: strapiReady } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
    });
    expect(schemaSetup({ strapi: strapiReady as any }).isReady()).toBe(true);
  });
});
