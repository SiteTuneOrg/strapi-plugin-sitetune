import type { Core } from '@strapi/strapi';

import { REDIRECT_UID } from '../constants';

const redirect = ({ strapi }: { strapi: Core.Strapi }) => ({
  async publicList(ctx) {
    const redirects = (await strapi.documents(REDIRECT_UID).findMany({
      filters: { enabled: true },
      fields: ['from', 'to', 'statusCode'],
    })) as unknown as Array<{ from: string; to: string; statusCode: number }>;

    ctx.body = {
      data: redirects.map(({ from, to, statusCode }) => ({
        from,
        to,
        statusCode,
      })),
    };
  },
});

export default redirect;
