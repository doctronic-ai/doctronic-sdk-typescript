// The generator's reading of the contract (scripts/contract.mjs), on the pinned copy and on
// variants of it built here, for both profiles: the server SDK and the browser package.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import openapiTS, { astToString } from 'openapi-typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import * as browserEvents from '../packages/browser/src/generated/events.js';
import { operations as browserOperations } from '../packages/browser/src/generated/operations.js';
import {
  browserContract,
  describeOperations,
  describeStreamEvents,
  describeWebhooks,
  EMBED_SESSION_SCHEME,
  EVENT_SCHEMA_EXTENSION,
  loadContract,
  PINNED_CONTRACT,
  resolveRef,
  RETRYABLE_CODES_EXTENSION,
  sdkContract,
  type Contract,
  type OperationDescription,
} from '../scripts/contract.mjs';
import { streamEventFields, webhookEvents } from '../src/generated/events.js';
import { operations } from '../src/generated/operations.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let pinned: Contract;
// The pinned contract without the embed API, whether or not the docs publish it yet.
let base: Json;

beforeAll(async () => {
  pinned = await loadContract(PINNED_CONTRACT);
  base = withoutEmbed(pinned);
});

const copy = (contract: Contract): Json => structuredClone<Json>(contract);
const describe_ = (contract: Contract): OperationDescription[] =>
  describeOperations(sdkContract(contract).contract);
const byKey = (contract: Contract) => new Map(describe_(contract).map((op) => [op.key, op]));
// The types, with the same options as scripts/generate.mjs.
const typesOf = async (contract: Contract): Promise<string> =>
  astToString(await openapiTS(contract as never, { defaultNonNullable: false, silent: true }));
const generateSchema = (contract: Contract) => typesOf(sdkContract(contract).contract);
const generateBrowserSchema = (contract: Contract) => typesOf(browserContract(contract).contract);
const committed = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// The embed API's own markers in the contract: its paths, its session token's scheme, the
// responses and request fields only that token gets, and its sentences in the chat operations'
// descriptions, word for word.
const EMBED_PATH = '/embed/';
const EMBED_SCHEME = 'EmbedSessionToken';
const EMBED_RESPONSE = 'Sent for embed session tokens only.';
const EMBED_FIELD = 'Embed sessions only:';
const EMBED_PROSE: [string, string][] = [
  [
    ', or an embed\nsession token from `POST /embed/sessions/` alone (it carries its user, so no ' +
      'user-id header).',
    '.',
  ],
  [
    ' Embed chats\n  only get Doctronic visit CTAs when their deployment offers Doctronic visits.',
    '',
  ],
  [
    '\nWhile the embed deployment is paused, embed requests answer `503 error.embed.paused`, and ' +
      'an open\nembed stream ends with an `error` event whose `errorCode` is `error.embed.paused`.',
    '',
  ],
];
const RUNTIME_SECURITY = 'x-doctronic-runtime-security';
const SECURITY_FIELDS = ['security', RUNTIME_SECURITY];

// The `#/components/...` refs anywhere under `node`.
function refsUnder(node: unknown, refs = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((child) => refsUnder(child, refs));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') refs.add(value);
      else refsUnder(value, refs);
    }
  }
  return refs;
}

// The operation keys under the embed API's paths, in the order sdkContract reports them.
const embedOperations = (contract: Contract): string[] =>
  Object.entries(contract.paths as Json)
    .filter(([path]) => path.startsWith(EMBED_PATH))
    .flatMap(([path, item]) =>
      ['get', 'put', 'post', 'patch', 'delete', 'head', 'options', 'trace']
        .filter((method) => (item as Json)[method])
        .map((method) => `${method.toUpperCase()} ${path}`),
    );

