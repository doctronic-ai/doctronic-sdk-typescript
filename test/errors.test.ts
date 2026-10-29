import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APIError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  DoctronicError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServiceUnavailableError,
  type UserScopedClient,
} from '../src/index.js';
import {
  REQUEST_ID,
  TEST_TOKEN,
  apiError,
  delayed,
  empty,
  json,
  ok,
  startMockServer,
  type Handler,
  type MockServer,
} from './support/mock-server.js';

let server: MockServer;
let scoped: UserScopedClient;

beforeEach(async () => {
  server = await startMockServer();
  // A short timeout keeps the timeout test fast.
  scoped = server
    .client({ maxRetries: 0, timeoutMs: 100 })
    .forUser('mem_01K6JGGM2G2DB4Y9KB9H9MJJ6Q');
});

afterEach(async () => {
  await server.close();
});

async function failure(handler: Handler): Promise<unknown> {
  server.enqueue(handler);
  return scoped.users.retrieve().then(
    () => {
      throw new Error('Expected the request to fail');
    },
    (error: unknown) => error,
  );
}

describe('error mapping', () => {
  it.each([
    [400, BadRequestError],
    [401, AuthenticationError],
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [409, ConflictError],
    [422, BadRequestError],
    [429, RateLimitError],
    [500, InternalServerError],
    [502, InternalServerError],
    [503, ServiceUnavailableError],
    [504, InternalServerError],
    [418, APIError],
  ])('maps %i to %o', async (status, ErrorClass) => {
    const error = await failure(apiError(status, 'error.example', 'Something happened.'));
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toBeInstanceOf(APIError);
    expect(error).toBeInstanceOf(DoctronicError);
    expect(error).toMatchObject({ status, code: 'error.example', message: 'Something happened.' });
  });

  it('carries code, message, data, request ID, and headers', async () => {
    const error = await failure(
      apiError(502, 'error.appointments.waiting_room_unavailable', 'Retrieve this appointment.', {
        data: { appointmentId: 'dc_1', status: 'booked' },
        headers: { 'x-extra': 'yes' },
      }),
    );
    expect(error).toBeInstanceOf(InternalServerError);
    const apiErr = error as InternalServerError;
    expect(apiErr.name).toBe('InternalServerError');
    expect(apiErr.code).toBe('error.appointments.waiting_room_unavailable');
    expect(apiErr.message).toBe('Retrieve this appointment.');
    expect(apiErr.data).toEqual({ appointmentId: 'dc_1', status: 'booked' });
    expect(apiErr.requestId).toBe(REQUEST_ID);
    expect(apiErr.headers.get('x-extra')).toBe('yes');
  });

  it('exposes validation field errors as a typed list', async () => {
    const error = await failure(
      apiError(400, 'error.validation_error', 'Validation error', {
        data: [
          {
            field: 'body.requiredField',
            message: 'Field required',
            code: 'error.validation.missing',
          },
          { unexpected: true },
        ],
      }),
    );
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).fieldErrors).toEqual([
      { field: 'body.requiredField', message: 'Field required', code: 'error.validation.missing' },
    ]);
  });

  it('leaves fieldErrors empty for other 400 codes', async () => {
    const error = await failure(apiError(400, 'error.user.conflict', 'A user already exists.'));
    expect((error as BadRequestError).fieldErrors).toEqual([]);
  });

  it('handles a non-JSON error body from a proxy', async () => {
    const error = await failure((_request, res) => {
      res.writeHead(502, { 'content-type': 'text/html' });
      res.end('<html>Bad gateway</html>');
    });
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error).toMatchObject({
      status: 502,
      code: null,
      message: 'Request failed with status 502',
    });
  });

  it('exposes Retry-After in seconds', async () => {
    const error = await failure(
      apiError(503, 'error.validation.phone_number.unavailable', 'Retry later.', {
        headers: { 'retry-after': '5' },
      }),
    );
    expect(error).toMatchObject({ retryAfter: 5 });
    const without = await failure(apiError(404, 'error.artifact.not_found', 'Not found.'));
    expect(without).toMatchObject({ retryAfter: null });
  });

  it('rejects a success response without the data its schema requires', async () => {
    for (const handler of [ok(null), json(200, {}), json(200, []), empty(200)]) {
      const error = await failure(handler);
      expect(error).toBeInstanceOf(APIError);
      expect(error).toMatchObject({ status: 200, message: 'The response is missing `data`.' });
    }
  });

  it('accepts an empty envelope where the contract allows one', async () => {
    server.enqueue(json(200, { code: 'success', message: 'Request successful' }), ok(null));
    await expect(
      scoped.coverage.set({ payerId: '1', payerName: 'P', memberId: 'M' }),
    ).resolves.toBeNull();
    await expect(scoped.appointments.cancel('dc_1')).resolves.toBeNull();
  });

  it('rejects a success body that is not JSON', async () => {
    const error = await failure((_request, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{not json');
    });
    expect(error).toBeInstanceOf(APIError);
    expect(error).toMatchObject({ status: 200 });
  });

  it('never includes the API token in an error', async () => {
    const error = await failure(apiError(401, 'error.auth.unauthorized', 'Unauthorized.'));
    expect(error).toBeInstanceOf(AuthenticationError);
    const err = error as AuthenticationError;
    const serialized = [
      err.message,
      err.stack,
      JSON.stringify(err),
      String(err),
      [...err.headers].join(),
    ];
    for (const text of serialized) expect(text ?? '').not.toContain(TEST_TOKEN);
  });

  it('maps a timeout to APITimeoutError', async () => {
    const error = await failure(delayed(300, ok({})));
    expect(error).toBeInstanceOf(APITimeoutError);
  });

  it('maps a caller abort to APIUserAbortError', async () => {
    const controller = new AbortController();
    server.enqueue(delayed(300, ok({})));
    const pending = scoped.users.retrieve({ signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
  });

  it('aborts a retry wait', async () => {
    const controller = new AbortController();
    const retrying = server.client().forUser('mem_1');
    server.enqueue(
      apiError(503, 'error.unavailable', 'Later.', { headers: { 'retry-after': '30' } }),
    );
    const pending = retrying.users.retrieve({ signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
    expect(server.requests).toHaveLength(1);
  });
});
