// The generator's reading of the contract (scripts/contract.mjs), on the pinned copy and on
// variants of it built here.

import openapiTS, { astToString } from 'openapi-typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  describeOperations,
  loadContract,
  PINNED_CONTRACT,
  RETRYABLE_CODES_EXTENSION,
  sdkContract,
  type Contract,
  type OperationDescription,
} from '../scripts/contract.mjs';
import { operations } from '../src/generated/operations.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let pinned: Contract;

beforeAll(async () => {
  pinned = await loadContract(PINNED_CONTRACT);
});

const copy = (contract: Contract): Json => structuredClone<Json>(contract);
const describe_ = (contract: Contract): OperationDescription[] =>
  describeOperations(sdkContract(contract).contract);
const byKey = (contract: Contract) => new Map(describe_(contract).map((op) => [op.key, op]));

// Operations that don't take the organization's token, like the browser-only ones the contract
// is adding: a session token of their own, no token at all, or an alternative to the org token.
function withSessionOperations(contract: Contract): Json {
  const next = copy(contract);
  next.components.securitySchemes.SessionToken = { type: 'http', scheme: 'bearer' };
  const response = {
    description: 'OK',
    content: { 'application/json': { schema: { type: 'object' } } },
  };
  next.paths['/session/config/'] = { get: { security: [], responses: { '200': response } } };
  next.paths['/session/refresh/'] = {
    post: { security: [{ SessionToken: [] }], responses: { '200': response } },
  };
  // A path where only one method takes the org token.
  next.paths['/chats/'].delete = {
    security: [{ SessionToken: [] }],
    responses: { '204': { description: 'Deleted' } },
  };
  // An org operation that also accepts the session token keeps its org facts.
  const create = next.paths['/chats/'].post as Json;
  create.security = [...(create.security as unknown[]), { SessionToken: [] }];
  return next;
}

describe('the pinned contract', () => {
  it('generates the committed operations', () => {
    const generated = Object.fromEntries(describe_(pinned).map(({ key, ...spec }) => [key, spec]));
    expect(generated).toEqual(operations);
  });

  it('has no operations to skip', () => {
    const { contract, skipped } = sdkContract(pinned);
    expect(skipped).toEqual([]);
    expect(contract).toBe(pinned);
  });
});

describe('operations without the organization token', () => {
  it('are skipped', () => {
    const { contract, skipped } = sdkContract(withSessionOperations(pinned));
    expect(skipped).toEqual(['DELETE /chats/', 'GET /session/config/', 'POST /session/refresh/']);
    const paths = contract.paths as Json;
    expect(paths['/session/config/']).toBeUndefined();
    expect(paths['/session/refresh/']).toBeUndefined();
    expect(Object.keys(paths['/chats/'] as Json)).toEqual(['post', 'get']);
  });

  it('leave the output for the other operations unchanged', async () => {
    const extended = withSessionOperations(pinned);
    expect(describe_(extended)).toEqual(describe_(pinned));

    // The same options as scripts/generate.mjs.
    const generate = async (contract: Contract) =>
      astToString(
        await openapiTS(sdkContract(contract).contract as never, {
          defaultNonNullable: false,
          silent: true,
        }),
      );
    expect(await generate(extended)).toBe(await generate(pinned));
  });

  it('fail the generator when the contract has no org token scheme', () => {
    const broken = copy(pinned);
    delete broken.components.securitySchemes.HTTPBearer;
    expect(() => sdkContract(broken)).toThrow(/HTTPBearer/);
  });
});

describe(`409 responses with ${RETRYABLE_CODES_EXTENSION}`, () => {
  const KEY = 'POST /appointments/scheduled/';
  const MISMATCH = 'error.idempotency.payload_mismatch';
  const CONCURRENT = 'error.idempotency.concurrent_request';

  function withConflicts(contract: Contract, retryable?: unknown): Json {
    const next = copy(contract);
    const conflict = next.paths['/appointments/scheduled/'].post.responses['409'] as Json;
    const media = conflict.content['application/json'] as Json;
    media.examples = {
      ...(media.examples as Json),
      mismatch: { value: { code: MISMATCH, message: 'Different body.' } },
      concurrent: { value: { code: CONCURRENT, message: 'In progress.' } },
    };
    if (retryable !== undefined) conflict[RETRYABLE_CODES_EXTENSION] = retryable;
    return next;
  }

  it('lists the retryable codes next to every documented code', () => {
    const spec = byKey(withConflicts(pinned, [CONCURRENT])).get(KEY);
    expect(spec?.conflictCodes).toEqual(expect.arrayContaining([MISMATCH, CONCURRENT]));
    expect(spec?.retryableConflictCodes).toEqual([CONCURRENT]);
  });

  it('leaves the field out when the response has no extension', () => {
    const spec = byKey(withConflicts(pinned)).get(KEY);
    expect(spec?.conflictCodes).toEqual(expect.arrayContaining([MISMATCH, CONCURRENT]));
    expect(spec).not.toHaveProperty('retryableConflictCodes');
  });

  it('reads the extension through a $ref', () => {
    const next = withConflicts(pinned, [CONCURRENT]);
    const responses = next.paths['/appointments/scheduled/'].post.responses as Json;
    next.components.responses = {
      ...(next.components.responses as Json),
      Conflict: responses['409'],
    };
    responses['409'] = { $ref: '#/components/responses/Conflict' };
    expect(byKey(next).get(KEY)?.retryableConflictCodes).toEqual([CONCURRENT]);
  });

  it('fails the generator on a malformed extension', () => {
    for (const value of [CONCURRENT, [CONCURRENT, 7], [''], { code: CONCURRENT }]) {
      expect(() => describe_(withConflicts(pinned, value))).toThrow(RETRYABLE_CODES_EXTENSION);
    }
  });
});