// Removes the embed API by those markers, without sdkContract, so the tests below compare the
// generator's output with a contract that never had it. Components that only the embed API
// referenced go too: those something referenced before and nothing references now.
function withoutEmbed(contract: Contract): Json {
  const next = copy(contract);
  const referencedBefore = refsUnder(next);
  for (const path of Object.keys(next.paths)) {
    if (path.startsWith(EMBED_PATH)) delete next.paths[path];
  }
  delete next.components.securitySchemes[EMBED_SCHEME];
  for (const item of Object.values(next.paths as Json)) {
    for (const operation of Object.values(item as Json)) {
      if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
      for (const field of SECURITY_FIELDS) {
        if (!Array.isArray(operation[field])) continue;
        operation[field] = operation[field].filter(
          (requirement: Json) => !Object.hasOwn(requirement, EMBED_SCHEME),
        );
      }
      for (const [status, response] of Object.entries(operation.responses as Json)) {
        const { description } = (resolveRef(next, response) ?? {}) as { description?: string };
        if (description?.endsWith(EMBED_RESPONSE)) {
          delete operation.responses[status];
        }
      }
      if (typeof operation.description === 'string') {
        operation.description = EMBED_PROSE.reduce(
          (text: string, [sentence, replacement]) => text.replaceAll(sentence, replacement),
          operation.description,
        );
      }
    }
  }
  for (const schema of Object.values(next.components.schemas as Json)) {
    for (const [name, property] of Object.entries(((schema as Json).properties ?? {}) as Json)) {
      const { description } = property as { description?: string };
      if (description?.startsWith(EMBED_FIELD)) delete schema.properties[name];
    }
  }
  for (;;) {
    const referenced = refsUnder(next);
    const unused = [...referencedBefore].filter(
      (ref) => !referenced.has(ref) && resolveRef(next, { $ref: ref }) !== undefined,
    );
    if (unused.length === 0) return next;
    for (const ref of unused) {
      const [, , type, name] = ref.split('/') as [string, string, string, string];
      delete next.components[type][name];
    }
  }
}

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
  // A path where only some methods take the org token, including methods the client never sends.
  next.paths['/chats/'].delete = {
    security: [{ SessionToken: [] }],
    responses: { '204': { description: 'Deleted' } },
  };
  next.paths['/chats/'].head = {
    security: [{ SessionToken: [] }],
    responses: { '200': { description: 'OK' } },
  };
  next.paths['/chats/'].options = { security: [], responses: { '204': { description: 'OK' } } };
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

  it('generates the committed types', async () => {
    expect(committed('src/generated/schema.ts').endsWith(await generateSchema(pinned))).toBe(true);
  });

  // The embed API may or may not be published; anything else skipped is a new operation the SDK
  // would silently drop.
  it('skips nothing but the embed API', () => {
    expect(sdkContract(pinned).skipped).toEqual(embedOperations(pinned));
  });

  // Not its security scheme: no $ref reaches one, and openapi-typescript generates nothing from it.
  it('leaves out exactly the embed API, but for its security scheme', () => {
    const { securitySchemes } = pinned.components as Json;
    expect(sdkContract(pinned).contract).toEqual({
      ...base,
      components: { ...base.components, securitySchemes },
    });
  });

  it('generates the same code as without the embed API', async () => {
    const { contract } = sdkContract(pinned);
    expect(describe_(pinned)).toEqual(describe_(base));
    expect(describeStreamEvents(contract)).toEqual(describeStreamEvents(base));
    expect(describeWebhooks(contract)).toEqual(describeWebhooks(base));
    expect(await generateSchema(pinned)).toBe(await generateSchema(base));
  });
});

describe('the pinned contract without the embed API', () => {
  it('has nothing to leave out', () => {
    const { contract, skipped, trimmed } = sdkContract(base);
    expect(skipped).toEqual([]);
    expect(Object.values(trimmed).flat()).toEqual([]);
    expect(contract).toBe(base);
  });
});

describe('operations without the organization token', () => {
  it('are skipped', () => {
    const { contract, skipped } = sdkContract(withSessionOperations(base));
    expect(skipped).toEqual([
      'DELETE /chats/',
      'HEAD /chats/',
      'OPTIONS /chats/',
      'GET /session/config/',
      'POST /session/refresh/',
    ]);
    const paths = contract.paths as Json;
    expect(paths['/session/config/']).toBeUndefined();
    expect(paths['/session/refresh/']).toBeUndefined();
    expect(Object.keys(paths['/chats/'] as Json)).toEqual(['post', 'get']);
  });

  it('leave the output for the other operations unchanged', async () => {
    const extended = withSessionOperations(base);
    expect(describe_(extended)).toEqual(describe_(base));
    expect(await generateSchema(extended)).toBe(await generateSchema(base));
  });

  it('fail the generator when the contract has no org token scheme', () => {
    const broken = copy(pinned);
    delete broken.components.securitySchemes.HTTPBearer;
    expect(() => sdkContract(broken)).toThrow(/HTTPBearer/);
  });
});

