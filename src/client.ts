import { AddressResource } from './address.js';
import { AppointmentsResource } from './appointments.js';
import { ArtifactsResource } from './artifacts.js';
import { ChatsResource } from './chats.js';
import { CoverageResource } from './coverage.js';
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  DoctronicError,
  isRecord,
} from './errors.js';
import { operations, type OperationKey, type OperationSpec } from './generated/operations.js';
import type { paths } from './generated/schema.js';
import { PharmacyResource, ScopedPharmacyResource } from './pharmacy.js';
import {
  DEFAULT_MAX_RETRIES,
  retryDelayMs,
  shouldRetry,
  sleep,
  type AttemptOutcome,
} from './retry.js';
import { ChatStream } from './streaming.js';
import { ScopedUsersResource, UsersResource } from './users.js';

export const VERSION = '0.1.0';

export const BASE_URLS = {
  staging: 'https://staging-partners.doctronic.ai/api/v1',
  production: 'https://partners.doctronic.ai/api/v1',
} as const;

export type Environment = keyof typeof BASE_URLS;

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMER_MS = 2 ** 31 - 1;

export interface ClientOptions {
  /** Your organization's API token. Defaults to `DOCTRONIC_API_TOKEN`. */
  apiToken?: string | undefined;
  /** Defaults to `DOCTRONIC_ENVIRONMENT`, then `"staging"`. */
  environment?: Environment | undefined;
  /** Overrides the environment's base URL. */
  baseUrl?: string | undefined;
  /** Per-attempt timeout for JSON requests, and the time a stream may take to start. Default 60 s. */
  timeoutMs?: number | undefined;
  /** Retries after the first attempt, for the failures the docs mark retryable. Default 2. */
  maxRetries?: number | undefined;
  /** A `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch | undefined;
  /**
   * The API token authorizes your organization's whole scope and must stay on your backend.
   * The client refuses to run in a browser unless this is `true`.
   */
  dangerouslyAllowBrowser?: boolean | undefined;
}

export interface RequestOptions {
  /** Aborts the request, including any retry wait. */
  signal?: AbortSignal | undefined;
  /** Overrides the client's `timeoutMs` for this call. */
  timeoutMs?: number | undefined;
  /** Overrides the client's `maxRetries` for this call. */
  maxRetries?: number | undefined;
}

export interface IdempotentRequestOptions extends RequestOptions {
  /**
   * Sent as `Idempotency-Key` on every attempt of this call. Defaults to a new UUID per call.
   * Pass your own to make a retry across processes safe; use each key for one request body only.
   */
  idempotencyKey?: string | undefined;
}

/** The unwrapped `data` plus the raw response it came from. */
export interface APIResponse<T> {
  data: T;
  response: Response;
  /** The `X-Request-ID` response header. */
  requestId: string | null;
  /** The `Idempotency-Key` this call sent on every attempt, or `null` for other operations. */
  idempotencyKey: string | null;
  /** `true` when the API replayed a stored result for the idempotency key. */
  idempotencyReplayed: boolean;
}

/**
 * The value every resource method returns. Await it for the unwrapped `data`, or call
 * `.withResponse()` for the status, headers, and request ID as well.
 */
export class APIPromise<T> implements PromiseLike<T> {
  readonly #response: Promise<APIResponse<T>>;

  /** @internal */
  constructor(response: Promise<APIResponse<T>>) {
    this.#response = response;
  }

  withResponse(): Promise<APIResponse<T>> {
    return this.#response;
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.#response.then(({ data }) => data).then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.then(undefined, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.then().finally(onfinally);
  }

  get [Symbol.toStringTag](): string {
    return 'APIPromise';
  }
}

// Types for each operation, read from the generated schema by operation key.
type Operation<K extends OperationKey> = K extends `${infer M} ${infer P}`
  ? P extends keyof paths
    ? Lowercase<M> extends keyof paths[P]
      ? paths[P][Lowercase<M>]
      : never
    : never
  : never;
type JsonContent<T> = T extends { content: { 'application/json': infer C } } ? C : never;

/** The JSON request body of an operation. */
export type RequestBody<K extends OperationKey> =
  Operation<K> extends { requestBody?: infer B } ? JsonContent<NonNullable<B>> : never;

/** The query parameters of an operation. */
export type QueryParams<K extends OperationKey> =
  Operation<K> extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

