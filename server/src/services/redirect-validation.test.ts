import { describe, expect, it, vi } from 'vitest';

import redirectValidation, { assertValidStatusCode } from './redirect-validation';
import { REDIRECT_UID } from '../constants';

interface FixtureRow {
  documentId: string;
  from: string;
  to: string;
}

function buildStrapiMock(rows: FixtureRow[]) {
  const findMany = vi.fn(async (params: { filters?: { from?: string } }) => {
    if (params?.filters?.from !== undefined) {
      return rows.filter((row) => row.from === params.filters!.from);
    }
    return rows;
  });
  const documents = vi.fn((uid: string) => {
    if (uid !== REDIRECT_UID) throw new Error(`unexpected uid ${uid}`);
    return { findMany };
  });

  const strapi = { documents };

  return { strapi, findMany, documents };
}

function service(rows: FixtureRow[]) {
  const { strapi } = buildStrapiMock(rows);
  return redirectValidation({ strapi: strapi as any });
}

describe('redirect-validation', () => {
  it('passes when there are no existing redirects and no self-loop', async () => {
    await expect(
      service([]).validateRedirectWrite({ from: '/old', to: '/new' })
    ).resolves.toBeUndefined();
  });

  it('rejects a self-loop (from === to)', async () => {
    await expect(service([]).validateRedirectWrite({ from: '/same', to: '/same' })).rejects.toThrow(
      /from.*to.*differ/i
    );
  });

  it('rejects a duplicate from value against another document', async () => {
    const rows: FixtureRow[] = [{ documentId: 'd1', from: '/old', to: '/elsewhere' }];

    await expect(service(rows).validateRedirectWrite({ from: '/old', to: '/new' })).rejects.toThrow(
      /already exists/i
    );
  });

  it("does not treat updating a document's own from as a duplicate", async () => {
    const rows: FixtureRow[] = [{ documentId: 'd1', from: '/old', to: '/new' }];

    await expect(
      service(rows).validateRedirectWrite({ documentId: 'd1', from: '/old', to: '/newer' })
    ).resolves.toBeUndefined();
  });

  it('rejects a direct 2-hop cycle (A->B, new B->A)', async () => {
    const rows: FixtureRow[] = [{ documentId: 'd1', from: '/a', to: '/b' }];

    await expect(service(rows).validateRedirectWrite({ from: '/b', to: '/a' })).rejects.toThrow(
      /circular redirect/i
    );
  });

  it('rejects a longer cycle (A->B->C, new C->A)', async () => {
    const rows: FixtureRow[] = [
      { documentId: 'd1', from: '/a', to: '/b' },
      { documentId: 'd2', from: '/b', to: '/c' },
    ];

    await expect(service(rows).validateRedirectWrite({ from: '/c', to: '/a' })).rejects.toThrow(
      /circular redirect/i
    );
  });

  it('allows two independent redirects converging on the same target (not a cycle)', async () => {
    const rows: FixtureRow[] = [{ documentId: 'd1', from: '/x', to: '/y' }];

    await expect(
      service(rows).validateRedirectWrite({ from: '/z', to: '/y' })
    ).resolves.toBeUndefined();
  });

  it('re-validates an update against the merged new state, not just the changed field', async () => {
    // d1: /a -> /b (unrelated), d2: /c -> /a (points at d1's current "from").
    // Updating d1 so its "to" becomes /c only creates a cycle because of this update.
    const rows: FixtureRow[] = [
      { documentId: 'd1', from: '/a', to: '/b' },
      { documentId: 'd2', from: '/c', to: '/a' },
    ];

    await expect(
      service(rows).validateRedirectWrite({ documentId: 'd1', from: '/a', to: '/c' })
    ).rejects.toThrow(/circular redirect/i);
  });

  it('excludes the document being updated from its own cycle graph', async () => {
    const rows: FixtureRow[] = [{ documentId: 'd1', from: '/a', to: '/b' }];

    await expect(
      service(rows).validateRedirectWrite({ documentId: 'd1', from: '/a', to: '/c' })
    ).resolves.toBeUndefined();
  });
});

describe('assertValidStatusCode', () => {
  it('accepts 301 and 302', () => {
    expect(() => assertValidStatusCode(301)).not.toThrow();
    expect(() => assertValidStatusCode(302)).not.toThrow();
  });

  it('rejects any other status code', () => {
    expect(() => assertValidStatusCode(200)).toThrow(/statusCode must be one of/i);
    expect(() => assertValidStatusCode(404)).toThrow(/statusCode must be one of/i);
  });
});
