// The errors this package throws. They follow the server SDK's classes (`APIError` and one
// subclass per status), but read the rate limit's wait from the body: a browser can't read the
// `Retry-After` header unless the API's CORS config exposes it.

/** Stable codes to branch on. Never branch on an error's message. */
export const ErrorCode = {
  keyInvalid: 'error.embed.key_invalid',
  notConfigured: 'error.embed.not_configured',
  sessionInvalid: 'error.embed.session_invalid',
  ineligible: 'error.embed.ineligible',
  termsNotAccepted: 'error.embed.terms_not_accepted',
  paused: 'error.embed.paused',
  rateLimited: 'error.embed.rate_limited',
  /** A rate limit sent as a stream `error` event. */
  streamRateLimited: 'error.rate_limited',
  offrampNotFound: 'error.embed.offramp_not_found',
  ratingNotConfigured: 'error.embed.rating_not_configured',
  chatNotFound: 'error.partner.chat_not_found',
  /** Raised by this client, not the server. */
  noSession: 'error.client.no_session',
  chatBusy: 'error.client.chat_busy',
  chatEnded: 'error.client.chat_ended',
  disposed: 'error.client.disposed',
  /** The deployment's state rule is one this version doesn't know. */
  unsupportedIntake: 'error.client.unsupported_intake',
  streamInterrupted: 'error.client.stream_interrupted',
  /** The request or stream timed out. */
  timeout: 'error.client.timeout',
  /** The connection failed or dropped. */
  connection: 'error.client.connection',
  invalidResponse: 'error.client.invalid_response',
} as const;

/** The wait, in seconds, when a rate-limited answer doesn't say how long. */
export const DEFAULT_RETRY_AFTER_SECONDS = 10;

/**
 * The longest wait honoured, in seconds: a day, the API's longest rate-limit window. A longer value
 * is a bad one, and past about 24.8 days `setTimeout` overflows and fires at once.
 */
export const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

/** Base class for every error this package throws. */
export class DoctronicError extends Error {
  /** A stable code, such as `error.embed.paused`, or `null`. See {@link ErrorCode}. */
  readonly code: string | null;

  constructor(message: string, options: { code?: string | null; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? null;
  }
}

/** The API answered with a non-success status. */
export class APIError extends DoctronicError {
  /** HTTP status code. */
  readonly status: number;
  /** `data` from the error body, when present. */
  readonly data: unknown;
  /** The `X-Request-ID` response header, when the API's CORS config exposes it. */
  readonly requestId: string | null;
  /** Seconds to wait before trying again, from the body's `data.retryAfter` or `Retry-After`. */
  readonly retryAfter: number | null;

  constructor(status: number, body: unknown, headers: Headers) {
    const envelope = isRecord(body) ? body : {};
    const message =
      typeof envelope.message === 'string' && envelope.message
        ? envelope.message
        : `Request failed with status ${status}`;
    super(message, { code: typeof envelope.code === 'string' ? envelope.code : null });
    this.status = status;
    this.data = envelope.data;
    this.requestId = headers.get('x-request-id');
    const fromBody = isRecord(envelope.data) ? envelope.data.retryAfter : undefined;
    const fromHeader = headers.get('retry-after');
    this.retryAfter = validRetryAfter(
      typeof fromBody === 'number' ? fromBody : fromHeader === null ? null : Number(fromHeader),
      status === 429 || this.code === ErrorCode.rateLimited,
    );
  }

  /** Builds the subclass that matches `status`. */
  static from(status: number, body: unknown, headers: Headers): APIError {
    const ErrorClass = errorClassFor(status);
    return new ErrorClass(status, body, headers);
  }
}

/** `400`, and the legacy `422` handled the same way. */
export class BadRequestError extends APIError {}

/** `401`: an unknown publishable key, or an embed session token that is missing, invalid or expired. */
export class AuthenticationError extends APIError {}

/** `403`: the visitor isn't eligible, or the terms weren't accepted. Read `code`. */
export class PermissionDeniedError extends APIError {}

/** `404`: the chat, off-ramp or user isn't there. A chat a guardian ended answers this too. */
export class NotFoundError extends APIError {}

/** `409`: a state conflict, such as a reply still streaming. Read `code`. */
export class ConflictError extends APIError {}

/** `429`: too many requests. `retryAfter` is always set: the API's wait, or a default. */
export class RateLimitError extends APIError {
  declare readonly retryAfter: number;
}

/** `503`: the deployment is paused (`error.embed.paused`) or embed sessions aren't configured. */
export class ServiceUnavailableError extends APIError {}

/** Any `5xx` other than `503`. */
export class InternalServerError extends APIError {}

/** The request never produced a response: DNS, connection, CORS, or a dropped socket. */
export class APIConnectionError extends DoctronicError {
  constructor(message = 'Connection error.', options: { cause?: unknown } = {}) {
    super(message, options);
  }
}

/** The request took longer than its timeout. */
export class APITimeoutError extends APIConnectionError {
  constructor(options: { cause?: unknown } = {}) {
    super('Request timed out.', options);
  }
}

/** The caller aborted the request through its `AbortSignal`, or the client was disposed. */
export class APIUserAbortError extends DoctronicError {
  constructor(options: { cause?: unknown } = {}) {
    super('Request was aborted.', options);
  }
}

function errorClassFor(status: number): typeof APIError {
  if (status === 400 || status === 422) return BadRequestError;
  if (status === 401) return AuthenticationError;
  if (status === 403) return PermissionDeniedError;
  if (status === 404) return NotFoundError;
  if (status === 409) return ConflictError;
  if (status === 429) return RateLimitError;
  if (status === 503) return ServiceUnavailableError;
  if (status >= 500) return InternalServerError;
  return APIError;
}

/**
 * A positive number of seconds, at most {@link MAX_RETRY_AFTER_SECONDS}. Otherwise the default when
 * `rateLimited`, else `null`.
 */
export function validRetryAfter(value: unknown, rateLimited: boolean): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.min(value, MAX_RETRY_AFTER_SECONDS);
  }
  return rateLimited ? DEFAULT_RETRY_AFTER_SECONDS : null;
}

/** @internal */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