// The embed API as the unhidden contract describes it, added to the pinned one without it:
// browser-only operations on their own session token, the components only they use, and what the
// chat operations document for that token alone.
const EMBED_OPERATIONS = [
  'GET /embed/config/',
  'POST /embed/sessions/',
  'POST /embed/sessions/refresh/',
];
const CHAT_OPERATIONS: [string, string][] = [
  ['/chats/', 'post'],
  ['/chats/{chatId}/', 'get'],
  ['/chats/{chatId}/messages/', 'get'],
  ['/chats/{chatId}/stream/', 'post'],
];
const EMBED_COMPONENTS = [
  '#/components/schemas/CreateEmbedSessionRequest',
  '#/components/schemas/EmbedConfigResponse',
  '#/components/schemas/EmbedIntakeRequest',
  '#/components/schemas/EmbedSessionResponse',
  '#/components/responses/EmbedRateLimited',
];

function withEmbed(contract: Contract): Json {
  const next = copy(contract);
  const schemas = next.components.schemas as Json;
  next.components.securitySchemes.EmbedSessionToken = { type: 'http', scheme: 'bearer' };
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const ok = (schema: Json) => ({
    description: 'OK',
    content: { 'application/json': { schema } },
  });
  schemas.EmbedIntakeRequest = { type: 'object', properties: { state: ref('State') } };
  schemas.CreateEmbedSessionRequest = {
    type: 'object',
    required: ['key', 'intake'],
    properties: { key: { type: 'string' }, intake: ref('EmbedIntakeRequest') },
  };
  schemas.EmbedSessionResponse = { type: 'object', properties: { token: { type: 'string' } } };
  // Uses a component the SDK's operations use too, which stays.
  schemas.EmbedConfigResponse = { type: 'object', properties: { states: ref('State') } };
  next.paths['/embed/config/'] = {
    get: { security: [], responses: { '200': ok(ref('EmbedConfigResponse')) } },
  };
  next.paths['/embed/sessions/'] = {
    post: {
      security: [],
      requestBody: {
        content: { 'application/json': { schema: ref('CreateEmbedSessionRequest') } },
      },
      responses: { '200': ok(ref('EmbedSessionResponse')) },
    },
  };
  next.paths['/embed/sessions/refresh/'] = {
    post: {
      security: [{ EmbedSessionToken: [] }],
      responses: { '200': ok(ref('EmbedSessionResponse')) },
    },
  };

  const rateLimited = {
    description: 'Too many requests right now. Sent for embed session tokens only.',
    headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 } } },
    content: {
      'application/json': {
        example: { code: 'error.embed.rate_limited', message: 'Too many requests right now.' },
      },
    },
  };
  next.components.responses.EmbedRateLimited = rateLimited;
  for (const [index, [path, method]] of CHAT_OPERATIONS.entries()) {
    const operation = next.paths[path][method] as Json;
    for (const field of ['security', 'x-doctronic-runtime-security']) {
      operation[field] = [...(operation[field] as unknown[]), { EmbedSessionToken: [] }];
    }
    // Inline on some operations, a $ref on the others.
    operation.responses['429'] =
      index % 2
        ? { $ref: '#/components/responses/EmbedRateLimited' }
        : structuredClone(rateLimited);
  }
  for (const path of ['/chats/{chatId}/', '/chats/{chatId}/stream/']) {
    const operation = next.paths[path][path.endsWith('stream/') ? 'post' : 'get'] as Json;
    operation.description = (operation.description as string).replace(
      '(both required).',
      '(both required), or an embed\nsession token from `POST /embed/sessions/` alone (it carries ' +
        'its user, so no user-id header).',
    );
  }
  const stream = next.paths['/chats/{chatId}/stream/'].post as Json;
  stream.description = (stream.description as string).replace(
    'optional `text` label.',
    'optional `text` label. Embed chats\nonly get Doctronic visit CTAs when their deployment ' +
      'offers Doctronic visits.',
  );
  stream.description +=
    '\nWhile the embed deployment is paused, embed requests answer `503`, and ' +
    'an open\nembed stream ends with an `error` event whose `errorCode` is `error.embed.paused`.';
  (schemas.CreateChatRequest as Json).properties.starterPromptIndex = {
    anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    description: 'Embed sessions only: the starter prompt the visitor picked.',
  };
  return next;
}

