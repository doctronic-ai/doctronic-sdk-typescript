import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APIUserAbortError,
  ArtifactNotReadyError,
  InternalServerError,
  NotFoundError,
  type UserScopedClient,
} from '../src/index.js';
import {
  apiError,
  delayed,
  empty,
  ok,
  startMockServer,
  type MockServer,
} from './support/mock-server.js';

const ARTIFACT_ID = 'art_01K6JGGP7Q4R8S2T5V7W9X1Y3';
const artifact = {
  artifactType: 'short_summary',
  artifactId: ARTIFACT_ID,
  content: {
    chatId: 'chat_01K6JGGM2G2DB4Y9KB9H9MJJ6Q',
    createdAt: '2026-08-16T15:30:00Z',
    body: '## Consultation summary',
  },
};

let server: MockServer;
let scoped: UserScopedClient;

beforeEach(async () => {
  server = await startMockServer();
  scoped = server.client().forUser('mem_01K6JGGM2G2DB4Y9KB9H9MJJ6Q');
});

afterEach(async () => {
  await server.close();
});

describe('artifacts.waitUntilReady', () => {
  it('polls through 202 with growing delays until the document is ready', async () => {
    server.enqueue(empty(202), empty(202), ok(artifact));
    await expect(scoped.artifacts.waitUntilReady(ARTIFACT_ID)).resolves.toEqual(artifact);

    expect(server.requests.map((r) => r.path)).toEqual(Array(3).fill(`/artifacts/${ARTIFACT_ID}/`));
    const [first, second, third] = server.requests.map((r) => r.receivedAt);
    const firstGap = second! - first!;
    const secondGap = third! - second!;
    expect(firstGap).toBeGreaterThanOrEqual(950);
    expect(secondGap).toBeGreaterThanOrEqual(1950);
  });

  it('returns at once when the document is ready', async () => {
    server.enqueue(ok(artifact));
    const { data, response } = await scoped.artifacts.waitUntilReady(ARTIFACT_ID).withResponse();
    expect(data).toEqual(artifact);
    expect(response.status).toBe(200);
    expect(server.requests).toHaveLength(1);
  });

  it('stops on 404 with NotFoundError', async () => {
    server.enqueue(apiError(404, 'error.artifact.not_found', 'Artifact not found.'));
    await expect(scoped.artifacts.waitUntilReady(ARTIFACT_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(server.requests).toHaveLength(1);
  });

  it('stops on 500 with InternalServerError, without retrying', async () => {
    server.enqueue(apiError(500, 'error.internal', 'Artifact generation failed permanently.'));
    await expect(scoped.artifacts.waitUntilReady(ARTIFACT_ID)).rejects.toMatchObject({
      constructor: InternalServerError,
      code: 'error.internal',
    });
    expect(server.requests).toHaveLength(1);
  });

  it('gives up with ArtifactNotReadyError after timeoutMs', async () => {
    server.enqueue(empty(202), empty(202), empty(202));
    const started = Date.now();
    const error: unknown = await scoped.artifacts
      .waitUntilReady(ARTIFACT_ID, { timeoutMs: 1_200 })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(ArtifactNotReadyError);
    expect((error as ArtifactNotReadyError).artifactId).toBe(ARTIFACT_ID);
    expect(Date.now() - started).toBeLessThan(1_700);
    // Polls at 0 s and about 1 s; the deadline cuts the next wait short.
    expect(server.requests).toHaveLength(2);
  });

  it('enforces the deadline on a request in flight', async () => {
    server.enqueue(delayed(2_000, ok(artifact)));
    const started = Date.now();
    await expect(
      scoped.artifacts.waitUntilReady(ARTIFACT_ID, { timeoutMs: 300 }),
    ).rejects.toBeInstanceOf(ArtifactNotReadyError);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('enforces the deadline on a retry wait', async () => {
    server.enqueue(
      apiError(503, 'error.unavailable', 'Later.', { headers: { 'retry-after': '30' } }),
    );
    const started = Date.now();
    await expect(
      scoped.artifacts.waitUntilReady(ARTIFACT_ID, { timeoutMs: 300 }),
    ).rejects.toBeInstanceOf(ArtifactNotReadyError);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(server.requests).toHaveLength(1);
  });

  it('stops when the signal aborts', async () => {
    const controller = new AbortController();
    server.enqueue(empty(202), empty(202));
    const pending = scoped.artifacts.waitUntilReady(ARTIFACT_ID, { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
    expect(server.requests).toHaveLength(1);
  });
});
