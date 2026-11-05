// The browser client: a publishable key selects a deployment, and an anonymous embed session gives
// a short-lived token, held in memory only and refreshed before it expires.

import {
  Chat,
  type ChatHost,
  type DiagnosticCode,
  type OpenStream,
  type SessionEndCause,
} from './chat.js';
import {
  stateStep,
  withConfigDefaults,
  type Attribution,
  type DeploymentConfig,
  type Sex,
  type StateCode,
} from './config.js';
import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  DoctronicError,
  ErrorCode,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  isRecord,
} from './errors.js';
import type { OperationKey } from './generated/operations.js';
import type { components } from './generated/schema.js';
import { parseSse, type SseFrame } from './streaming.js';
import {
  MAX_TIMER_MS,
  errorFrom,
  headersFor,
  linkAbort,
  readJson,
  unwrap,
  urlFor,
  type Abort,
  type Call,
} from './transport.js';

/** The same base URLs as the server SDK, `@doctronic-ai/sdk`. */
export const BASE_URLS = {
  staging: 'https://staging-partners.doctronic.ai/api/v1',
  production: 'https://partners.doctronic.ai/api/v1',
} as const;

export type Environment = keyof typeof BASE_URLS;

const DEFAULT_TIMEOUT_MS = 15_000;
/** Above the server's own turn limit, so it only fires on a hung connection. */
const DEFAULT_STREAM_TIMEOUT_MS = 150_000;
/** The wait before trying a failed refresh again, while the token is still valid. */
const REFRESH_RETRY_MS = 15_000;
/** The soonest a refresh is scheduled, so a bad duration can't make a tight loop. */
const MIN_REFRESH_DELAY_MS = 1_000;
/** Retries of `GET /embed/config/` after the first attempt, for transient failures. */
const CONFIG_MAX_RETRIES = 2;
const CONFIG_RETRY_INITIAL_MS = 500;
/** A rate limit longer than this ends the config call instead of holding it open. */
const CONFIG_MAX_RETRY_AFTER_MS = 60_000;

/** A diagnostic for the partner's own logging: a fixed code and how often it happened. Never content. */
export interface Diagnostic {
  code: DiagnosticCode;
  /** How many times this client has reported this code, this one included. */
  count: number;
}

export interface DoctronicBrowserOptions {
  /** The deployment's publishable key, `pk_...`. Anything else is refused. */
  publishableKey: string;
  /** Defaults to `"staging"`, like the server SDK. A publishable key belongs to one environment. */
  environment?: Environment | undefined;
  /** Overrides the environment's base URL, such as for a local stack. */
  baseUrl?: string | undefined;
  /** Sent with every session this client starts. See `attributionFromQuery()`. */
  attribution?: Attribution | undefined;
  /** IANA timezone sent with each chat and turn. Defaults to the browser's. */
  timezone?: string | undefined;
  /** Per request, other than the chat stream. Default 15 s. */
  timeoutMs?: number | undefined;
  /** For a whole reply. Default 150 s. */
  streamTimeoutMs?: number | undefined;
  /** A `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch | undefined;
  /**
   * The session can no longer be used: it expired or was revoked (`expired`), or the deployment
   * was paused (`paused`). Its chats can't go on; start a new session for a new chat.
   */
  onSessionEnd?: ((cause: 'expired' | 'paused') => void) | undefined;
  /** Diagnostics without chat content, for the partner's own logging. */
  onDiagnostic?: ((diagnostic: Diagnostic) => void) | undefined;
}

/** `none` before the first session, `active` while it lasts, and why it ended after that. */
export type SessionStatus = 'none' | 'active' | 'expired' | 'paused';

export interface Intake {
  age: number;
  sex: Sex;
  /** Required when `stateStep()` is `selection`. */
  state?: StateCode | undefined;
  /** One of the deployment's `intake.roles`, when it asks. */
  role?: string | undefined;
}

type SessionResponse = components['schemas']['EmbedSessionResponse'];

/** A session on this device's clock. The token stays in this object, never in storage. */
interface Session {
  token: string;
  refreshAtMs: number;
  expiresAtMs: number;
}

export class DoctronicBrowser {
  readonly environment: Environment;
  readonly baseUrl: string;

