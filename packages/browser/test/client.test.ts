import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_URLS as SERVER_BASE_URLS } from '../../../src/client.js';
import {
  APIError,
  APITimeoutError,
  AuthenticationError,
  BASE_URLS,
  DoctronicBrowser,
  ErrorCode,
  PermissionDeniedError,
  RateLimitError,
  ServiceUnavailableError,
  attributionFromQuery,
  stateStep,
  type IntakeRules,
} from '../src/index.js';
import { CONFIG, count, fakeDocument, harness, json, nowSeconds, sessionBody } from './helpers.js';

const REFRESH = 'POST /embed/sessions/refresh/';
const SESSIONS = 'POST /embed/sessions/';
const CONFIG_GET = 'GET /embed/config/';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

describe('DoctronicBrowser', () => {
  it('refuses anything but a publishable key, without echoing it', () => {
    for (const key of ['sk_live_secret', 'tok_secret', '', undefined]) {
      let error: unknown;
      try {
        new DoctronicBrowser({ publishableKey: key as string });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/publishable/);
      if (key) expect((error as Error).message).not.toContain(key);
    }
  });

  it('targets staging by default, like the server SDK, production on request, and a base URL over both', async () => {
    expect(BASE_URLS).toEqual(SERVER_BASE_URLS);
    const urls: string[] = [];
    const fetch = vi.fn((input: string | URL | Request) => {
      urls.push(input as string);
      return Promise.resolve(json(CONFIG));
    });
    await new DoctronicBrowser({ publishableKey: 'pk_test', fetch }).getConfig();
    await new DoctronicBrowser({
      publishableKey: 'pk_live',
      environment: 'production',
      fetch,
    }).getConfig();
    await new DoctronicBrowser({
      publishableKey: 'pk_test',
      environment: 'production',
      baseUrl: 'https://local.test/api/v1/',
      fetch,
    }).getConfig();
    expect(urls).toEqual([
      `${BASE_URLS.staging}/embed/config/?key=pk_test`,
      `${BASE_URLS.production}/embed/config/?key=pk_live`,
      'https://local.test/api/v1/embed/config/?key=pk_test',
    ]);
  });

  it('maps API errors to their classes and stable codes', async () => {
    const h = harness();
    h.routes[SESSIONS] = () =>
      json({ code: ErrorCode.ineligible, message: 'no', data: { reason: 'state' } }, 403);
    const client = h.client();
    const error = await client
      .startSession({ intake: { age: 40, sex: 'male', state: 'TX' }, termsAccepted: true })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(error).toMatchObject({
      status: 403,
      code: ErrorCode.ineligible,
      data: { reason: 'state' },
    });
    expect(client.sessionStatus).toBe('none');
  });

  it('reads retryAfter from a rate-limited body, with a default and a one-day cap', () => {
    const headers = new Headers();
    const body = (retryAfter: unknown) => ({ code: ErrorCode.rateLimited, data: { retryAfter } });
    expect(APIError.from(429, body(30), headers).retryAfter).toBe(30);
    expect(APIError.from(429, body(null), headers).retryAfter).toBe(10);
    expect(APIError.from(429, body(10 ** 9), headers).retryAfter).toBe(86_400);
    expect(APIError.from(429, {}, new Headers({ 'Retry-After': '7' })).retryAfter).toBe(7);
    expect(APIError.from(403, { code: ErrorCode.ineligible }, headers).retryAfter).toBeNull();
  });

  it('turns a request that takes too long into a timeout', async () => {
    const h = harness();
    h.routes[CONFIG_GET] = (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
      );
    const client = h.client({ timeoutMs: 20 });
    await expect(client.getConfig()).rejects.toBeInstanceOf(APITimeoutError);
  });

  it('caches the config and fetches it again on refresh: true', async () => {
    const h = harness();
    const client = h.client();
    await client.getConfig();
    await client.getConfig();
    h.routes[CONFIG_GET] = () => json({ ...CONFIG, paused: true });
    expect((await client.getConfig({ refresh: true })).paused).toBe(true);
    expect(count(h.calls, CONFIG_GET)).toBe(2);
  });

  it("fills in the contract's defaults for optional config fields", async () => {
    const h = harness();
    h.routes[CONFIG_GET] = () =>
      json({
        ...CONFIG,
        content: { title: 't', body: 'b' },
        intake: {},
        offramps: [{ kind: 'survey', label: 'Survey', showWhen: {} }],
      });
    const config = await h.client().getConfig();
    expect(config.content).toMatchObject({
      inputPlaceholder: 'Ask anything about your health',
      starterPrompts: [],
    });
    expect(config.intake).toEqual({
      minAge: 18,
      state: null,
      roles: null,
      ineligibleMessage: "Sorry, this service isn't available to you yet.",
    });
    expect(config.offramps[0]!.showWhen).toEqual({
      ctaWidgets: [],
      onConversationEnd: false,
      afterAssistantReplies: null,
    });
  });
});

