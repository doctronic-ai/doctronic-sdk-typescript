import { readFileSync } from 'node:fs';
import { inspect } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_URLS, Doctronic, DoctronicError, VERSION } from '../src/index.js';
import { TEST_TOKEN, ok, startMockServer } from './support/mock-server.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('construction', () => {
  it('uses the documented base URLs', () => {
    expect(BASE_URLS).toEqual({
      staging: 'https://staging-partners.doctronic.ai/api/v1',
      production: 'https://partners.doctronic.ai/api/v1',
    });
    expect(new Doctronic({ apiToken: TEST_TOKEN }).baseUrl).toBe(BASE_URLS.staging);
    expect(new Doctronic({ apiToken: TEST_TOKEN, environment: 'production' }).baseUrl).toBe(
      BASE_URLS.production,
    );
  });

  it('lets baseUrl override the environment', () => {
    const client = new Doctronic({
      apiToken: TEST_TOKEN,
      environment: 'production',
      baseUrl: 'http://127.0.0.1:4010/api/v1/',
    });
    expect(client.environment).toBe('production');
    expect(client.baseUrl).toBe('http://127.0.0.1:4010/api/v1');
  });

  it('reads DOCTRONIC_API_TOKEN and DOCTRONIC_ENVIRONMENT', async () => {
    vi.stubEnv('DOCTRONIC_API_TOKEN', 'env-token-not-real');
    vi.stubEnv('DOCTRONIC_ENVIRONMENT', 'production');
    expect(new Doctronic().environment).toBe('production');

    const server = await startMockServer();
    try {
      server.enqueue(ok({ id: 'mem_1' }, 201));
      await new Doctronic({ baseUrl: server.url }).users.create();
      expect(server.requests[0]?.headers.authorization).toBe('Bearer env-token-not-real');
    } finally {
      await server.close();
    }
  });

  it('defaults to staging', () => {
    vi.stubEnv('DOCTRONIC_ENVIRONMENT', '');
    expect(new Doctronic({ apiToken: TEST_TOKEN }).environment).toBe('staging');
  });

  it('throws without a token', () => {
    vi.stubEnv('DOCTRONIC_API_TOKEN', '');
    expect(() => new Doctronic()).toThrow(DoctronicError);
    expect(() => new Doctronic({ apiToken: '' })).toThrow(/DOCTRONIC_API_TOKEN/);
  });

  it('throws for an unknown environment', () => {
    // @ts-expect-error not an environment
    expect(() => new Doctronic({ apiToken: TEST_TOKEN, environment: 'sandbox' })).toThrow(
      /Unknown environment "sandbox"/,
    );
  });

  it('validates timeoutMs and maxRetries', () => {
    expect(() => new Doctronic({ apiToken: TEST_TOKEN, timeoutMs: 0 })).toThrow(/timeoutMs/);
    expect(() => new Doctronic({ apiToken: TEST_TOKEN, maxRetries: -1 })).toThrow(/maxRetries/);
    expect(() => new Doctronic({ apiToken: TEST_TOKEN, maxRetries: 1.5 })).toThrow(/maxRetries/);
  });

  it('uses a custom fetch', async () => {
    const calls: string[] = [];
    const fetch = (input: string | URL | Request) => {
      calls.push(input instanceof Request ? input.url : input.toString());
      return Promise.resolve(
        new Response(JSON.stringify({ code: 'success', data: { id: 'mem_1' } }), { status: 201 }),
      );
    };
    const client = new Doctronic({ apiToken: TEST_TOKEN, baseUrl: 'http://127.0.0.1:1', fetch });
    await expect(client.users.create()).resolves.toEqual({ id: 'mem_1' });
    expect(calls).toEqual(['http://127.0.0.1:1/users/']);
  });

  it('keeps VERSION in step with package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(VERSION).toBe(pkg.version);
  });
});

describe('the API token', () => {
  it('never prints', () => {
    const client = new Doctronic({ apiToken: TEST_TOKEN });
    const scoped = client.forUser('mem_1');
    for (const value of [client, scoped, scoped.chats, client.users]) {
      expect(inspect(value, { depth: 10, showHidden: true })).not.toContain(TEST_TOKEN);
      expect(JSON.stringify(value)).not.toContain(TEST_TOKEN);
    }
  });
});

describe('user scope', () => {
  it('keeps user-scoped resources off the base client', () => {
    const client = new Doctronic({ apiToken: TEST_TOKEN });
    expect(Object.keys(client).sort()).toEqual(['baseUrl', 'environment', 'pharmacy', 'users']);
    expect('retrieve' in client.users).toBe(false);
    expect('set' in client.pharmacy).toBe(false);
  });

  it('carries the user ID', () => {
    const scoped = new Doctronic({ apiToken: TEST_TOKEN }).forUser('mem_01K6');
    expect(scoped.userId).toBe('mem_01K6');
    expect(Object.keys(scoped).sort()).toEqual([
      'address',
      'appointments',
      'artifacts',
      'chats',
      'coverage',
      'pharmacy',
      'userId',
      'users',
    ]);
  });

  it('requires a user ID', () => {
    const client = new Doctronic({ apiToken: TEST_TOKEN });
    expect(() => client.forUser('')).toThrow(/userId/);
    // @ts-expect-error a user ID is required
    expect(() => client.forUser()).toThrow(/userId/);
  });
});

describe('browser guard', () => {
  it('refuses to run in a browser', () => {
    vi.stubGlobal('window', { document: {} });
    expect(() => new Doctronic({ apiToken: TEST_TOKEN })).toThrow(/refuses to run in a browser/);
  });

  it('never puts the token in the browser error', () => {
    vi.stubGlobal('window', { document: {} });
    expect(() => new Doctronic({ apiToken: TEST_TOKEN })).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining(TEST_TOKEN) as unknown }),
    );
  });

  it('runs in a browser with dangerouslyAllowBrowser', () => {
    vi.stubGlobal('window', { document: {} });
    expect(
      () => new Doctronic({ apiToken: TEST_TOKEN, dangerouslyAllowBrowser: true }),
    ).not.toThrow();
  });

  it('runs in a web worker and in runtimes with a window but no document', () => {
    vi.stubGlobal('importScripts', () => undefined);
    expect(() => new Doctronic({ apiToken: TEST_TOKEN })).not.toThrow();
    vi.unstubAllGlobals();
    vi.stubGlobal('window', {});
    expect(() => new Doctronic({ apiToken: TEST_TOKEN })).not.toThrow();
  });
});
