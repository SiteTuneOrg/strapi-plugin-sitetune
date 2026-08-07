import type { Core } from '@strapi/strapi';

import { parseCsv } from '../utils/csv';
import { REDIRECT_UID } from '../constants';
import { VALID_STATUS_CODES } from './redirect-validation';

interface RowError {
  row: number;
  from: string;
  message: string;
}

interface ImportReport {
  successCount: number;
  errors: RowError[];
}

/**
 * Rows are created one at a time, awaited sequentially, so each row's write
 * goes through `redirect-write-guard`'s document-service middleware (see
 * `register.ts`) with every *previously imported row in this same file*
 * already committed to the database by the time the next row is checked —
 * duplicate/cycle validation already sees earlier rows in the batch, so
 * there's no separate in-memory "seen so far" check duplicating that logic
 * here.
 */
export function createRedirectImportService({ strapi }: { strapi: Core.Strapi }) {
  return {
    async importFromCsv(csvText: string): Promise<ImportReport> {
      const rows = parseCsv(csvText);
      const errors: RowError[] = [];
      let successCount = 0;

      if (rows.length === 0) {
        return { successCount, errors };
      }

      const [header, ...dataRows] = rows;
      // Case-insensitive: an Excel-authored "From,To" header is at least as
      // likely as a hand-typed "from,to" one.
      const columns = header.map((column) => column.trim().toLowerCase());

      if (!columns.includes('from') || !columns.includes('to')) {
        errors.push({
          row: 1,
          from: '',
          message: 'CSV header must include "from" and "to" columns.',
        });
        return { successCount, errors };
      }

      for (let index = 0; index < dataRows.length; index += 1) {
        const row = dataRows[index];
        // 1-based, +1 for the header row, matching what a spreadsheet user sees.
        const rowNumber = index + 2;

        const get = (column: string): string | undefined => {
          const columnIndex = columns.indexOf(column);
          return columnIndex === -1 ? undefined : row[columnIndex]?.trim();
        };

        const from = get('from');
        const to = get('to');

        if (!from || !to) {
          errors.push({
            row: rowNumber,
            from: from ?? '',
            message: 'Each row needs both "from" and "to".',
          });
          continue;
        }

        const statusCodeRaw = get('statuscode');
        let statusCode = 301;
        if (statusCodeRaw) {
          const parsed = Number(statusCodeRaw);
          if (!(VALID_STATUS_CODES as number[]).includes(parsed)) {
            errors.push({
              row: rowNumber,
              from,
              message: `statusCode must be one of ${VALID_STATUS_CODES.join(', ')} (got "${statusCodeRaw}").`,
            });
            continue;
          }
          statusCode = parsed;
        }

        const enabledRaw = get('enabled');
        let enabled = true;
        if (enabledRaw) {
          const normalized = enabledRaw.toLowerCase();
          if (normalized !== 'true' && normalized !== 'false') {
            errors.push({
              row: rowNumber,
              from,
              message: `enabled must be "true" or "false" (got "${enabledRaw}").`,
            });
            continue;
          }
          enabled = normalized === 'true';
        }

        try {
          await strapi.documents(REDIRECT_UID).create({
            data: { from, to, statusCode, enabled },
          });
          successCount += 1;
        } catch (error) {
          errors.push({
            row: rowNumber,
            from,
            message: error instanceof Error ? error.message : 'Unknown error.',
          });
        }
      }

      return { successCount, errors };
    },
  };
}