  readonly #publishableKey: string;
  readonly #attribution: Attribution | undefined;
  readonly #timezone: string;
  readonly #timeoutMs: number;
  readonly #streamTimeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #onSessionEnd: DoctronicBrowserOptions['onSessionEnd'];
  readonly #onDiagnostic: DoctronicBrowserOptions['onDiagnostic'];
  readonly #lifetime = new AbortController();
  readonly #diagnostics = new Map<DiagnosticCode, number>();
  readonly #chats = new Set<Chat>();
  #session: Session | null = null;
  #ended: 'expired' | 'paused' | null = null;
  /** Bumped whenever the session ends. Work started under an older one is discarded. */
  #generation = 0;
  #refreshTimer: ReturnType<typeof setTimeout> | null = null;
  #refreshing: Promise<void> | null = null;
  #config: Promise<DeploymentConfig> | null = null;

  constructor(options: DoctronicBrowserOptions) {
    const key: unknown = options?.publishableKey;
    if (typeof key !== 'string' || !key.startsWith('pk_')) {
      // A secret key must never reach a browser. The message leaves the value out.
      throw new DoctronicError(
        'DoctronicBrowser needs a publishable key (pk_...). Secret keys belong on your server.',
      );
    }
    const environment = options.environment ?? 'staging';
    if (!Object.hasOwn(BASE_URLS, environment)) {
      throw new DoctronicError(
        `Unknown environment "${String(environment)}". Use "staging" or "production".`,
      );
    }
    this.environment = environment;
    this.baseUrl = trimTrailingSlashes(options.baseUrl ?? BASE_URLS[environment]);
    this.#publishableKey = key;
    this.#attribution = options.attribution;
    this.#timezone =
      options.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    this.#timeoutMs = positive(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs');
    this.#streamTimeoutMs = positive(
      options.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
      'streamTimeoutMs',
    );
    const custom = options.fetch;
    // Called unbound, as the browser's fetch requires. Looked up per call, so it can be replaced.
    this.#fetch = custom
      ? (input, init) => custom(input, init)
      : (input, init) => fetch(input, init);
    this.#onSessionEnd = options.onSessionEnd;
    this.#onDiagnostic = options.onDiagnostic;
    if (typeof document !== 'undefined') {
      // Timers don't run in a suspended tab: catch up as soon as it's visible again.
      document.addEventListener('visibilitychange', this.#onVisible, {
        signal: this.#lifetime.signal,
      });
    }
  }

  get sessionStatus(): SessionStatus {
    if (this.#session && Date.now() >= this.#session.expiresAtMs) this.#expire('expired');
    if (this.#session) return 'active';
    return this.#ended ?? 'none';
  }

  get hasSession(): boolean {
    return this.sessionStatus === 'active';
  }

  /** True once `dispose()` has run. */
  get disposed(): boolean {
    return this.#lifetime.signal.aborted;
  }

  /**
   * The deployment's theme, copy, intake rules, rating and pause state. Needs no session. Cached
   * per client; pass `refresh: true` to fetch it again, such as to see whether a paused deployment
   * is back. A transient failure is retried twice; a bad key isn't.
   */
  getConfig({ refresh = false }: { refresh?: boolean } = {}): Promise<DeploymentConfig> {
    this.#assertLive();
    if (!this.#config || refresh) {
      const config = this.#loadConfig();
      this.#config = config;
      config.catch(() => {
        if (this.#config === config) this.#config = null; // A later call tries again.
      });
    }
    return this.#config;
  }

  /**
   * Starts an anonymous embed session, replacing any current one. The server checks eligibility:
   * an ineligible visitor gets `error.embed.ineligible` (show `intake.ineligibleMessage`). A paused
   * deployment answers `error.embed.paused`, too many attempts `error.embed.rate_limited` (wait
   * `retryAfter`). Never retried: on a failure, the visitor tries again. Refused without a request
   * when the deployment's state rule is one this version doesn't know.
   */
  async startSession({
    intake,
    termsAccepted,
  }: {
    intake: Intake;
    termsAccepted: boolean;
  }): Promise<void> {
    this.#assertLive();
    const config = await this.getConfig();
    if (stateStep(config.intake).mode === 'unsupported') {
      throw new DoctronicError(
        "The deployment's state rule is one this version doesn't support, so no session starts.",
        { code: ErrorCode.unsupportedIntake },
      );
    }
    this.#endSession('replaced');
    const generation = this.#generation;
    const sentAt = Date.now();
    const attribution = this.#attribution;
    const response = (await this.#request('POST /embed/sessions/', {
      body: {
        key: this.#publishableKey,
        termsAccepted,
        intake,
        ...(attribution && Object.keys(attribution).length ? { attribution } : {}),
      },
    })) as SessionResponse;
    if (generation !== this.#generation) {
      throw new DoctronicError('The client was disposed or restarted.', {
        code: ErrorCode.disposed,
      });
    }
    this.#setSession(response, sentAt);
  }

  /**
   * Creates a chat in the current session. When the visitor picked one of the deployment's
   * starter prompts, pass its index, then `send()` its `message`. Never retried.
   */
  async createChat({ starterPromptIndex }: { starterPromptIndex?: number } = {}): Promise<Chat> {
    this.#assertLive();
    const generation = this.#generation;
    const body =
      starterPromptIndex === undefined
        ? { timezone: this.#timezone }
        : { timezone: this.#timezone, starterPromptIndex };
    const [config, created] = await Promise.all([
      this.getConfig(),
      this.#request('POST /chats/', { body, token: this.#token() }),
    ]);
    const id = isRecord(created) ? created.id : undefined;
    if (typeof id !== 'string' || !id) throw invalidResponse();
    if (generation !== this.#generation) {
      throw new DoctronicError('The session ended while the chat was being created.', {
        code: ErrorCode.noSession,
      });
    }
    const chat = new Chat(this.#host(config, generation), id, generation);
    this.#chats.add(chat);
    return chat;
  }

  /** Ends the client: drops the token, stops refreshing, and aborts requests and streams. */
  dispose(): void {
    if (this.disposed) return;
    this.#endSession('disposed');
    this.#config = null;
    this.#lifetime.abort();
  }

  #host(config: DeploymentConfig, generation: number): ChatHost {
    // Every request a chat makes uses its own session's token, never one that replaced it.
    const token = (): string => {
      if (this.#generation !== generation) {
        throw new DoctronicError("This chat's session has ended.", { code: ErrorCode.noSession });
      }
      return this.#token();
    };
    return {
      config,
      generation: () => this.#generation,
      checkSession: () => this.hasSession,
      openStream: (chatId, userInput, signal) =>
        this.#openStream(chatId, userInput, token(), signal),
      getOfframp: async (chatId, kind) =>
        (await this.#request('GET /embed/chats/{chatId}/offramps/{kind}/', {
          pathParams: { chatId, kind },
          token: token(),
        })) as components['schemas']['OfframpLinkResponse'],
      rate: async (chatId, score) =>
        (await this.#request('POST /embed/chats/{chatId}/rating/', {
          pathParams: { chatId },
          body: { score },
          token: token(),
        })) as components['schemas']['RatingResponse'],
      rateMessage: async (chatId, message) =>
        (await this.#request('PATCH /embed/chats/{chatId}/rating/', {
          pathParams: { chatId },
          body: { message },
          token: token(),
        })) as components['schemas']['RatingResponse'],
      diagnostic: (code) => this.#diagnostic(code),
    };
  }

  async #loadConfig(): Promise<DeploymentConfig> {
    for (let retry = 0; ; retry += 1) {
      try {
        const data = await this.#request('GET /embed/config/', {
          query: { key: this.#publishableKey },
        });
        if (!isRecord(data) || !isRecord(data.content) || !isRecord(data.intake)) {
          throw invalidResponse();
        }
        return withConfigDefaults(data as components['schemas']['EmbedConfigResponse']);
      } catch (error) {
        const delay = retry < CONFIG_MAX_RETRIES ? configRetryDelayMs(error, retry) : null;
        if (delay === null) throw error;
        await this.#sleep(delay);
      }
    }
  }

  #token(): string {
    if (!this.hasSession || !this.#session) {
      throw new DoctronicError('No active embed session. Start one with startSession().', {
        code: ErrorCode.noSession,
      });
    }
    return this.#session.token;
  }

  /** Sends one JSON request and resolves to the envelope's `data`. Never retried here. */
  async #request(key: OperationKey, call: Omit<Call, 'timeoutMs'>): Promise<unknown> {
    const abort = linkAbort(this.#lifetime.signal, call.signal, this.#timeoutMs);
    const sentWith = this.#session;
    try {
      const response = await this.#send(key, call, 'application/json', abort);
      if (!response.ok) throw this.#rejected(await errorFrom(response), call, sentWith);
      return unwrap(key, await readJson(response));
    } catch (error) {
      throw abort.translate(error);
    } finally {
      abort.dispose();
    }
  }

  async #openStream(
    chatId: string,
    userInput: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<OpenStream> {
    const call: Omit<Call, 'timeoutMs'> = {
      pathParams: { chatId },
      body: { userEvent: { type: 'user_message', userInput }, timezone: this.#timezone },
      token,
      signal,
    };
    const abort = linkAbort(this.#lifetime.signal, signal, this.#streamTimeoutMs);
    const sentWith = this.#session;
    let response: Response;
    try {
      response = await this.#send('POST /chats/{chatId}/stream/', call, 'text/event-stream', abort);
      if (!response.ok) throw this.#rejected(await errorFrom(response), call, sentWith);
    } catch (error) {
      abort.dispose();
      throw abort.translate(error);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body || !/^text\/event-stream\b/i.test(contentType)) {
      // A proxy page or a misrouted base URL, not a turn.
      await response.body?.cancel().catch(() => undefined);
      abort.dispose();
      throw invalidResponse();
    }
    const body = response.body;
    const frames = readFrames(body, abort);
    return {
      frames,
      cancel: async () => {
        abort.controller.abort();
        // `return()` on a generator never read skips its `finally`, so its timer is freed here.
        abort.dispose();
        await frames.return(undefined).catch(() => undefined);
        // A turn closed before its first read still holds the body open.
        if (!body.locked) await body.cancel().catch(() => undefined);
      },
    };
  }

  #send(key: OperationKey, call: Omit<Call, 'timeoutMs'>, accept: string, abort: Abort) {
    return this.#fetch(urlFor(this.baseUrl, key, call), {
      method: key.slice(0, key.indexOf(' ')),
      headers: headersFor(call, accept),
      body: call.body === undefined ? null : JSON.stringify(call.body),
      signal: abort.signal,
      // The token is in memory only: no cookies, no credentials of the browser's own.
      credentials: 'omit',
    });
  }

  /** A `401` ends the session that sent the request, never one started since. */
  #rejected(error: APIError, call: Omit<Call, 'timeoutMs'>, sentWith: Session | null): APIError {
    if (call.token !== undefined && sentWith !== null && this.#session === sentWith) {
      if (error instanceof AuthenticationError) this.#expire('expired');
    }
    return error;
  }

  /** `sentAt` is when the request left, so the round trip counts against the token, never for it. */
  #setSession(response: SessionResponse, sentAt: number): void {
    if (!isRecord(response) || typeof response.token !== 'string' || !response.token) {
      throw invalidResponse();
    }
    const now = Date.now();
    // Durations don't depend on this device's clock, which can be minutes off. The absolute times
    // are a fallback for an API that doesn't send them.
    const expiresInMs = seconds(response.expiresInSeconds) ?? seconds(response.expiresAt, now);
    const refreshInMs = seconds(response.refreshInSeconds) ?? seconds(response.refreshAfter, now);
    if (expiresInMs === null) throw invalidResponse();
    const expiresAtMs = sentAt + expiresInMs;
    const refreshAtMs = Math.min(sentAt + (refreshInMs ?? expiresInMs), expiresAtMs);
    this.#session = { token: response.token, refreshAtMs, expiresAtMs };
    this.#ended = null;
    if (now >= expiresAtMs) {
      this.#expire('expired');
      return;
    }
    this.#schedule(refreshAtMs - now);
  }

  #schedule(delayMs: number): void {
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    const generation = this.#generation;
    const delay = Math.min(Math.max(MIN_REFRESH_DELAY_MS, delayMs), MAX_TIMER_MS);
    this.#refreshTimer = setTimeout(() => void this.#refresh(generation), delay);
  }

  readonly #onVisible = (): void => {
    if (document.visibilityState !== 'visible' || !this.#session) return;
    const now = Date.now();
    if (now >= this.#session.expiresAtMs) this.#expire('expired');
    else if (now >= this.#session.refreshAtMs) void this.#refresh(this.#generation);
  };

  /** One refresh at a time: a timer and a returning tab share it. */
  #refresh(generation: number): Promise<void> {
    this.#refreshing ??= this.#refreshSession(generation).finally(() => {
      if (generation === this.#generation) this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async #refreshSession(generation: number): Promise<void> {
    const session = this.#session;
    if (generation !== this.#generation || !session) return;
    // A refresh needs a valid token: past expiry there's nothing to refresh.
    if (Date.now() >= session.expiresAtMs) {
      this.#expire('expired');
      return;
    }
    const sentAt = Date.now();
    try {
      const response = (await this.#request('POST /embed/sessions/refresh/', {
        token: session.token,
      })) as SessionResponse;
      if (generation === this.#generation) this.#setSession(response, sentAt);
    } catch (error) {
      if (generation !== this.#generation || this.#session !== session) return;
      // Permanent: the token was rejected (the 401 already ended the session), its user is gone,
      // or the deployment is paused. Nothing is retried.
      if (error instanceof AuthenticationError || error instanceof NotFoundError) {
        this.#expire('expired');
        return;
      }
      if (error instanceof APIError && error.code === ErrorCode.paused) {
        this.#expire('paused');
        return;
      }
      if (error instanceof APIUserAbortError) return;
      this.#diagnostic('session.refresh_failed');
      const delayMs = error instanceof RateLimitError ? error.retryAfter * 1000 : REFRESH_RETRY_MS;
      // Try again while the token is valid; a wait past expiry ends the session at expiry.
      const retryAtMs = Math.min(Date.now() + delayMs, session.expiresAtMs);
      // The visibility check reads this too, so a returning tab doesn't retry before the wait ends.
      session.refreshAtMs = retryAtMs;
      this.#schedule(retryAtMs - Date.now());
    }
  }

  #expire(cause: 'expired' | 'paused'): void {
    if (!this.#session) return;
    this.#endSession(cause);
    this.#ended = cause;
    try {
      this.#onSessionEnd?.(cause);
    } catch {
      // The partner's callback must not break the client.
    }
  }

  #endSession(cause: SessionEndCause): void {
    this.#generation += 1;
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    this.#refreshTimer = null;
    this.#refreshing = null;
    this.#session = null;
    this.#ended = null;
    const chats = [...this.#chats];
    this.#chats.clear();
    for (const chat of chats) chat.sessionEnded(cause);
  }

  #diagnostic(code: DiagnosticCode): void {
    const count = (this.#diagnostics.get(code) ?? 0) + 1;
    this.#diagnostics.set(code, count);
    try {
      this.#onDiagnostic?.({ code, count });
    } catch {
      // The partner's callback must not break the client.
    }
  }

  #assertLive(): void {
    if (this.disposed) {
      throw new DoctronicError('This client was disposed.', { code: ErrorCode.disposed });
    }
  }

  #sleep(ms: number): Promise<void> {
    const signal = this.#lifetime.signal;
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(new APIUserAbortError());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/** The frames of one turn. The turn's deadline and signals are released when reading stops. */
async function* readFrames(
  body: ReadableStream<Uint8Array>,
  abort: Abort,
): AsyncGenerator<SseFrame, void, undefined> {
  try {
    for await (const frame of parseSse(body)) {
      // One network chunk can hold several frames: deliver none of them after an abort.
      // A timeout stays a timeout; only the caller's abort or dispose() is an abort.
      if (abort.signal.aborted) throw abort.translate(new DOMException('Aborted', 'AbortError'));
      yield frame;
    }
  } catch (error) {
    const translated = abort.translate(error);
    // A dropped connection mid-turn, as opposed to a timeout or an abort.
    throw translated.constructor === APIConnectionError
      ? new APIConnectionError('The stream was interrupted.', { cause: error })
      : translated;
  } finally {
    abort.dispose();
  }
}

/**
 * The wait before retrying a failed config request, or `null` when it's final: a connection
 * failure or timeout, a rate limit up to a minute, or a `5xx`.
 */
function configRetryDelayMs(error: unknown, retry: number): number | null {
  if (error instanceof APIUserAbortError) return null;
  if (error instanceof RateLimitError) {
    const wait = error.retryAfter * 1000;
    return wait > CONFIG_MAX_RETRY_AFTER_MS ? null : wait;
  }
  const transient =
    error instanceof APIConnectionError ||
    error instanceof ServiceUnavailableError ||
    error instanceof InternalServerError;
  return transient ? CONFIG_RETRY_INITIAL_MS * 2 ** retry : null;
}

/** Milliseconds from a duration in seconds, or from an absolute time in Unix seconds when `now` is given. */
function seconds(value: unknown, now?: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return now === undefined ? value * 1000 : value * 1000 - now;
}

function invalidResponse(): DoctronicError {
  return new DoctronicError("The API's response isn't one this client understands.", {
    code: ErrorCode.invalidResponse,
  });
}

function positive(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DoctronicError(`\`${name}\` must be a positive number.`);
  }
  return value;
}

// A loop rather than /\/+$/, which backtracks quadratically on a long run of slashes.
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}
