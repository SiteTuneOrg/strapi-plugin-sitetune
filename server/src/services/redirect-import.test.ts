import { describe, expect, it, vi } from 'vitest';

import { createRedirectImportService } from './redirect-import';
import { REDIRECT_UID } from '../constants';

function buildStrapiMock(createImpl?: (params: any) => Promise<unknown>) {
  const create = vi.fn(createImpl ?? (async () => ({})));
  const documents = vi.fn((uid: string) => {
    if (uid !== REDIRECT_UID) throw new Error(`unexpected uid ${uid}`);
    return { create };
  });

  return { strapi: { documents } as any, create, documents };
}

describe('redirect-import', () => {
  it('returns an empty report for an empty file', async () => {
    const { strapi } = buildStrapiMock();
    const service = createRedirectImportService({ strapi });

    const report = await service.importFromCsv('');

    expect(report).toEqual({ successCount: 0, errors: [] });
  });

  it('rejects a header missing from/to columns without touching the document service', async () => {
    const { strapi, create } = buildStrapiMock();
    const service = createRedirectImportService({ strapi });

    const report = await service.importFromCsv('statusCode,enabled\n301,true\n');

    expect(report.successCount).toBe(0);
    expect(report.errors).toEqual([
      { row: 1, from: '', message: 'CSV header must include "from" and "to" columns.' },
    ]);
    expect(create).not.toHaveBeenCalled();
  });

  it('imports every valid row and reports per-row success count', async () => {
    const { strapi, create } = buildStrapiMock();
    const service = createRedirectImportService({ strapi });

    const csv = [
      'from,to,statusCode,enabled',
      '/old1,/new1,301,true',
      '/old2,/new2,302,false',
    ].join('\n');

    const report = await service.importFromCsv(csv);

    expect(report).toEqual({ successCount: 2, errors: [] });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: { from: '/old1', to: '/new1', statusCode: 301, enabled: true },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: { from: '/old2', to: '/new2', statusCode: 302, enabled: false },
    });
  });

  it('defaults statusCode to 301 and enabled to true when omitted', async () => {
    const { strapi, create } = buildStrapiMock();
    const service = createRedirectImportService({ strapi });

    await service.importFromCsv('from,to\n/old,/new\n');

    expect(create).toHaveBeenCalledWith({
      data: { from: '/old', to: '/new', statusCode: 301, enabled: true },
    });
  });

  it("isolates a bad row's failure without blocking the rest of the file", async () => {
    const { strapi, create } = buildStrapiMock(async (params: any) => {
      if (params.data.from === '/bad') {
        throw new Error('Circular redirect: /bad eventually loops back through /bad.');
      }
      return {};
    });
    const service = createRedirectImportService({ strapi });

    const csv = ['from,to', '/good1,/target1', '/bad,/bad-target', '/good2,/target2'].join('\n');

    const report = await service.importFromCsv(csv);

    expect(report.successCount).toBe(2);
    expect(report.errors).toEqual([
      {
        row: 3,
        from: '/bad',
        message: 'Circular redirect: /bad eventually loops back through /bad.',
      },
    ]);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('reports a row missing from or to without calling create for that row', async () => {
    const { strapi, create } = buildStrapiMock();
    const service = createRedirectImportService({ strapi });

    const csv = ['from,to', ',/missing-from', '/missing-to,'].join('\n');

    const report = await service.importFromCsv(csv);

    expect(report.successCount).toBe(0);
    expect(report.errors).toEqual([
      { row: 2, from: '', message: 'Each row needs both "from" and "to".' },
      { row: 3, from: '/missing-to', message: 'Each row needs both "from" and "to".' },
    ]);
    expect(create).not.toHaveBeenCalled();
  });
});