describe('legacy intake', () => {
  it("keeps an older API's allowedStates as a selection through the config defaults", async () => {
    const h = harness();
    h.routes[CONFIG_GET] = () =>
      json({
        ...CONFIG,
        intake: { minAge: 18, allowedStates: ['AL', 'GA'], roles: null, ineligibleMessage: 'no' },
      });
    const config = await h.client().getConfig();
    expect(stateStep(config.intake)).toEqual({ mode: 'selection', states: ['AL', 'GA'] });
  });

  it("still refuses an older API's allowedStates that isn't a list of states", async () => {
    const h = harness();
    h.routes[CONFIG_GET] = () => json({ ...CONFIG, intake: { allowedStates: 'AL' } });
    const config = await h.client().getConfig();
    expect(stateStep(config.intake)).toEqual({ mode: 'unsupported' });
  });
});

describe('retries', () => {
  it('retries the config on transient failures, a bounded number of times', async () => {
    fakeClock();
    const h = harness();
    let attempts = 0;
    h.routes[CONFIG_GET] = () => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new TypeError('network'));
      if (attempts === 2) return json({ code: 'error.unknown' }, 503);
      return json(CONFIG);
    };
    const config = h.client().getConfig();
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(config).resolves.toMatchObject({ deploymentId: CONFIG.deploymentId });
    expect(attempts).toBe(3);

    h.routes[CONFIG_GET] = () => Promise.reject(new TypeError('network'));
    const failing = h
      .client()
      .getConfig()
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await failing).toMatchObject({ name: 'APIConnectionError' });
    expect(count(h.calls, CONFIG_GET)).toBe(3 + 3);
  });

  it("doesn't retry a config request the API refused for good", async () => {
    const h = harness();
    h.routes[CONFIG_GET] = () => json({ code: ErrorCode.keyInvalid, message: 'unknown key' }, 401);
    await expect(h.client().getConfig()).rejects.toBeInstanceOf(AuthenticationError);
    expect(count(h.calls, CONFIG_GET)).toBe(1);
  });

  it('never retries session creation', async () => {
    const h = harness();
    h.routes[SESSIONS] = () => json({ code: ErrorCode.paused, message: 'paused' }, 503);
    const client = h.client();
    const start = () =>
      client.startSession({ intake: { age: 40, sex: 'female', state: 'AL' }, termsAccepted: true });
    await expect(start()).rejects.toBeInstanceOf(ServiceUnavailableError);
    h.routes[SESSIONS] = () => Promise.reject(new TypeError('network'));
    await expect(start()).rejects.toMatchObject({ name: 'APIConnectionError' });
    h.routes[SESSIONS] = () => json({ code: ErrorCode.rateLimited, data: { retryAfter: 1 } }, 429);
    await expect(start()).rejects.toBeInstanceOf(RateLimitError);
    expect(count(h.calls, SESSIONS)).toBe(3);
    expect(h.inits.every((init) => !new Headers(init.headers).has('Idempotency-Key'))).toBe(true);
  });

  it('never retries chat creation', async () => {
    const h = harness();
    const client = await h.started();
    h.routes['POST /chats/'] = () => json({ code: 'error.unknown' }, 503);
    await expect(client.createChat()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(count(h.calls, 'POST /chats/')).toBe(1);
  });
});

