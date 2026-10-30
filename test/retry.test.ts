import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APIConnectionError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  type UserScopedClient,
} from '../src/index.js';
import { operations, type OperationSpec } from '../src/generated/operations.js';
import { MAX_RETRY_AFTER_MS, parseRetryAfter, retryDelayMs, shouldRetry } from '../src/retry.js';
import {
  apiError,
  dropConnection,
  empty,
  ok,
  startMockServer,
  truncatedBody,
  type MockServer,
} from './support/mock-server.js';

const USER_ID = 'mem_01K6JGGM2G2DB4Y9KB9H9MJJ6Q';
const CHAT_ID = 'chat_01K6JGGM2G2DB4Y9KB9H9MJJ6Q';
const chat = { id: CHAT_ID, createdAt: '2026-08-31T14:31:00Z' };
const NOW = { 'retry-after': '0' };

let server: MockServer;
let scoped: UserScopedClient;

beforeEach(async () => {
  server = await startMockServer();
  scoped = server.client().forUser(USER_ID);
});

afterEach(async () => {
  await server.close();
});

describe('shouldRetry', () => {
  const read = operations['GET /chats/'];
  const idempotent = operations['POST /chats/'];
  const stream = operations['POST /chats/{chatId}/stream/'];
  const artifact = operations['GET /artifacts/{artifactId}/'];
  const scheduled = operations['POST /appointments/scheduled/'];
  const unkeyedPost: OperationSpec = { ...idempotent, idempotent: false };
  const status = (s: number, code: string | null = null) =>
    ({ kind: 'status', status: s, code }) as const;
  const connection = { kind: 'connection' } as const;

  it('never retries the stream', () => {
    for (const outcome of [connection, status(429), status(500), status(503), status(409)]) {
      expect(shouldRetry(stream, outcome)).toBe(false);
    }
  });

  it('never retries a mutation without an idempotency key', () => {
    for (const outcome of [connection, status(429), status(500), status(503), status(409)]) {
      expect(shouldRetry(unkeyedPost, outcome)).toBe(false);
    }
  });

  it('retries network errors, 429, and 503 for reads and idempotent mutations', () => {
    for (const operation of [read, idempotent]) {
      expect(shouldRetry(operation, connection)).toBe(true);
      expect(shouldRetry(operation, status(429))).toBe(true);
      expect(shouldRetry(operation, status(503))).toBe(true);
    }
  });

  it('retries other 5xx for reads only', () => {
    expect(shouldRetry(read, status(500))).toBe(true);
    expect(shouldRetry(read, status(502))).toBe(true);
    expect(shouldRetry(idempotent, status(500))).toBe(false);
    expect(shouldRetry(scheduled, status(502, 'error.appointments.provisioning_failed'))).toBe(
      false,
    );
  });

  it('treats a 5xx the contract documents for a read as final', () => {
    expect(shouldRetry(artifact, status(500, 'error.internal'))).toBe(false);
    expect(shouldRetry(artifact, status(502))).toBe(true);
  });

  it('retries an idempotency conflict but not a documented state conflict', () => {
    expect(shouldRetry(idempotent, status(409))).toBe(true);
    expect(shouldRetry(scheduled, status(409))).toBe(true);
    expect(shouldRetry(scheduled, status(409, 'error.appointments.slot_unavailable'))).toBe(false);
    expect(shouldRetry(read, status(409))).toBe(false);
  });

  describe('409 codes the contract marks retryable', () => {
    const MISMATCH = 'error.idempotency.payload_mismatch';
    const CONCURRENT = 'error.idempotency.concurrent_request';
    const SLOT = 'error.appointments.slot_unavailable';
    // The pinned contract lists retryable codes for this operation. Leave them out here.
    const documented: OperationSpec = {
      ...scheduled,
      conflictCodes: [SLOT, MISMATCH, CONCURRENT],
      retryableConflictCodes: undefined,
    };
    const listed: OperationSpec = { ...documented, retryableConflictCodes: [CONCURRENT] };

    it('retries a documented code only when the contract lists it', () => {
      expect(shouldRetry(listed, status(409, CONCURRENT))).toBe(true);
      expect(shouldRetry(listed, status(409, MISMATCH))).toBe(false);
      expect(shouldRetry(listed, status(409, SLOT))).toBe(false);
    });

    it('still retries a 409 without a code, or with a code the contract does not document', () => {
      expect(shouldRetry(listed, status(409))).toBe(true);
      expect(shouldRetry(listed, status(409, 'error.idempotency.something_new'))).toBe(true);
    });

    it('treats every documented code as final when the contract has no list', () => {
      expect(shouldRetry(documented, status(409, CONCURRENT))).toBe(false);
      expect(shouldRetry(documented, status(409, MISMATCH))).toBe(false);
      expect(shouldRetry(documented, status(409))).toBe(true);
    });

    it('never retries a 409 for a read or an unkeyed mutation, listed or not', () => {
      expect(
        shouldRetry({ ...read, retryableConflictCodes: [CONCURRENT] }, status(409, CONCURRENT)),
      ).toBe(false);
      expect(shouldRetry({ ...listed, idempotent: false }, status(409, CONCURRENT))).toBe(false);
    });
  });

  it('never retries other 4xx', () => {
    for (const s of [400, 401, 403, 404, 422]) {
      expect(shouldRetry(read, status(s))).toBe(false);
      expect(shouldRetry(idempotent, status(s))).toBe(false);
    }
  });
});

