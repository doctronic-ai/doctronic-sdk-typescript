import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Doctronic, UserScopedClient } from '../src/index.js';
import { operations, type OperationKey } from '../src/generated/operations.js';
import {
  REQUEST_ID,
  TEST_TOKEN,
  empty,
  ok,
  sse,
  startMockServer,
  type MockServer,
} from './support/mock-server.js';

const USER_ID = 'mem_01K6JGGM2G2DB4Y9KB9H9MJJ6Q';
const CHAT_ID = 'chat_01K6JGGM2G2DB4Y9KB9H9MJJ6Q';
const APPOINTMENT_ID = 'dc_01K1EXAMPLE00000000000000';
const ARTIFACT_ID = 'art_01K6JGGP7Q4R8S2T5V7W9X1Y3';

const user = {
  id: USER_ID,
  createdAt: '2026-08-31T14:30:00Z',
  firstName: 'Avery',
  lastName: 'Chen',
  appointmentDemographicsComplete: true,
  missingAppointmentFields: [],
};
const chat = { id: CHAT_ID, createdAt: '2026-08-31T14:31:00Z' };
const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  size: 50,
  pages: 1,
  hasNext: false,
  hasPrev: false,
});
const appointment = {
  id: APPOINTMENT_ID,
  chatId: CHAT_ID,
  status: 'booked',
  durationMinutes: 15,
  location: { state: 'NY' },
  startsAt: '2026-08-20T15:00:00Z',
  endsAt: '2026-08-20T15:15:00Z',
  waitingRoomUrl: null,
  createdAt: '2026-08-19T12:00:00Z',
};

interface Case {
  key: OperationKey;
  call: (client: Doctronic, scoped: UserScopedClient) => PromiseLike<unknown>;
  status: number;
  data: unknown;
  query?: Record<string, string>;
  body?: unknown;
}