describe('sessions', () => {
  it('keeps the token in memory only: no storage, no cookies, never printed', async () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    const { document } = fakeDocument();
    const cookie = vi.fn();
    Object.defineProperty(document, 'cookie', { set: cookie, get: () => '' });
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);
    vi.stubGlobal('document', document);
    const h = harness();
    h.routes[SESSIONS] = () => json(sessionBody('tok_secret_value'), 201);
    const client = await h.started();
    await client.createChat();
    expect(Object.values(storage).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    expect(cookie).not.toHaveBeenCalled();
    expect(h.inits.every((init) => init.credentials === 'omit')).toBe(true);
    expect(JSON.stringify(client)).not.toContain('tok_secret_value');
    expect(Object.values(client).join(' ')).not.toContain('tok_secret_value');
    expect(new Headers(h.inits.at(-1)!.headers).get('Authorization')).toBe(
      'Bearer tok_secret_value',
    );
    client.dispose();
  });

  it("times the refresh from the server's durations, not this device's clock", async () => {
    fakeClock();
    const h = harness();
    // The device runs an hour fast: the absolute times look long expired, the durations are right.
    const serverNow = nowSeconds() - 3600;
    const body = { ...sessionBody(), expiresAt: serverNow + 900, refreshAfter: serverNow + 600 };
    h.routes[SESSIONS] = () => json(body, 201);
    h.routes[REFRESH] = () => json({ ...body, token: 'tok_2' });
    const client = await h.started();
    expect(client.sessionStatus).toBe('active');
    await vi.advanceTimersByTimeAsync(599_000);
    expect(h.calls).not.toContain(REFRESH);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(count(h.calls, REFRESH)).toBe(1);
    expect(client.sessionStatus).toBe('active');
    client.dispose();
  });

  it('counts the time the request took against the token', async () => {
    fakeClock();
    const h = harness();
    // The session answer takes 5 s: the refresh is due 600 s after the request left, not after it came back.
    h.routes[SESSIONS] = () =>
      new Promise((resolve) => setTimeout(() => resolve(json(sessionBody(), 201)), 5_000));
    h.routes[REFRESH] = () => json(sessionBody('tok_2'));
    const client = h.client();
    const started = client.startSession({
      intake: { age: 40, sex: 'female', state: 'AL' },
      termsAccepted: true,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await started;
    await vi.advanceTimersByTimeAsync(595_500);
    expect(count(h.calls, REFRESH)).toBe(1);
    client.dispose();
  });

  it("falls back to the absolute times from a server that doesn't send durations", async () => {
    fakeClock();
    const h = harness();
    h.routes[SESSIONS] = () =>
      json(
        { token: 'tok_1', expiresAt: nowSeconds() + 900, refreshAfter: nowSeconds() + 600 },
        201,
      );
    h.routes[REFRESH] = () => json(sessionBody('tok_2'));
    const client = await h.started();
    await vi.advanceTimersByTimeAsync(598_000);
    expect(h.calls).not.toContain(REFRESH);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(count(h.calls, REFRESH)).toBe(1);
    client.dispose();
  });

  it('deduplicates a refresh the timer and a returning tab both start', async () => {
    fakeClock();
    const { document, show } = fakeDocument();
    vi.stubGlobal('document', document);
    const h = harness();
    let release!: () => void;
    h.routes[REFRESH] = () =>
      new Promise((resolve) => {
        release = () => resolve(json(sessionBody('tok_2')));
      });
    const client = await h.started();
    await vi.advanceTimersByTimeAsync(600_000); // The timer's refresh is in flight.
    show();
    show();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(count(h.calls, REFRESH)).toBe(1);
    expect(client.sessionStatus).toBe('active');
    client.dispose();
  });

  it('refreshes right away when a tab that slept past the refresh time comes back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // A suspended tab: no timer runs.
    const { document, show } = fakeDocument();
    vi.stubGlobal('document', document);
    const h = harness();
    h.routes[REFRESH] = () => json(sessionBody('tok_2'));
    const client = await h.started();
    vi.setSystemTime(Date.now() + 700_000);
    show();
    await vi.waitFor(() => expect(count(h.calls, REFRESH)).toBe(1));
    client.dispose();
  });

  it('drops a session that expired while the tab slept, without calling the API', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { document, show } = fakeDocument();
    vi.stubGlobal('document', document);
    const h = harness();
    const onSessionEnd = vi.fn();
    const client = await h.started({ onSessionEnd });
    vi.setSystemTime(Date.now() + 901_000);
    show();
    expect(onSessionEnd).toHaveBeenCalledWith('expired');
    expect(client.sessionStatus).toBe('expired');
    expect(h.calls).not.toContain(REFRESH);
  });

  it('treats a session past its expiry as expired even if no timer ran', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const h = harness();
    const client = await h.started();
    vi.setSystemTime(Date.now() + 901_000);
    expect(client.sessionStatus).toBe('expired');
    await expect(client.createChat()).rejects.toMatchObject({ code: ErrorCode.noSession });
  });

  it('ends the session, once, when the server rejects the refresh, and never retries a 401', async () => {
    fakeClock();
    const h = harness();
    h.routes[REFRESH] = () => json({ code: ErrorCode.sessionInvalid, message: 'revoked' }, 401);
    const onSessionEnd = vi.fn();
    const client = await h.started({ onSessionEnd });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(client.sessionStatus).toBe('expired');
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(count(h.calls, REFRESH)).toBe(1);
  });

  it("ends the session when the refresh finds the session's user gone, without retrying", async () => {
    fakeClock();
    const h = harness();
    h.routes[REFRESH] = () => json({ code: 'error.member.not_found', message: 'gone' }, 404);
    const client = await h.started();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(client.sessionStatus).toBe('expired');
    expect(count(h.calls, REFRESH)).toBe(1);
  });

  it('retries a failing refresh only while the token is still valid', async () => {
    fakeClock();
    const h = harness();
    h.routes[REFRESH] = () => Promise.reject(new TypeError('network'));
    const onSessionEnd = vi.fn();
    const onDiagnostic = vi.fn();
    const client = await h.started({ onSessionEnd, onDiagnostic });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(client.sessionStatus).toBe('expired');
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    // 600 s to the first refresh, then every 15 s until the token expires at 900 s.
    expect(count(h.calls, REFRESH)).toBe(20);
    expect(onDiagnostic).toHaveBeenLastCalledWith({ code: 'session.refresh_failed', count: 20 });
  });

  it("waits the server's retryAfter when a refresh is rate limited", async () => {
    fakeClock();
    const h = harness();
    let refreshes = 0;
    h.routes[REFRESH] = () => {
      refreshes += 1;
      return refreshes === 1
        ? json(
            { code: ErrorCode.rateLimited, message: 'slow down', data: { retryAfter: 120 } },
            429,
          )
        : json(sessionBody('tok_2'));
    };
    const client = await h.started();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(refreshes).toBe(1);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(refreshes).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(refreshes).toBe(2);
    expect(client.sessionStatus).toBe('active');
    client.dispose();
  });

  it('waits instead of retrying at once on a huge retryAfter, and lets the token expire', async () => {
    fakeClock();
    const h = harness();
    h.routes[REFRESH] = () =>
      json({ code: ErrorCode.rateLimited, data: { retryAfter: 1e12 } }, 429);
    const client = await h.started();
    await vi.advanceTimersByTimeAsync(600_000);
    await vi.advanceTimersByTimeAsync(299_000);
    expect(count(h.calls, REFRESH)).toBe(1);
    expect(client.sessionStatus).toBe('active');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.sessionStatus).toBe('expired');
    expect(count(h.calls, REFRESH)).toBe(1);
  });

  it("doesn't retry a rate-limited refresh early when the visitor returns to the tab", async () => {
    fakeClock();
    const { document, show } = fakeDocument();
    vi.stubGlobal('document', document);
    const h = harness();
    h.routes[REFRESH] = () => json({ code: ErrorCode.rateLimited, data: { retryAfter: 120 } }, 429);
    const client = await h.started();
    await vi.advanceTimersByTimeAsync(600_000);
    show();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(count(h.calls, REFRESH)).toBe(1);
    client.dispose();
  });

  it('stops, with a clear state, when a refresh finds the deployment paused', async () => {
    fakeClock();
    const h = harness();
    h.routes[REFRESH] = () => json({ code: ErrorCode.paused, message: 'paused' }, 503);
    const onSessionEnd = vi.fn();
    const client = await h.started({ onSessionEnd });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(client.sessionStatus).toBe('paused');
    expect(onSessionEnd).toHaveBeenCalledExactlyOnceWith('paused');
    expect(count(h.calls, REFRESH)).toBe(1);
  });

  it('does not revive a session when a refresh finishes after dispose()', async () => {
    fakeClock();
    const h = harness();
    let release!: () => void;
    h.routes[REFRESH] = () =>
      new Promise((resolve) => {
        release = () => resolve(json(sessionBody('tok_2')));
      });
    const client = await h.started();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.calls).toContain(REFRESH);
    client.dispose();
    release();
    await vi.advanceTimersByTimeAsync(2_000_000);
    expect(client.hasSession).toBe(false);
    expect(client.disposed).toBe(true);
    expect(count(h.calls, REFRESH)).toBe(1);
    await expect(client.createChat()).rejects.toMatchObject({ code: ErrorCode.disposed });
  });

  it('ends the session when an authenticated call gets a 401', async () => {
    const h = harness();
    h.routes['POST /chats/'] = () => json({ code: ErrorCode.sessionInvalid }, 401);
    const onSessionEnd = vi.fn();
    const client = await h.started({ onSessionEnd });
    await expect(client.createChat()).rejects.toBeInstanceOf(AuthenticationError);
    expect(client.sessionStatus).toBe('expired');
    expect(onSessionEnd).toHaveBeenCalledWith('expired');
  });

  it('keeps a new session when an old one is rejected after the new one started', async () => {
    const h = harness();
    let reject!: () => void;
    h.routes['POST /chats/'] = () =>
      new Promise((resolve) => {
        reject = () => resolve(json({ code: ErrorCode.sessionInvalid }, 401));
      });
    const client = await h.started();
    const old = client.createChat().catch((error: unknown) => error);
    h.routes[SESSIONS] = () => json(sessionBody('tok_new'), 201);
    await client.startSession({
      intake: { age: 40, sex: 'female', state: 'AL' },
      termsAccepted: true,
    });
    reject();
    expect(await old).toBeInstanceOf(AuthenticationError);
    expect(client.sessionStatus).toBe('active');
  });

  it('sends the visit attribution, and leaves it out when there is none', async () => {
    const h = harness();
    const bodies: unknown[] = [];
    h.routes[SESSIONS] = (_url, init) => {
      bodies.push(JSON.parse(init.body as string));
      return json(sessionBody(), 201);
    };
    await h.started({ attribution: { utmSource: 'newsletter', platform: 'ios' } });
    await h.started({ attribution: {} });
    expect(bodies[0]).toMatchObject({
      key: 'pk_test',
      attribution: { utmSource: 'newsletter', platform: 'ios' },
    });
    expect(bodies[1]).not.toHaveProperty('attribution');
  });

  it("refuses to start a session for a state rule this version doesn't know", async () => {
    const h = harness();
    h.routes[CONFIG_GET] = () =>
      json({
        ...CONFIG,
        intake: { ...CONFIG.intake, state: { mode: 'geofence', states: ['AL'] } },
      });
    await expect(
      h.client().startSession({ intake: { age: 40, sex: 'female' }, termsAccepted: true }),
    ).rejects.toMatchObject({ code: ErrorCode.unsupportedIntake });
    expect(h.calls).not.toContain(SESSIONS);
  });
});