describe('a contract with the embed API', () => {
  it('skips exactly the embed operations', () => {
    expect(sdkContract(withEmbed(base)).skipped).toEqual(EMBED_OPERATIONS);
  });

  it('generates the same code as without it', async () => {
    const embed = withEmbed(base);
    expect(describe_(embed)).toEqual(describe_(base));
    const { contract } = sdkContract(embed);
    expect(describeStreamEvents(contract)).toEqual(describeStreamEvents(base));
    expect(describeWebhooks(contract)).toEqual(describeWebhooks(base));
    expect(await generateSchema(embed)).toBe(await generateSchema(base));
  });

  it('leaves out what only the embed session token gets', () => {
    const keys = CHAT_OPERATIONS.map(([path, method]) => `${method.toUpperCase()} ${path}`);
    const { contract, trimmed } = sdkContract(withEmbed(base));
    const { components, ...parts } = trimmed;
    expect(parts).toEqual({
      alternatives: keys,
      responses: keys.map((key) => `429 ${key}`),
      fields: ['CreateChatRequest.starterPromptIndex'],
      descriptions: ['GET /chats/{chatId}/', 'POST /chats/{chatId}/stream/'],
      webhooks: [],
    });
    expect([...components].sort()).toEqual([...EMBED_COMPONENTS].sort());
    const paths = contract.paths as Json;
    for (const [path, method] of CHAT_OPERATIONS) {
      expect(paths[path][method].security).toEqual([{ HTTPBearer: [], XDoctronicUserID: [] }]);
      expect(paths[path][method][RUNTIME_SECURITY]).toEqual([
        { HTTPBearer: [], XDoctronicUserID: [] },
      ]);
    }
  });

  it('keeps components that nothing referenced, and leaves its input alone', () => {
    const embed = withEmbed(base);
    embed.components.schemas.Unreferenced = { type: 'string' };
    const before = structuredClone(embed);
    const { contract } = sdkContract(embed);
    expect((contract.components as Json).schemas.Unreferenced).toEqual({ type: 'string' });
    expect((contract.components as Json).schemas.State).toBeDefined();
    expect(embed).toEqual(before);
  });

  it('keeps what an unreferenced component references, even if only embed used it too', async () => {
    const embed = withEmbed(base);
    embed.components.schemas.Unreferenced = {
      type: 'object',
      properties: { session: { $ref: '#/components/schemas/EmbedSessionResponse' } },
    };
    const { contract, trimmed } = sdkContract(embed);
    expect((contract.components as Json).schemas.EmbedSessionResponse).toBeDefined();
    expect(trimmed.components).not.toContain('#/components/schemas/EmbedSessionResponse');
    await expect(generateSchema(embed)).resolves.toContain('Unreferenced');
  });

  it('keeps the target of an alias a kept operation uses, even if embed used the target too', () => {
    const embed = withEmbed(base);
    const responses = embed.components.responses as Json;
    responses.Alias = { $ref: '#/components/responses/Target' };
    responses.Target = { description: 'Shared.' };
    (embed.paths['/chats/{chatId}/'].get as Json).responses['418'] = {
      $ref: '#/components/responses/Alias',
    };
    (embed.paths['/embed/config/'].get as Json).responses['418'] = {
      $ref: '#/components/responses/Target',
    };
    const { contract, trimmed } = sdkContract(embed);
    const kept = (contract.components as Json).responses as Json;
    expect(kept.Alias).toBeDefined();
    expect(kept.Target).toBeDefined();
    expect(trimmed.components).not.toContain('#/components/responses/Target');
  });
});

// The embed API in the pinned contract, which the browser profile generates from.
const PINNED_EMBED_OPERATIONS = [
  'GET /embed/config/',
  'POST /embed/sessions/',
  'POST /embed/sessions/refresh/',
  'GET /embed/chats/{chatId}/offramps/{kind}/',
  'GET /embed/go/{ref}/',
  'POST /embed/chats/{chatId}/rating/',
  'PATCH /embed/chats/{chatId}/rating/',
];
// The embed bootstrap, which takes no credential at all.
const PUBLIC_OPERATIONS = ['GET /embed/config/', 'POST /embed/sessions/', 'GET /embed/go/{ref}/'];
const CHAT_KEYS = CHAT_OPERATIONS.map(([path, method]) => `${method.toUpperCase()} ${path}`);

