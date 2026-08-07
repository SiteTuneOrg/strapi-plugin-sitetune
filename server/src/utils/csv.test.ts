import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('returns an empty array for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('parses plain comma-separated rows', () => {
    expect(parseCsv('from,to,statusCode\n/a,/b,301\n')).toEqual([
      ['from', 'to', 'statusCode'],
      ['/a', '/b', '301'],
    ]);
  });

  it('parses a file with no trailing newline', () => {
    expect(parseCsv('from,to\n/a,/b')).toEqual([
      ['from', 'to'],
      ['/a', '/b'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('from,to\n"/old?a=1,2",/new\n')).toEqual([
      ['from', 'to'],
      ['/old?a=1,2', '/new'],
    ]);
  });

  it('handles escaped double quotes inside a quoted field', () => {
    expect(parseCsv('from,to\n"/say ""hi""",/new\n')).toEqual([
      ['from', 'to'],
      ['/say "hi"', '/new'],
    ]);
  });

  it('handles a quoted field containing an embedded newline', () => {
    expect(parseCsv('from,to\n"/multi\nline",/new\n')).toEqual([
      ['from', 'to'],
      ['/multi\nline', '/new'],
    ]);
  });

  it('normalizes CRLF line endings', () => {
    expect(parseCsv('from,to\r\n/a,/b\r\n')).toEqual([
      ['from', 'to'],
      ['/a', '/b'],
    ]);
  });

  it('drops blank lines between rows', () => {
    expect(parseCsv('from,to\n/a,/b\n\n/c,/d\n')).toEqual([
      ['from', 'to'],
      ['/a', '/b'],
      ['/c', '/d'],
    ]);
  });
});