describe('chats', () => {
  it('records the starter prompt the visitor picked, with the timezone', async () => {
    const h = harness();
    const bodies: unknown[] = [];
    h.routes['POST /chats/'] = (_url, init) => {
      bodies.push(JSON.parse(init.body as string));
      return json({ id: 'chat_1', createdAt: '2026-01-01T00:00:00Z' }, 201);
    };
    const client = await h.started({ timezone: 'America/Chicago' });
    await client.createChat({ starterPromptIndex: 2 });
    await client.createChat();
    expect(bodies).toEqual([
      { timezone: 'America/Chicago', starterPromptIndex: 2 },
      { timezone: 'America/Chicago' },
    ]);
  });
});

describe('stateStep', () => {
  const base: IntakeRules = { minAge: 18, state: null, roles: null, ineligibleMessage: 'no' };

  it('reads selection, disclaimer and no state rule', () => {
    expect(
      stateStep({
        ...base,
        state: {
          mode: 'selection',
          states: ['AL'],
          ineligibleMessage: 'x',
          question: 'Where do you live?',
        },
      }),
    ).toEqual({ mode: 'selection', states: ['AL'], question: 'Where do you live?' });
    expect(
      stateStep({
        ...base,
        state: { mode: 'disclaimer', states: ['AL', 'GA'], text: 'For AL and GA residents.' },
      }),
    ).toEqual({ mode: 'disclaimer', states: ['AL', 'GA'], text: 'For AL and GA residents.' });
    expect(stateStep(base)).toEqual({ mode: 'none' });
  });

  it("reads an older API's allowedStates", () => {
    const withoutState: Partial<IntakeRules> = { ...base };
    delete withoutState.state;
    expect(stateStep({ ...withoutState, allowedStates: ['AL'] } as unknown as IntakeRules)).toEqual(
      {
        mode: 'selection',
        states: ['AL'],
      },
    );
    expect(stateStep(withoutState as IntakeRules)).toEqual({ mode: 'none' });
  });

  it("refuses rules it doesn't understand, so no session starts", () => {
    const rule = (state: unknown) => stateStep({ ...base, state } as unknown as IntakeRules);
    expect(rule({ mode: 'geofence', states: ['AL'] })).toEqual({ mode: 'unsupported' });
    expect(rule({ mode: 'selection', states: [] })).toEqual({ mode: 'unsupported' });
    expect(rule({ mode: 'disclaimer', states: ['AL'], text: ' ' })).toEqual({
      mode: 'unsupported',
    });
    expect(rule('selection')).toEqual({ mode: 'unsupported' });
  });
});

describe('attributionFromQuery', () => {
  it('keeps the UTM values, and drops other params, overlong values and email-like ones', () => {
    const long = 'x'.repeat(201);
    expect(
      attributionFromQuery(
        `?utm_source=mail&utm_campaign=fall&email=a%40b.test&utm_term=${long}&utm_content=a%40b.test`,
        'android',
      ),
    ).toEqual({ utmSource: 'mail', utmCampaign: 'fall', platform: 'android' });
  });
});

describe('server-side rendering', () => {
  it('imports and constructs with no window or document', async () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const browser = await import('../src/index.js');
    const client = new browser.DoctronicBrowser({ publishableKey: 'pk_test', fetch: vi.fn() });
    expect(client.sessionStatus).toBe('none');
    client.dispose();
  });
});
