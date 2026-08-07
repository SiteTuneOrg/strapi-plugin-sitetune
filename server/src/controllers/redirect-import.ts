import { readFile, unlink } from 'node:fs/promises';

import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const { ValidationError } = errors;

interface UploadedFile {
  filepath: string;
}

const redirectImport = ({ strapi }: { strapi: Core.Strapi }) => ({
  async import(ctx) {
    const uploaded = ctx.request.files?.files as UploadedFile | UploadedFile[] | undefined;

    if (!uploaded || Array.isArray(uploaded)) {
      throw new ValidationError('Upload exactly one CSV file under the "files" field.');
    }

    // koa-body's underlying multipart parser (formidable) writes uploads to
    // the OS temp dir and does NOT delete them once the request completes —
    // that cleanup is left to the application. Wrapped in try/finally so a
    // parse/import failure still cleans up rather than leaking the file.
    try {
      const csvText = await readFile(uploaded.filepath, 'utf-8');

      const report = await strapi
        .plugin('sitetune')
        .service('redirect-import')
        .importFromCsv(csvText);

      ctx.body = { data: report };
    } finally {
      await unlink(uploaded.filepath).catch(() => {});
    }
  },
});

export default redirectImport;
