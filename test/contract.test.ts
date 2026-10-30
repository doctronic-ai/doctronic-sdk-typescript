// The generator's reading of the contract (scripts/contract.mjs), on the pinned copy and on
// variants of it built here.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import openapiTS, { astToString } from 'openapi-typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  describeOperations,
  describeStreamEvents,
  describeWebhooks,
  EVENT_SCHEMA_EXTENSION,
  loadContract,
  PINNED_CONTRACT,
  RETRYABLE_CODES_EXTENSION,
  sdkContract,
  type Contract,
  type OperationDescription,
} from '../scripts/contract.mjs';
import { streamEventFields, webhookEvents } from '../src/generated/events.js';
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

  it('skips only the browser-only embed operations', () => {
    expect(sdkContract(pinned).skipped).toEqual([
      'GET /embed/config/',
      'POST /embed/sessions/',
      'POST /embed/sessions/refresh/',
      'GET /embed/chats/{chatId}/offramps/{kind}/',
      'GET /embed/go/{ref}/',
      'POST /embed/chats/{chatId}/rating/',
      'PATCH /embed/chats/{chatId}/rating/',
    ]);
  });

  it('is returned unchanged when there is nothing to skip', () => {
    const orgOnly = copy(pinned);
    for (const path of Object.keys(orgOnly.paths as Json)) {
      if (path.startsWith('/embed/')) delete orgOnly.paths[path];
    }
    const { contract, skipped } = sdkContract(orgOnly);
    expect(skipped).toEqual([]);
    expect(contract).toBe(orgOnly);
  });
});

describe('operations without the organization token', () => {
  it('are skipped', () => {
    const { contract, skipped } = sdkContract(withSessionOperations(pinned));
    const before = sdkContract(pinned).skipped;
    expect(skipped.filter((key) => !before.includes(key))).toEqual([
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
  const generated = ['schema.ts', 'operations.ts', 'events.ts'].map(
    (name) => new URL(`../src/generated/${name}`, import.meta.url),
  );
  const outputs = () => generated.map((file) => readFileSync(file, 'utf8'));

  // Runs the generator on `contract` and returns what it printed to stderr. It must fail.
  function failedRun(contract: Json): string {
    const dir = mkdtempSync(join(tmpdir(), 'doctronic-contract-'));
    try {
      const path = join(dir, 'contract.json');
      writeFileSync(path, JSON.stringify(contract));
      execFileSync(process.execPath, [script, '--contract', path], { stdio: 'pipe' });
    } catch (error) {
      expect((error as { status?: number }).status).toBe(1);
      return String((error as { stderr?: Buffer }).stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    throw new Error('npm run generate succeeded');
  }

  it('fails, and writes nothing, without the stream events or the webhooks', () => {
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
});