/** The envelope's `data` for one response status of an operation. */
export type ResponseData<K extends OperationKey, S extends number> =
  Operation<K> extends { responses: infer R }
    ? S extends keyof R
      ? JsonContent<R[S]> extends { data?: infer D }
        ? D
        : unknown
      : never
    : never;

type Query = Record<string, string | number | boolean | null | undefined>;

/** @internal */
export interface Call {
  pathParams?: Record<string, string>;
  query?: Query | undefined;
  body?: unknown;
  userId?: string | undefined;
  options?: IdempotentRequestOptions | undefined;
}

interface TransportConfig {
  apiToken: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: typeof fetch;
}

type AttemptResult =
  | { ok: true; response: Response; body: unknown }
  | { ok: false; error: DoctronicError; outcome: AttemptOutcome; retryAfter: string | null };

function connectionFailure(error: DoctronicError): AttemptResult {
  return { ok: false, error, outcome: { kind: 'connection' }, retryAfter: null };
}

function statusFailure(error: APIError): AttemptResult {
  return {
    ok: false,
    error,
    outcome: { kind: 'status', status: error.status, code: error.code },
    retryAfter: error.headers.get('retry-after'),
  };
}

function malformed(response: Response, message: string): APIError {
  return new APIError(response.status, { message }, response.headers);
}

function hasData(body: unknown): boolean {
  return isRecord(body) && body.data !== undefined && body.data !== null;
}

function responseInfo(response: Response, headers: Record<string, string>) {
  return {
    response,
    requestId: response.headers.get('x-request-id'),
    idempotencyKey: headers['Idempotency-Key'] ?? null,
    idempotencyReplayed: response.headers.get('idempotency-replayed') === 'true',
  };
}

/** @internal Sends requests. Holds the token in a private field so it never prints. */
export class Transport {
  readonly baseUrl: string;
  readonly #apiToken: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;

  constructor(config: TransportConfig) {
    this.baseUrl = config.baseUrl;
    this.#apiToken = config.apiToken;
    this.#timeoutMs = config.timeoutMs;
    this.#maxRetries = config.maxRetries;
    this.#fetch = config.fetch;
  }

  /** Sends a JSON request and resolves to the envelope's `data`. */
  request<T>(key: OperationKey, call: Call = {}): APIPromise<T> {
    return new APIPromise(this.#execute<T>(operations[key], call));
  }

  /** Wraps a multi-request helper so it offers `.withResponse()` like every other method. */
  wrap<T>(response: Promise<APIResponse<T>>): APIPromise<T> {
    return new APIPromise(response);
  }

  /** Opens a stream. Resolves once the server accepts the turn; never retried. */
  stream(key: OperationKey, call: Call = {}): APIPromise<ChatStream> {
    return new APIPromise(this.#openStream(operations[key], call));
  }

  async #execute<T>(operation: OperationSpec, call: Call): Promise<APIResponse<T>> {
    const options = call.options ?? {};
    const url = this.#url(operation, call);
    const headers = this.#headers(operation, call, false);
    const body = call.body === undefined ? undefined : JSON.stringify(call.body);
    const maxRetries = resolveMaxRetries(options.maxRetries ?? this.#maxRetries);
    const timeoutMs = resolveTimeout(options.timeoutMs ?? this.#timeoutMs);

    for (let retry = 0; ; retry += 1) {
      const result = await this.#attempt(operation, url, headers, body, options.signal, timeoutMs);
      if (result.ok) {
        return {
          data: unwrap(result.response.status, result.body) as T,
          ...responseInfo(result.response, headers),
        };
      }
      const { error, outcome } = result;
      if (error instanceof APIUserAbortError) throw error;
      if (retry >= maxRetries || !shouldRetry(operation, outcome)) throw error;
      const delay = retryDelayMs(retry, result.retryAfter);
      if (delay === null) throw error;
      await sleep(delay, options.signal);
    }
  }

  async #attempt(
    operation: OperationSpec,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<AttemptResult> {
    const abort = linkAbort(signal, timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: operation.method,
        headers,
        body: body ?? null,
        signal: abort.signal,
      });
    } catch (cause) {
      abort.dispose();
      return connectionFailure(abort.translate(cause));
    }

    try {
      const { parsed, valid } = await readJson(response);
      if (!response.ok)
        return statusFailure(APIError.from(response.status, parsed, response.headers));
      if (!valid) return statusFailure(malformed(response, 'The response body is not valid JSON.'));
      if (response.status !== 202 && operation.dataRequired && !hasData(parsed)) {
        return statusFailure(malformed(response, 'The response is missing `data`.'));
      }
      return { ok: true, response, body: parsed };
    } catch (cause) {
      const error = abort.translate(cause);
      // A cut-off success body leaves the outcome unknown, like a dropped connection. A cut-off
      // error body still has its status and headers, so the retry rules for that status apply.
      if (response.ok || error instanceof APIUserAbortError) return connectionFailure(error);
      return statusFailure(APIError.from(response.status, undefined, response.headers));
    } finally {
      abort.dispose();
    }
  }

  async #openStream(operation: OperationSpec, call: Call): Promise<APIResponse<ChatStream>> {
    const options = call.options ?? {};
    const abort = linkAbort(options.signal, resolveTimeout(options.timeoutMs ?? this.#timeoutMs));
    let response: Response;
    let headers: Record<string, string>;
    try {
      headers = this.#headers(operation, call, true);
      response = await this.#fetch(this.#url(operation, call), {
        method: operation.method,
        headers,
        body: JSON.stringify(call.body),
        signal: abort.signal,
      });
    } catch (cause) {
      abort.dispose();
      throw abort.translate(cause);
    }
    if (!response.ok) {
      // Errors before the stream starts arrive as ordinary JSON responses.
      const { parsed } = await readJson(response).catch(() => ({ parsed: undefined }));
      abort.dispose();
      throw APIError.from(response.status, parsed, response.headers);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body || !/^text\/event-stream\b/i.test(contentType)) {
      // A proxy page or a misrouted base URL, not a turn. Don't report it as an empty one.
      await response.body?.cancel().catch(() => undefined);
      abort.dispose();
      throw malformed(
        response,
        `Expected an event stream, got "${contentType || 'no content type'}".`,
      );
    }
    // The turn has started. Only the caller's signal or `abort()` ends it from here.
    abort.clearTimer();
    const stream = new ChatStream(response, abort.controller, () => abort.dispose());
    return { data: stream, ...responseInfo(response, headers) };
  }