const cases: Case[] = [
  {
    key: 'POST /users/',
    call: (client) =>
      client.users.create({ firstName: 'Avery', lastName: 'Chen', dateOfBirth: '1990-06-15' }),
    status: 201,
    data: user,
    body: { firstName: 'Avery', lastName: 'Chen', dateOfBirth: '1990-06-15' },
  },
  { key: 'GET /users/', call: (_, scoped) => scoped.users.retrieve(), status: 200, data: user },
  {
    key: 'PATCH /users/',
    call: (_, scoped) =>
      scoped.users.update({ phoneNumber: '+15555550100', email: null, firstName: undefined }),
    status: 200,
    data: user,
    // `null` clears a field; an `undefined` one is omitted and keeps its value.
    body: { phoneNumber: '+15555550100', email: null },
  },
  {
    key: 'POST /chats/',
    call: (_, scoped) => scoped.chats.create({ timezone: 'America/New_York' }),
    status: 201,
    data: chat,
    body: { timezone: 'America/New_York' },
  },
  {
    key: 'GET /chats/',
    call: (_, scoped) => scoped.chats.list({ page: 2, size: 50, orderBy: '-updatedAt' }),
    status: 200,
    data: page([chat]),
    query: { page: '2', size: '50', orderBy: '-updatedAt' },
  },
  {
    key: 'GET /chats/{chatId}/',
    call: (_, scoped) => scoped.chats.retrieve(CHAT_ID),
    status: 200,
    data: chat,
  },
  {
    key: 'GET /chats/{chatId}/messages/',
    call: (_, scoped) => scoped.chats.messages(CHAT_ID, { page: 1, size: 50 }),
    status: 200,
    data: page([
      { role: 'user', content: 'Hi', messageId: 'ac_hist_1', createdAt: '2026-08-31T14:32:00Z' },
    ]),
    query: { page: '1', size: '50' },
  },
  {
    key: 'GET /appointments/scheduled/available-slots/',
    call: (_, scoped) =>
      scoped.appointments.availableSlots({
        state: 'NY',
        datetimeFrom: '2026-08-20T00:00:00Z',
        datetimeTo: '2026-08-21T00:00:00Z',
      }),
    status: 200,
    data: { slots: ['2026-08-20T15:00:00Z', '2026-08-20T15:30:00Z'] },
    query: {
      state: 'NY',
      datetimeFrom: '2026-08-20T00:00:00Z',
      datetimeTo: '2026-08-21T00:00:00Z',
    },
  },
  {
    key: 'POST /appointments/scheduled/',
    call: (_, scoped) =>
      scoped.appointments.createScheduled({
        chatId: CHAT_ID,
        startsAt: '2026-08-20T15:00:00Z',
        location: { state: 'NY' },
      }),
    status: 201,
    data: { ...appointment, waitingRoomUrl: undefined, startsAt: undefined, endsAt: undefined },
    body: { chatId: CHAT_ID, startsAt: '2026-08-20T15:00:00Z', location: { state: 'NY' } },
  },
  {
    key: 'POST /appointments/asap/',
    call: (_, scoped) =>
      scoped.appointments.createAsap({ chatId: CHAT_ID, location: { state: 'NY' } }),
    status: 201,
    data: { ...appointment, waitingRoomUrl: 'https://example.com/waiting-room/dc_1' },
    body: { chatId: CHAT_ID, location: { state: 'NY' } },
  },
  {
    key: 'GET /appointments/',
    call: (_, scoped) => scoped.appointments.list({ status: 'booked', page: 1, size: 20 }),
    status: 200,
    data: page([appointment]),
    query: { status: 'booked', page: '1', size: '20' },
  },
  {
    key: 'GET /appointments/{appointment_id}/',
    call: (_, scoped) => scoped.appointments.retrieve(APPOINTMENT_ID),
    status: 200,
    data: appointment,
  },
  {
    key: 'GET /appointments/{appointment_id}/result/',
    call: (_, scoped) => scoped.appointments.result(APPOINTMENT_ID),
    status: 200,
    data: {
      appointmentId: APPOINTMENT_ID,
      prescriptions: [{ displayName: 'Amoxicillin 500 mg', pharmacy: null }],
      clinicianNote: 'art_01K6JGGR9Z6B2C4D6F8H0J2K4M',
    },
  },
  {
    key: 'POST /appointments/{appointment_id}/cancel/',
    call: (_, scoped) => scoped.appointments.cancel(APPOINTMENT_ID),
    status: 200,
    data: null,
  },
  {
    key: 'POST /appointments/{appointment_id}/reschedule/',
    call: (_, scoped) =>
      scoped.appointments.reschedule(APPOINTMENT_ID, {
        startsAt: '2026-08-21T16:00:00Z',
        location: { state: 'NY' },
      }),
    status: 200,
    data: null,
    body: { startsAt: '2026-08-21T16:00:00Z', location: { state: 'NY' } },
  },
  {
    key: 'GET /address/',
    call: (_, scoped) => scoped.address.retrieve(),
    status: 200,
    data: {
      line1: '100 Example Street',
      line2: null,
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
    },
  },
  {
    key: 'PUT /address/',
    call: (_, scoped) =>
      scoped.address.set({
        line1: '100 Example Street',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
      }),
    status: 200,
    data: null,
    body: { line1: '100 Example Street', city: 'New York', state: 'NY', postalCode: '10001' },
  },
  {
    key: 'POST /pharmacy/search/',
    call: (client) =>
      client.pharmacy.search({
        latitude: 40.7608,
        longitude: -111.891,
        searchTerm: 'Main Street',
        state: 'UT',
      }),
    status: 200,
    data: {
      pharmacies: [
        {
          name: 'Main Street Pharmacy',
          ncpdpId: '1234567',
          address: { line1: '1 Main St' },
          distanceMiles: 0.4,
        },
      ],
    },
    body: { latitude: 40.7608, longitude: -111.891, searchTerm: 'Main Street', state: 'UT' },
  },
  {
    key: 'PUT /pharmacy/',
    call: (_, scoped) => scoped.pharmacy.set({ ncpdpId: '1234567' }),
    status: 200,
    data: null,
    body: { ncpdpId: '1234567' },
  },
  {
    key: 'PUT /coverage/',
    call: (_, scoped) =>
      scoped.coverage.set({
        payerId: '00590',
        payerName: 'Example Health Plan',
        memberId: 'ABC1234567',
      }),
    status: 200,
    data: null,
    body: { payerId: '00590', payerName: 'Example Health Plan', memberId: 'ABC1234567' },
  },
  {
    key: 'GET /artifacts/{artifactId}/',
    call: (_, scoped) => scoped.artifacts.retrieve(ARTIFACT_ID),
    status: 200,
    data: {
      artifactType: 'short_summary',
      artifactId: ARTIFACT_ID,
      content: { chatId: CHAT_ID, createdAt: '2026-08-16T15:30:00Z', body: '## Summary' },
    },
  },
];

const PATH_PARAMS: Record<string, string> = {
  chatId: CHAT_ID,
  appointment_id: APPOINTMENT_ID,
  artifactId: ARTIFACT_ID,
};

function expectedPath(key: OperationKey): string {
  return operations[key].path.replace(/\{([^}]+)\}/g, (_, name: string) => PATH_PARAMS[name] ?? '');
}

let server: MockServer;
let client: Doctronic;
let scoped: UserScopedClient;

beforeEach(async () => {
  server = await startMockServer();
  client = server.client();
  scoped = client.forUser(USER_ID);
});

afterEach(async () => {
  await server.close();
});

