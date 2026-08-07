import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

import { REDIRECT_UID } from '../constants';

const { ValidationError } = errors;

const MAX_CHAIN_HOPS = 500;
const VALID_STATUS_CODES = [301, 302];

export function assertValidStatusCode(statusCode: number): void {
  if (!VALID_STATUS_CODES.includes(statusCode)) {
    throw new ValidationError(`statusCode must be one of ${VALID_STATUS_CODES.join(', ')}.`);
  }
}

export interface RedirectWriteInput {
  documentId?: string;
  from: string;
  to: string;
}

interface RedirectRow {
  documentId: string;
  from: string;
  to: string;
}

const normalize = (value: string): string => value.trim();

function assertNotSelfLoop(from: string, to: string): void {
  if (from === to) {
    throw new ValidationError('A redirect\'s "from" and "to" must differ.');
  }
}

async function assertNoDuplicateFrom(
  strapi: Core.Strapi,
  documentId: string | undefined,
  from: string
): Promise<void> {
  const matches = (await strapi.documents(REDIRECT_UID).findMany({
    filters: { from },
    fields: ['documentId'],
  })) as Array<{ documentId: string }>;

  const hasConflict = matches.some((match) => match.documentId !== documentId);

  if (hasConflict) {
    throw new ValidationError(`A redirect with from "${from}" already exists.`);
  }
}

async function assertNoCycle(
  strapi: Core.Strapi,
  documentId: string | undefined,
  from: string,
  to: string
): Promise<void> {
  const existing = (await strapi.documents(REDIRECT_UID).findMany({
    fields: ['documentId', 'from', 'to'],
  })) as unknown as RedirectRow[];

  const graph = new Map<string, string>();
  for (const row of existing) {
    if (row.documentId === documentId) continue;
    graph.set(row.from, row.to);
  }
  graph.set(from, to);

  const visited = new Set<string>([from]);
  let current = to;
  let hops = 0;

  while (graph.has(current)) {
    if (visited.has(current)) {
      throw new ValidationError(
        `Circular redirect: "${from}" eventually loops back through "${current}".`
      );
    }

    if (hops >= MAX_CHAIN_HOPS) {
      throw new ValidationError(
        `Redirect chain starting at "${from}" is too long (over ${MAX_CHAIN_HOPS} hops) — refusing to save.`
      );
    }

    visited.add(current);
    current = graph.get(current) as string;
    hops += 1;
  }
}

const redirectValidation = ({ strapi }: { strapi: Core.Strapi }) => ({
  async validateRedirectWrite(input: RedirectWriteInput): Promise<void> {
    const from = normalize(input.from);
    const to = normalize(input.to);

    assertNotSelfLoop(from, to);
    await assertNoDuplicateFrom(strapi, input.documentId, from);
    await assertNoCycle(strapi, input.documentId, from, to);
  },
});

export default redirectValidation;