  #url(operation: OperationSpec, call: Call): string {
    const path = operation.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = call.pathParams?.[name];
      if (typeof value !== 'string' || !value) {
        throw new DoctronicError(`\`${name}\` must be a non-empty string.`);
      }
      return encodeURIComponent(value);
    });
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(call.query ?? {})) {
      if (value !== undefined && value !== null) search.append(name, String(value));
    }
    const query = search.toString();
    return `${this.baseUrl}${path}${query ? `?${query}` : ''}`;
  }

  #headers(operation: OperationSpec, call: Call, stream: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiToken}`,
      Accept: stream ? 'text/event-stream' : 'application/json',
      'User-Agent': `doctronic-typescript/${VERSION}`,
    };
    if (call.body !== undefined) headers['Content-Type'] = 'application/json';
    if (operation.userScoped) {
      if (!call.userId) {
        throw new DoctronicError('This operation needs a user. Use `client.forUser(userId)`.');
      }
      headers['X-Doctronic-User-ID'] = call.userId;
    }
    if (operation.idempotent) {
      // One key per call, reused by every retry of that call.
      headers['Idempotency-Key'] = resolveIdempotencyKey(call.options?.idempotencyKey);
    }
    return headers;
  }
}

/** Org-scoped operations, and `forUser()` for everything about one patient. */
export class Doctronic {
  readonly environment: Environment;
  readonly baseUrl: string;

  /** `POST /users/`: create the Doctronic user for a patient. */
  readonly users: UsersResource;
  /** `POST /pharmacy/search/`: search pharmacies. */
  readonly pharmacy: PharmacyResource;

  readonly #transport: Transport;