describe('retry delays', () => {
  it('backs off exponentially with bounded jitter', () => {
    expect(retryDelayMs(0, null, () => 0)).toBe(500);
    expect(retryDelayMs(1, null, () => 0)).toBe(1000);
    expect(retryDelayMs(2, null, () => 0)).toBe(2000);
    expect(retryDelayMs(1, null, () => 1)).toBe(1250);
    expect(retryDelayMs(20, null, () => 0)).toBe(8000);
  });

  it('waits for Retry-After instead when present', () => {
    expect(retryDelayMs(0, '7')).toBe(7000);
    expect(retryDelayMs(0, '0')).toBe(0);
  });

  it('gives up when Retry-After is longer than the cap', () => {
    expect(retryDelayMs(0, String(MAX_RETRY_AFTER_MS / 1000 + 1))).toBeNull();
  });

  it('parses delay-seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(parseRetryAfter('5', () => now)).toBe(5000);
    expect(parseRetryAfter('1.5', () => now)).toBe(1500);
    expect(parseRetryAfter('Sat, 24 Oct 2026 12:00:03 GMT', () => now)).toBe(3000);
    expect(parseRetryAfter('Sat, 24 Oct 2026 11:00:00 GMT', () => now)).toBe(0);
    expect(parseRetryAfter('soon', () => now)).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe('retries against the server', () => {
  it('reuses the same idempotency key and body on every retry of a call', async () => {
    server.enqueue(
      apiError(503, 'error.idempotency.unavailable', 'Retry with the same key.', { headers: NOW }),
      dropConnection(),
      ok(chat, 201),
    );

    const result = await scoped.chats.create({ timezone: 'America/New_York' });

    expect(result).toEqual(chat);
    expect(server.requests).toHaveLength(3);
    const keys = new Set(server.requests.map((r) => r.headers['idempotency-key']));
    const bodies = new Set(server.requests.map((r) => r.body));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toMatch(/^[0-9a-f-]{36}$/);
    expect([...bodies]).toEqual([JSON.stringify({ timezone: 'America/New_York' })]);
  });

  it('honors Retry-After', async () => {
    server.enqueue(
      apiError(503, 'error.validation.phone_number.unavailable', 'Retry later.', {
        headers: { 'retry-after': '1' },
      }),
      ok(chat, 201),
    );
    await scoped.chats.create();
    const [first, second] = server.requests;
    expect(second!.receivedAt - first!.receivedAt).toBeGreaterThanOrEqual(950);
  });

  it('retries a network failure on a read', async () => {
    server.enqueue(dropConnection(), ok(chat));
    await expect(scoped.chats.retrieve(CHAT_ID)).resolves.toEqual(chat);
    expect(server.requests).toHaveLength(2);
  });

  it('retries a 5xx on a read', async () => {
    server.enqueue(
      empty(502, NOW),
      apiError(500, undefined, undefined, { headers: NOW }),
      ok(chat),
    );
    await expect(scoped.chats.retrieve(CHAT_ID)).resolves.toEqual(chat);
    expect(server.requests).toHaveLength(3);
  });

  it('retries a 429 from a proxy', async () => {
    server.enqueue(empty(429, NOW), ok(chat));
    await expect(scoped.chats.retrieve(CHAT_ID)).resolves.toEqual(chat);
    expect(server.requests).toHaveLength(2);
  });

  it('stops after maxRetries and throws the last error', async () => {
    server.enqueue(empty(503, NOW), empty(503, NOW), empty(503, NOW), ok(chat));
    await expect(scoped.chats.retrieve(CHAT_ID)).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(server.requests).toHaveLength(3);
  });

  it('respects a per-call maxRetries', async () => {
    server.enqueue(empty(503, NOW), ok(chat));
    await expect(scoped.chats.retrieve(CHAT_ID, { maxRetries: 0 })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(server.requests).toHaveLength(1);
  });

  it('throws instead of waiting out a Retry-After beyond the cap', async () => {
    server.enqueue(empty(429, { 'retry-after': '3600' }), ok(chat));
    await expect(scoped.chats.retrieve(CHAT_ID)).rejects.toBeInstanceOf(RateLimitError);
    expect(server.requests).toHaveLength(1);
  });

  it('retries an idempotency conflict with the same key', async () => {
    server.enqueue(empty(409, NOW), ok(chat, 201));
    await expect(scoped.chats.create()).resolves.toEqual(chat);
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0]?.headers['idempotency-key']).toBe(
      server.requests[1]?.headers['idempotency-key'],
    );
  });

  it('does not retry a documented state conflict', async () => {
    server.enqueue(
      apiError(
        409,
        'error.appointments.slot_unavailable',
        'The selected slot is no longer available.',
        {
          headers: NOW,
        },
      ),
    );
    await expect(
      scoped.appointments.createScheduled({
        chatId: CHAT_ID,
        startsAt: '2026-08-20T15:00:00Z',
        location: { state: 'NY' },
      }),
    ).rejects.toMatchObject({ code: 'error.appointments.slot_unavailable' });
    expect(server.requests).toHaveLength(1);
  });

  it('does not retry a 5xx on an idempotent mutation', async () => {
    server.enqueue(
      apiError(502, 'error.appointments.waiting_room_unavailable', 'Retrieve the appointment.', {
        data: { appointmentId: 'dc_1', status: 'booked' },
        headers: NOW,
      }),
    );
    const error: unknown = await scoped.appointments
      .createAsap({ chatId: CHAT_ID, location: { state: 'NY' } })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error).toMatchObject({ status: 502, data: { appointmentId: 'dc_1', status: 'booked' } });
    expect(server.requests).toHaveLength(1);
  });

  it('does not retry an artifact whose generation failed', async () => {
    server.enqueue(
      apiError(500, 'error.internal', 'Artifact generation failed permanently.', { headers: NOW }),
    );
    await expect(scoped.artifacts.retrieve('art_1')).rejects.toBeInstanceOf(InternalServerError);
    expect(server.requests).toHaveLength(1);
  });

  it('does not retry a 4xx', async () => {
    server.enqueue(apiError(404, 'error.partner.chat_not_found', 'Chat not found.'));
    await expect(scoped.chats.retrieve(CHAT_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(server.requests).toHaveLength(1);
  });

  describe('when an error body is cut off', () => {
    it('keeps the status, so a booking 502 is not retried', async () => {
      server.enqueue(truncatedBody(502), ok(chat, 201));
      await expect(
        scoped.appointments.createAsap({ chatId: CHAT_ID, location: { state: 'NY' } }),
      ).rejects.toMatchObject({ constructor: InternalServerError, status: 502, code: null });
      expect(server.requests).toHaveLength(1);
    });

    it('keeps the status, so an artifact 500 is not retried', async () => {
      server.enqueue(truncatedBody(500), ok(chat));
      await expect(scoped.artifacts.retrieve('art_1')).rejects.toBeInstanceOf(InternalServerError);
      expect(server.requests).toHaveLength(1);
    });

    it('keeps Retry-After, so a 503 still waits for it', async () => {
      server.enqueue(truncatedBody(503, { 'retry-after': '1' }), ok(chat));
      await expect(scoped.chats.retrieve(CHAT_ID)).resolves.toEqual(chat);
      const [first, second] = server.requests;
      expect(second!.receivedAt - first!.receivedAt).toBeGreaterThanOrEqual(950);
    });
  });

  describe('the stream', () => {
    const turn = { userInput: 'I have had a sore throat and fever since yesterday.' };

    it('is not retried on 503', async () => {
      server.enqueue(
        apiError(503, 'error.partner.chat_stream_unavailable', 'Please retry shortly.', {
          headers: NOW,
        }),
        ok(null),
      );
      await expect(scoped.chats.stream(CHAT_ID, turn)).rejects.toMatchObject({
        status: 503,
        code: 'error.partner.chat_stream_unavailable',
      });
      expect(server.requests).toHaveLength(1);
    });

    it('is not retried on 409', async () => {
      server.enqueue(
        apiError(409, 'error.partner.chat_stream_in_progress', 'A stream is already in progress.'),
        ok(null),
      );
      await expect(scoped.chats.stream(CHAT_ID, turn)).rejects.toBeInstanceOf(ConflictError);
      expect(server.requests).toHaveLength(1);
    });

    it('is not retried after a network failure', async () => {
      server.enqueue(dropConnection(), ok(null));
      await expect(scoped.chats.stream(CHAT_ID, turn)).rejects.toBeInstanceOf(APIConnectionError);
      expect(server.requests).toHaveLength(1);
    });
  });
});