describe('the embed API in the pinned contract, for the server SDK', () => {
  it('skips exactly the embed operations', () => {
    expect(sdkContract(pinned).skipped).toEqual(PINNED_EMBED_OPERATIONS);
  });

  it('leaves out what only the embed session token gets', () => {
    const { contract, trimmed } = sdkContract(pinned);
    const { components, ...parts } = trimmed;
    expect(parts).toEqual({
      alternatives: CHAT_KEYS,
      responses: CHAT_KEYS.map((key) => `429 ${key}`),
      fields: ['CreateChatRequest.starterPromptIndex'],
      descriptions: ['GET /chats/{chatId}/', 'POST /chats/{chatId}/stream/'],
      webhooks: [],
    });
    // Only the embed operations used them.
    expect(components.length).toBeGreaterThan(0);
    const kept = refsUnder(contract);
    for (const ref of components) expect(kept.has(ref)).toBe(false);
    expect(components).toContain('#/components/schemas/EmbedSessionResponse');
  });
});

describe('the browser profile', () => {
  const BROWSER_OPERATIONS = [...CHAT_KEYS, ...PINNED_EMBED_OPERATIONS];

  it('generates exactly the embed session and public operations', () => {
    const { contract, skipped } = browserContract(pinned);
    const described = describeOperations(contract, 'browser');
    expect(described.map(({ key }) => key)).toEqual(BROWSER_OPERATIONS);
    // Every other operation takes only the organization's token.
    const serverOnly = describe_(pinned)
      .map(({ key }) => key)
      .filter((key) => !CHAT_KEYS.includes(key));
    expect(skipped).toEqual(serverOnly);
    expect(described.filter((op) => !op.sessionToken).map(({ key }) => key)).toEqual(
      PUBLIC_OPERATIONS,
    );
    for (const op of described) expect(op).not.toHaveProperty('userScoped');
  });

  it('generates the committed operations, stream events, and types', async () => {
    const { contract } = browserContract(pinned);
    const generated = Object.fromEntries(
      describeOperations(contract, 'browser').map(({ key, ...spec }) => [key, spec]),
    );
    expect(generated).toEqual(browserOperations);
    const { operations: streams, events } = describeStreamEvents(contract, 'browser');
    expect(streams).toEqual(['POST /chats/{chatId}/stream/']);
    expect(Object.fromEntries(events.map(({ type, fields }) => [type, fields]))).toEqual(
      browserEvents.streamEventFields,
    );
    const schema = committed('packages/browser/src/generated/schema.ts');
    expect(schema.endsWith(await generateBrowserSchema(pinned))).toBe(true);
  });

  it('keeps only the embed session token on the chat operations', () => {
    const paths = browserContract(pinned).contract.paths as Json;
    for (const [path, method] of CHAT_OPERATIONS) {
      expect(paths[path][method].security).toEqual([{ [EMBED_SESSION_SCHEME]: [] }]);
      expect(paths[path][method][RUNTIME_SECURITY]).toEqual([{ [EMBED_SESSION_SCHEME]: [] }]);
    }
    for (const key of PUBLIC_OPERATIONS) {
      const [method, path] = key.split(' ') as [string, string];
      expect(paths[path][method.toLowerCase()].security).toEqual([]);
    }
  });

  it('has no webhooks', async () => {
    const { contract, trimmed } = browserContract(pinned);
    expect(contract.webhooks).toBeUndefined();
    expect(trimmed.webhooks).toEqual(describeWebhooks(pinned).map(({ event }) => event));
    expect(await generateBrowserSchema(pinned)).toContain(
      'export type webhooks = Record<string, never>;',
    );
    expect(Object.keys(browserEvents)).toEqual(['streamEventFields']);
  });

  it('keeps only the components its operations reach', () => {
    const next = copy(pinned);
    next.components.schemas.Unreferenced = { type: 'string' };
    const { contract, trimmed } = browserContract(next);
    const components = contract.components as Json;
    const defined = Object.entries(components)
      .filter(([type]) => type !== 'securitySchemes')
      .flatMap(([type, entries]) =>
        Object.keys(entries as Json).map((name) => `#/components/${type}/${name}`),
      );
    // Everything the paths reach, directly or through other components.
    const reached = refsUnder(contract.paths);
    for (const ref of reached) refsUnder(resolveRef(contract, { $ref: ref }), reached);
    expect(new Set(defined)).toEqual(reached);
    expect(Object.keys(components.securitySchemes as Json)).toEqual([EMBED_SESSION_SCHEME]);
    for (const name of ['Unreferenced', 'CreateUserRequest', 'ArtifactReadyPayload']) {
      expect(trimmed.components).toContain(`#/components/schemas/${name}`);
    }
    expect(components.schemas.EmbedSessionResponse).toBeDefined();
  });

  it('is deterministic and leaves its input alone', async () => {
    const before = structuredClone(pinned);
    expect(browserContract(pinned)).toEqual(browserContract(pinned));
    expect(await generateBrowserSchema(pinned)).toBe(await generateBrowserSchema(pinned));
    expect(pinned).toEqual(before);
  });

  it('keeps any public operation, and leaves out other credentials', () => {
    const { skipped } = browserContract(withSessionOperations(pinned));
    const keys = describeOperations(
      browserContract(withSessionOperations(pinned)).contract,
      'browser',
    ).map(({ key }) => key);
    expect(keys).toContain('GET /session/config/');
    expect(skipped).toContain('POST /session/refresh/');
    expect(skipped).toContain('DELETE /chats/');
    expect(keys).not.toContain('OPTIONS /chats/');
  });

  it(`fails without the ${EMBED_SESSION_SCHEME} scheme, and the server profile still works`, () => {
    const next = copy(pinned);
    delete next.components.securitySchemes[EMBED_SESSION_SCHEME];
    expect(() => browserContract(next)).toThrow(
      `The contract has no ${EMBED_SESSION_SCHEME} security scheme, so the browser types can't be generated.`,
    );
    expect(describe_(next)).toEqual(describe_(pinned));
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
    if (retryable === undefined) delete conflict[RETRYABLE_CODES_EXTENSION];
    else conflict[RETRYABLE_CODES_EXTENSION] = retryable;
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

describe('stream events', () => {
  const streamMedia = (contract: Json) =>
    contract.paths['/chats/{chatId}/stream/'].post.responses['200'].content[
      'text/event-stream'
    ] as Json;
  const schemas = (contract: Json) => contract.components.schemas as Json;
  const fieldsOf = (contract: Contract, type: string) =>
    describeStreamEvents(contract).events.find((event) => event.type === type)?.fields;

  it('generates the committed event fields', () => {
    const { operations: streams, union, property, events } = describeStreamEvents(pinned);
    expect({ streams, union, property }).toEqual({
      streams: ['POST /chats/{chatId}/stream/'],
      union: 'StreamChatEvent',
      property: 'type',
    });
    expect(Object.fromEntries(events.map(({ type, fields }) => [type, fields]))).toEqual(
      streamEventFields,
    );
  });

  it('reads open enums as strings and keeps a nullable field nullable', () => {
    const next = copy(pinned);
    const guardian = schemas(next).StreamChatGuardianEvent as Json;
    guardian.required = [...(guardian.required as string[]), 'title'];
    expect(fieldsOf(next, 'guardian')).toEqual({
      guardianId: ['string'],
      message: ['string'],
      endsConversation: ['boolean'],
      category: ['string'],
      title: ['null', 'string'],
    });
  });

  it(`fails the generator without ${EVENT_SCHEMA_EXTENSION}`, () => {
    const next = copy(pinned);
    delete streamMedia(next)[EVENT_SCHEMA_EXTENSION];
    expect(() => describeStreamEvents(next)).toThrow(
      `POST /chats/{chatId}/stream/: the text/event-stream response has no ${EVENT_SCHEMA_EXTENSION} $ref`,
    );
  });

  it('fails the generator when the union has no discriminator mapping', () => {
    const next = copy(pinned);
    delete (schemas(next).StreamChatEvent as Json).discriminator;
    expect(() => describeStreamEvents(next)).toThrow(/StreamChatEvent must be a oneOf/);
  });

  it('fails the generator when the mapping and oneOf disagree', () => {
    const next = copy(pinned);
    const union = schemas(next).StreamChatEvent as Json;
    union.oneOf = (union.oneOf as { $ref: string }[]).filter(
      (member) => !member.$ref.endsWith('ErrorEvent'),
    );
    expect(() => describeStreamEvents(next)).toThrow(/StreamChatErrorEvent, which isn't in oneOf/);
  });

  it("fails the generator when an event's discriminator isn't its mapped value", () => {
    const next = copy(pinned);
    (schemas(next).StreamChatErrorEvent as Json).properties.type.const = 'stream.error';
    expect(() => describeStreamEvents(next)).toThrow(
      'StreamChatErrorEvent.type must be the constant "error"',
    );
  });

  it("fails the generator on a required field whose JSON type it can't tell", () => {
    const next = copy(pinned);
    (schemas(next).StreamChatErrorEvent as Json).properties.errorCode = {};
    expect(() => describeStreamEvents(next)).toThrow(/StreamChatErrorEvent.errorCode/);
  });
});

describe('webhooks', () => {
  it('generates the committed webhook events', () => {
    expect(describeWebhooks(pinned)).toEqual([
      { event: 'appointment.call_ended', component: 'AppointmentCallEndedPayload' },
      {
        event: 'appointment.practitioner_joined',
        component: 'AppointmentPractitionerJoinedPayload',
      },
      { event: 'appointment.waiting_room_ready', component: 'AppointmentWaitingRoomReadyPayload' },
      { event: 'artifact.ready', component: 'ArtifactReadyPayload' },
    ]);
    expect(describeWebhooks(pinned).map(({ event }) => event)).toEqual(webhookEvents);
  });

  it('fails the generator without webhooks', () => {
    const next = copy(pinned);
    delete next.webhooks;
    expect(() => describeWebhooks(next)).toThrow(/The contract has no webhooks/);
  });

  it('fails the generator when a payload stops requiring occurredAt', () => {
    const next = copy(pinned);
    const payload = next.components.schemas.ArtifactReadyPayload as Json;
    payload.required = (payload.required as string[]).filter((field) => field !== 'occurredAt');
    expect(() => describeWebhooks(next)).toThrow(
      "webhooks.artifact.ready: ArtifactReadyPayload doesn't require occurredAt",
    );
  });

  it("fails the generator when a payload's event isn't the webhook's name", () => {
    const next = copy(pinned);
    next.webhooks['artifact.ready'].post.requestBody.content['application/json'].schema.$ref =
      '#/components/schemas/AppointmentCallEndedPayload';
    expect(() => describeWebhooks(next)).toThrow(
      'AppointmentCallEndedPayload.event must be the constant "artifact.ready"',
    );
  });
});

describe('npm run generate', () => {
  const script = new URL('../scripts/generate.mjs', import.meta.url).pathname;
  const generated = ['src/generated', 'packages/browser/src/generated'].flatMap((dir) =>
    ['schema.ts', 'operations.ts', 'events.ts'].map(
      (name) => new URL(`../${dir}/${name}`, import.meta.url),
    ),
  );
  const outputs = () => generated.map((file) => readFileSync(file, 'utf8'));

  // Runs the generator on `contract` and returns what it printed to stderr. It must fail.
  function failedRun(contract: Json, args: string[] = []): string {
    const dir = mkdtempSync(join(tmpdir(), 'doctronic-contract-'));
    try {
      const path = join(dir, 'contract.json');
      writeFileSync(path, JSON.stringify(contract));
      execFileSync(process.execPath, [script, '--contract', path, ...args], { stdio: 'pipe' });
    } catch (error) {
      expect((error as { status?: number }).status).toBe(1);
      return String((error as { stderr?: Buffer }).stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    throw new Error('npm run generate succeeded');
  }

  it('fails, and writes nothing for either package, without the stream events or the webhooks', () => {
    const before = outputs();

    const noEvents = copy(pinned);
    delete noEvents.paths['/chats/{chatId}/stream/'].post.responses['200'].content[
      'text/event-stream'
    ][EVENT_SCHEMA_EXTENSION];
    expect(failedRun(noEvents)).toMatch(/has no x-doctronic-event-schema \$ref/);

    const noWebhooks = copy(pinned);
    delete noWebhooks.webhooks;
    expect(failedRun(noWebhooks)).toMatch(/The contract has no webhooks/);

    expect(outputs()).toEqual(before);
  });

  it(`fails, and writes nothing for either package, without the ${EMBED_SESSION_SCHEME} scheme`, () => {
    const before = outputs();
    const noEmbed = copy(pinned);
    delete noEmbed.components.securitySchemes[EMBED_SESSION_SCHEME];
    for (const args of [[], ['--profile', 'all'], ['--profile', 'browser']]) {
      expect(failedRun(noEmbed, args)).toMatch(/no EmbedSessionToken security scheme/);
    }
    expect(outputs()).toEqual(before);
  });

  it('fails on an unknown profile', () => {
    expect(failedRun(copy(pinned), ['--profile', 'mobile'])).toMatch(
      /--profile must be one of server, browser, all/,
    );
  });
});