  constructor(options: ClientOptions = {}) {
    if (isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new DoctronicError(
        'The Doctronic client refuses to run in a browser: the API token authorizes your ' +
          "organization's whole scope and must stay on your backend. Call Doctronic from your " +
          'server, or pass `dangerouslyAllowBrowser: true` if you understand the risk.',
      );
    }
    const apiToken = options.apiToken ?? readEnv('DOCTRONIC_API_TOKEN');
    if (!apiToken) {
      throw new DoctronicError(
        'Missing API token. Pass `apiToken` or set the DOCTRONIC_API_TOKEN environment variable.',
      );
    }
    const environment = options.environment ?? readEnv('DOCTRONIC_ENVIRONMENT') ?? 'staging';
    if (!Object.hasOwn(BASE_URLS, environment)) {
      throw new DoctronicError(
        `Unknown environment "${environment}". Use "staging" or "production".`,
      );
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new DoctronicError('No `fetch` available. Use Node 20 or later, or pass `fetch`.');
    }

    this.environment = environment as Environment;
    this.baseUrl = (options.baseUrl ?? BASE_URLS[this.environment]).replace(/\/+$/, '');
    this.#transport = new Transport({
      apiToken,
      baseUrl: this.baseUrl,
      timeoutMs: resolveTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      maxRetries: resolveMaxRetries(options.maxRetries ?? DEFAULT_MAX_RETRIES),
      fetch: fetchImpl,
    });
    this.users = new UsersResource(this.#transport);
    this.pharmacy = new PharmacyResource(this.#transport);
  }

  /**
   * Returns a client scoped to one Doctronic user. It sends `X-Doctronic-User-ID` on every
   * request. Derive `userId` on your backend from the patient your system authenticated.
   */
  forUser(userId: string): UserScopedClient {
    if (typeof userId !== 'string' || !userId) {
      throw new DoctronicError('`userId` must be a non-empty string.');
    }
    return new UserScopedClient(this.#transport, userId);
  }
}

/** Every user-scoped operation, for the user in `userId`. Create it with `client.forUser()`. */
export class UserScopedClient {
  readonly userId: string;

  readonly users: ScopedUsersResource;
  readonly chats: ChatsResource;
  readonly appointments: AppointmentsResource;
  readonly address: AddressResource;
  readonly pharmacy: ScopedPharmacyResource;
  readonly coverage: CoverageResource;
  readonly artifacts: ArtifactsResource;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.userId = userId;
    this.users = new ScopedUsersResource(transport, userId);
    this.chats = new ChatsResource(transport, userId);
    this.appointments = new AppointmentsResource(transport, userId);
    this.address = new AddressResource(transport, userId);
    this.pharmacy = new ScopedPharmacyResource(transport, userId);
    this.coverage = new CoverageResource(transport, userId);
    this.artifacts = new ArtifactsResource(transport, userId);
  }
}

function unwrap(status: number, body: unknown): unknown {
  // `202` means not ready yet (a generating artifact, a pending visit result): resolve to `null`.
  if (status === 202) return null;
  // The success envelope is `{code, message, data}`.
  return isRecord(body) && 'data' in body ? (body.data ?? null) : null;
}

async function readJson(response: Response): Promise<{ parsed: unknown; valid: boolean }> {
  const text = await response.text();
  if (!text) return { parsed: undefined, valid: true };
  try {
    return { parsed: JSON.parse(text) as unknown, valid: true };
  } catch {
    // An error from a proxy can carry HTML. A success must be JSON.
    return { parsed: undefined, valid: false };
  }
}

function resolveIdempotencyKey(key: string | undefined): string {
  if (key === undefined) return crypto.randomUUID();
  if (typeof key !== 'string' || !key || key.length > 255) {
    throw new DoctronicError('`idempotencyKey` must be a string of 1 to 255 characters.');
  }
  return key;
}

function resolveTimeout(timeoutMs: number): number {
  if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    throw new DoctronicError('`timeoutMs` must be a positive number.');
  }
  return Math.min(timeoutMs, MAX_TIMER_MS);
}

function resolveMaxRetries(maxRetries: number): number {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new DoctronicError('`maxRetries` must be a non-negative integer.');
  }
  return maxRetries;
}

/** One attempt's abort signal: the caller's signal plus a timeout. */
function linkAbort(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(signal?.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener('abort', onAbort, { once: true });

  return {
    controller,
    signal: controller.signal,
    clearTimer: () => clearTimeout(timer),
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
    translate: (cause: unknown): DoctronicError => {
      if (cause instanceof DoctronicError) return cause;
      if (signal?.aborted) return new APIUserAbortError({ cause });
      if (timedOut) return new APITimeoutError({ cause });
      return new APIConnectionError(undefined, { cause });
    },
  };
}

function readEnv(name: string): string | undefined {
  const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.[name];
  return value ? value : undefined;
}

function isBrowser(): boolean {
  const scope = globalThis as { window?: { document?: unknown }; importScripts?: unknown };
  const inWorker = typeof scope.importScripts === 'function';
  return (
    typeof scope.window !== 'undefined' && typeof scope.window.document !== 'undefined' && !inWorker
  );
}