describe('resource methods', () => {
  it('cover every operation in the contract', () => {
    const covered = new Set<string>([...cases.map((c) => c.key), 'POST /chats/{chatId}/stream/']);
    expect([...covered].sort()).toEqual(Object.keys(operations).sort());
  });

  it('send exactly 11 idempotency keys, read from the contract', () => {
    const idempotent = Object.values(operations).filter((op) => op.idempotent);
    expect(idempotent).toHaveLength(11);
  });

  it.each(cases)('$key', async ({ key, call, status, data, query, body }) => {
    const operation = operations[key];
    server.enqueue(ok(data, status));

    const result = await call(client, scoped);

    expect(result).toEqual(data);
    const [request] = server.requests;
    expect(server.requests).toHaveLength(1);
    expect(request?.method).toBe(operation.method);
    expect(request?.path).toBe(expectedPath(key));
    expect(request?.query).toEqual(query ?? {});
    expect(request?.headers.authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(request?.headers.accept).toBe('application/json');

    // The user header goes out on user-scoped operations only.
    expect(request?.headers['x-doctronic-user-id']).toBe(
      operation.userScoped ? USER_ID : undefined,
    );
    // An idempotency key goes out on the operations whose contract declares one.
    if (operation.idempotent) {
      expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    } else {
      expect(request?.headers['idempotency-key']).toBeUndefined();
    }

    if (body === undefined) {
      expect(request?.body).toBe('');
      expect(request?.headers['content-type']).toBeUndefined();
    } else {
      expect(JSON.parse(request?.body ?? '')).toEqual(body);
      expect(request?.headers['content-type']).toBe('application/json');
    }
  });

  it('generates a new idempotency key for each call', async () => {
    server.enqueue(ok(chat, 201), ok(chat, 201));
    await scoped.chats.create();
    await scoped.chats.create();
    const [first, second] = server.requests.map((r) => r.headers['idempotency-key']);
    expect(first).toBeDefined();
    expect(first).not.toBe(second);
  });

  it('sends the caller’s idempotency key', async () => {
    server.enqueue(ok(chat, 201));
    await scoped.chats.create({}, { idempotencyKey: 'booking-42' });
    expect(server.requests[0]?.headers['idempotency-key']).toBe('booking-42');
  });

  it('rejects an idempotency key the contract would refuse, without sending', async () => {
    await expect(scoped.chats.create({}, { idempotencyKey: 'x'.repeat(256) })).rejects.toThrow(
      /1 to 255 characters/,
    );
    expect(server.requests).toHaveLength(0);
  });

  it('encodes path parameters', async () => {
    server.enqueue(ok(chat));
    await scoped.chats.retrieve('chat/../users');
    expect(server.requests[0]?.path).toBe('/chats/chat%2F..%2Fusers/');
  });

  it('rejects an empty path parameter without sending', async () => {
    await expect(scoped.chats.retrieve('')).rejects.toThrow(/`chatId` must be a non-empty string/);
    expect(server.requests).toHaveLength(0);
  });

  it('resolves a 202 to null', async () => {
    server.enqueue(empty(202));
    await expect(scoped.artifacts.retrieve(ARTIFACT_ID)).resolves.toBeNull();
    server.enqueue(ok({ appointmentId: APPOINTMENT_ID, status: 'booked' }, 202));
    await expect(scoped.appointments.result(APPOINTMENT_ID)).resolves.toBeNull();
  });

  it('exposes the raw response through withResponse()', async () => {
    server.enqueue(ok(user, 201, { 'idempotency-replayed': 'true' }));
    const { data, response, requestId, idempotencyKey, idempotencyReplayed } = await client.users
      .create({}, { idempotencyKey: 'create-avery' })
      .withResponse();
    expect(data).toEqual(user);
    expect(response.status).toBe(201);
    expect(requestId).toBe(REQUEST_ID);
    expect(idempotencyKey).toBe('create-avery');
    expect(idempotencyReplayed).toBe(true);

    server.enqueue(ok(user));
    const read = await scoped.users.retrieve().withResponse();
    expect(read.idempotencyKey).toBeNull();
    expect(read.idempotencyReplayed).toBe(false);
  });

  it('sends a stream turn with the user header and no idempotency key', async () => {
    server.enqueue(sse([]));
    const stream = await scoped.chats.stream(CHAT_ID, {
      userInput: 'I have had a sore throat and fever since yesterday.',
      timezone: 'America/New_York',
    });
    await stream.finalMessages();
    const [request] = server.requests;
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe(`/chats/${CHAT_ID}/stream/`);
    expect(request?.headers.accept).toBe('text/event-stream');
    expect(request?.headers['x-doctronic-user-id']).toBe(USER_ID);
    expect(request?.headers['idempotency-key']).toBeUndefined();
    expect(JSON.parse(request?.body ?? '')).toEqual({
      userEvent: {
        type: 'user_message',
        userInput: 'I have had a sore throat and fever since yesterday.',
      },
      timezone: 'America/New_York',
    });
  });
});
