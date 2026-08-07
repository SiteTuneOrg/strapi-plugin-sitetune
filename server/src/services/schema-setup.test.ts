import { describe, expect, it, vi } from 'vitest';

import schemaSetup from './schema-setup';
import {
  OPEN_GRAPH_UID,
  SEO_UID,
  TESTIMONIAL_UID,
  TEAM_MEMBER_UID,
  FAQ_ITEM_UID,
  CTA_UID,
} from '../constants';

const ALL_UIDS = [OPEN_GRAPH_UID, SEO_UID, TESTIMONIAL_UID, TEAM_MEMBER_UID, FAQ_ITEM_UID, CTA_UID];

function buildAllComponents(): Record<string, unknown> {
  return Object.fromEntries(ALL_UIDS.map((uid) => [uid, {}]));
}

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
  it('does nothing when every component already exists', async () => {
    const { strapi, createComponent } = buildStrapiMock({
      components: buildAllComponents(),
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
    // schema-setup.ts. Blocks are pre-seeded as already existing so this
    // test only exercises the SEO/OG dependent-pair path.
    const { strapi, createComponent } = buildStrapiMock({
      components: {
        [TESTIMONIAL_UID]: {},
        [TEAM_MEMBER_UID]: {},
        [FAQ_ITEM_UID]: {},
        [CTA_UID]: {},
      },
    });

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
      components: {
        [OPEN_GRAPH_UID]: {}, // open-graph already on disk from a prior run
        [TESTIMONIAL_UID]: {},
        [TEAM_MEMBER_UID]: {},
        [FAQ_ITEM_UID]: {},
        [CTA_UID]: {},
      },
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
    const { strapi, createComponent } = buildStrapiMock({
      components: {
        [TESTIMONIAL_UID]: {},
        [TEAM_MEMBER_UID]: {},
        [FAQ_ITEM_UID]: {},
        [CTA_UID]: {},
      },
    });

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

  it('creates only the missing content-block components independently, with no tmpUID batching', async () => {
    const { strapi, createComponent } = buildStrapiMock({
      // SEO/OG already present so this test isolates the blocks loop.
      components: {
        [OPEN_GRAPH_UID]: {},
        [SEO_UID]: {},
        [TESTIMONIAL_UID]: {}, // already exists — must not be re-created
      },
    });

    const result = await schemaSetup({ strapi: strapi as any }).run();

    expect(result).toEqual({ schemaChanged: true });
    expect(createComponent).toHaveBeenCalledTimes(3);

    const displayNames = createComponent.mock.calls.map(
      ([payload]) => payload.component.displayName
    );
    expect(displayNames.sort()).toEqual(['CTA', 'FAQ Item', 'Team Member']);

    for (const [payload] of createComponent.mock.calls) {
      expect(payload.component.category).toBe('sitetune-blocks');
      expect(payload.components).toBeUndefined(); // no tmpUID batching — independent components
    }
  });

  it('does not mark testimonial.quote/cta.title as required', async () => {
    const { strapi, createComponent } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
    });

    await schemaSetup({ strapi: strapi as any }).run();

    const testimonialCall = createComponent.mock.calls.find(
      ([payload]) => payload.component.displayName === 'Testimonial'
    );
    const ctaCall = createComponent.mock.calls.find(
      ([payload]) => payload.component.displayName === 'CTA'
    );
    expect(testimonialCall[0].component.attributes.quote.required).toBeFalsy();
    expect(ctaCall[0].component.attributes.title.required).toBeFalsy();
  });

  it('isReady reflects whether every component is present', () => {
    const { strapi } = buildStrapiMock({ components: {} });
    expect(schemaSetup({ strapi: strapi as any }).isReady()).toBe(false);

    const { strapi: strapiPartial } = buildStrapiMock({
      components: { [OPEN_GRAPH_UID]: {}, [SEO_UID]: {} },
    });
    expect(schemaSetup({ strapi: strapiPartial as any }).isReady()).toBe(false);

    const { strapi: strapiReady } = buildStrapiMock({
      components: buildAllComponents(),
    });
    expect(schemaSetup({ strapi: strapiReady as any }).isReady()).toBe(true);
  });
});
