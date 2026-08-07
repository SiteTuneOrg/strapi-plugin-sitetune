import type { Core } from '@strapi/strapi';

import { createRedirectWriteGuard } from './services/redirect-write-guard';

const register = async ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.documents.use(createRedirectWriteGuard(strapi));

  await strapi.service('admin::permission').actionProvider.registerMany([
    {
      section: 'plugins',
      displayName: 'Import redirects (CSV)',
      uid: 'redirect.import',
      pluginName: 'sitetune',
    },
  ]);
};

export default register;
