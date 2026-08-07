import { describe, expect, it, vi } from 'vitest';

import { createRedirectWriteGuard } from './redirect-write-guard';
import { REDIRECT_UID } from '../constants';

function buildStrapiMock(existing?: { from: string; to: string } | null) {
  const validateRedirectWrite = vi.fn().mockResolvedValue(undefined);
  const findOne = vi.fn().mockResolvedValue(existing ?? null);
  const documents = vi.fn((uid: string) => {
    if (uid !== REDIRECT_UID) throw new Error(`unexpected uid ${uid}`);
    return { findOne };
  });

  const strapi = {
    documents,
    plugin: vi.fn((name: string) => {
      if (name !== 'sitetune') throw new Error(`unexpected plugin ${name}`);
      return {
        service: (serviceName: string) => {
          if (serviceName !== 'redirect-validation') {
            throw new Error(`unexpected service ${serviceName}`);
          }
          return { validateRedirectWrite };
        },
      };
    }),
  };

  return { strapi, validateRedirectWrite, findOne, documents };
}

describe('redirect-write-guard', () => {
  it('passes through untouched for a different content-type', async () => {
    const { strapi, documents } = buildStrapiMock();
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('next-result');

    const result = await guard(
      {
        uid: 'plugin::sitetune.other',
        action: 'create',
        params: { data: { from: '/a', to: '/b' } },
      } as any,
      next
    );

    expect(result).toBe('next-result');
    expect(next).toHaveBeenCalledTimes(1);
    expect(documents).not.toHaveBeenCalled();
  });

  it('passes through untouched for a non-write action on this content-type', async () => {
    const { strapi, documents } = buildStrapiMock();
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('next-result');

    await guard({ uid: REDIRECT_UID, action: 'findMany', params: {} } as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(documents).not.toHaveBeenCalled();
  });

  it('validates a create call using the data as-is', async () => {
    const { strapi, validateRedirectWrite } = buildStrapiMock();
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('created');

    const result = await guard(
      {
        uid: REDIRECT_UID,
        action: 'create',
        params: { data: { from: '/old', to: '/new' } },
      } as any,
      next
    );

    expect(validateRedirectWrite).toHaveBeenCalledWith({
      documentId: undefined,
      from: '/old',
      to: '/new',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toBe('created');
  });

  it('merges a partial update (only unrelated fields sent) with the existing document before validating', async () => {
    const { strapi, validateRedirectWrite, findOne } = buildStrapiMock({
      from: '/old',
      to: '/new',
    });
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('updated');

    await guard(
      {
        uid: REDIRECT_UID,
        action: 'update',
        params: { documentId: 'd1', data: { enabled: false } },
      } as any,
      next
    );

    expect(findOne).toHaveBeenCalledWith({ documentId: 'd1', fields: ['from', 'to'] });
    expect(validateRedirectWrite).toHaveBeenCalledWith({
      documentId: 'd1',
      from: '/old',
      to: '/new',
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not fetch the existing document when the update already carries both from and to', async () => {
    const { strapi, validateRedirectWrite, findOne } = buildStrapiMock({
      from: '/stale',
      to: '/stale-too',
    });
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('updated');

    await guard(
      {
        uid: REDIRECT_UID,
        action: 'update',
        params: { documentId: 'd1', data: { from: '/a', to: '/b' } },
      } as any,
      next
    );

    expect(findOne).not.toHaveBeenCalled();
    expect(validateRedirectWrite).toHaveBeenCalledWith({ documentId: 'd1', from: '/a', to: '/b' });
  });

  it('skips validation (and never calls next-blocking work) when the update targets a nonexistent document', async () => {
    const { strapi, validateRedirectWrite, findOne } = buildStrapiMock(null);
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('noop');

    const result = await guard(
      {
        uid: REDIRECT_UID,
        action: 'update',
        params: { documentId: 'missing', data: { enabled: true } },
      } as any,
      next
    );

    expect(findOne).toHaveBeenCalled();
    expect(validateRedirectWrite).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toBe('noop');
  });

  it('rejects a create with an invalid statusCode before touching from/to validation', async () => {
    const { strapi, validateRedirectWrite } = buildStrapiMock();
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('should-not-happen');

    await expect(
      guard(
        {
          uid: REDIRECT_UID,
          action: 'create',
          params: { data: { from: '/a', to: '/b', statusCode: 200 } },
        } as any,
        next
      )
    ).rejects.toThrow(/statusCode must be one of/i);

    expect(validateRedirectWrite).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a create with a valid statusCode', async () => {
    const { strapi, validateRedirectWrite } = buildStrapiMock();
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('created');

    const result = await guard(
      {
        uid: REDIRECT_UID,
        action: 'create',
        params: { data: { from: '/a', to: '/b', statusCode: 302 } },
      } as any,
      next
    );

    expect(validateRedirectWrite).toHaveBeenCalledWith({
      documentId: undefined,
      from: '/a',
      to: '/b',
    });
    expect(result).toBe('created');
  });

  it('propagates a validation rejection and never calls next', async () => {
    const { strapi, validateRedirectWrite } = buildStrapiMock();
    validateRedirectWrite.mockRejectedValue(new Error('circular redirect'));
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('should-not-happen');

    await expect(
      guard(
        { uid: REDIRECT_UID, action: 'create', params: { data: { from: '/a', to: '/b' } } } as any,
        next
      )
    ).rejects.toThrow('circular redirect');

    expect(next).not.toHaveBeenCalled();
  });

  it('persists trimmed from/to, not the raw whitespace-padded input, on create', async () => {
    const { strapi, validateRedirectWrite } = buildStrapiMock();
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('created');
    const ctx = {
      uid: REDIRECT_UID,
      action: 'create',
      params: { data: { from: ' /old ', to: '/new\t' } },
    } as any;

    await guard(ctx, next);

    // Validation must have run against the same normalized value that ends
    // up persisted below — otherwise a padded value could pass validation
    // against its trimmed form but save with the padding intact.
    expect(validateRedirectWrite).toHaveBeenCalledWith({
      documentId: undefined,
      from: '/old',
      to: '/new',
    });
    expect(ctx.params.data.from).toBe('/old');
    expect(ctx.params.data.to).toBe('/new');
  });

  it('only rewrites the fields the update actually supplied, leaving untouched fields alone', async () => {
    const { strapi } = buildStrapiMock({ from: '/old', to: '/new' });
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('updated');
    const ctx = {
      uid: REDIRECT_UID,
      action: 'update',
      params: { documentId: 'd1', data: { to: ' /newer ' } },
    } as any;

    await guard(ctx, next);

    expect(ctx.params.data.to).toBe('/newer');
    expect(ctx.params.data.from).toBeUndefined();
  });

  it("validates a clone using the source document's from/to when no override is given, without excluding the source from its own duplicate check", async () => {
    const { strapi, validateRedirectWrite, findOne } = buildStrapiMock({
      from: '/old',
      to: '/new',
    });
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('cloned');

    const result = await guard(
      {
        uid: REDIRECT_UID,
        action: 'clone',
        params: { documentId: 'source-doc', data: {} },
      } as any,
      next
    );

    expect(findOne).toHaveBeenCalledWith({ documentId: 'source-doc', fields: ['from', 'to'] });
    // documentId is deliberately undefined here (not "source-doc") — a clone
    // creates a brand-new row, so even a from/to identical to the source's
    // own must be flagged as a real duplicate/cycle, not waved through
    // because it happens to match the row being copied from.
    expect(validateRedirectWrite).toHaveBeenCalledWith({
      documentId: undefined,
      from: '/old',
      to: '/new',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toBe('cloned');
  });

  it("validates a clone's overridden from/to instead of the source's, and persists it trimmed", async () => {
    const { strapi, validateRedirectWrite, findOne } = buildStrapiMock({
      from: '/old',
      to: '/new',
    });
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('cloned');
    const ctx = {
      uid: REDIRECT_UID,
      action: 'clone',
      params: { documentId: 'source-doc', data: { from: ' /old-2 ' } },
    } as any;

    await guard(ctx, next);

    // "to" wasn't overridden, so it's still fetched from the source — but
    // "from" was, so the source is never even queried for it specifically;
    // findOne only needs to run once regardless, to fill in the missing "to".
    expect(findOne).toHaveBeenCalledWith({ documentId: 'source-doc', fields: ['from', 'to'] });
    expect(validateRedirectWrite).toHaveBeenCalledWith({
      documentId: undefined,
      from: '/old-2',
      to: '/new',
    });
    expect(ctx.params.data.from).toBe('/old-2');
    expect(ctx.params.data.to).toBeUndefined();
  });

  it('rejects a clone with an invalid statusCode override', async () => {
    const { strapi } = buildStrapiMock({ from: '/old', to: '/new' });
    const guard = createRedirectWriteGuard(strapi as any);
    const next = vi.fn().mockResolvedValue('should-not-happen');

    await expect(
      guard(
        {
          uid: REDIRECT_UID,
          action: 'clone',
          params: { documentId: 'source-doc', data: { statusCode: 500 } },
        } as any,
        next
      )
    ).rejects.toThrow(/statusCode must be one of/i);

    expect(next).not.toHaveBeenCalled();
  });
});
