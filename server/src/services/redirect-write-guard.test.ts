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
});
