import type { components } from './generated/schema.js';

/** One entry in the `data` list of an `error.validation_error` response. */
export type ValidationErrorDetail = components['schemas']['ValidationErrorDetail'];

/** Base class for every error this SDK throws. */
export class DoctronicError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The API answered with a non-success status. */
export class APIError extends DoctronicError {
  /** HTTP status code. */
  readonly status: number;
  /** Machine-readable `code` from the error body, such as `error.appointments.slot_unavailable`. */
  readonly code: string | null;
  /** `data` from the error body, when present. */
  readonly data: unknown;
  /** The `X-Request-ID` response header. Store it with failed requests. */
  readonly requestId: string | null;
  /** Response headers. */
  readonly headers: Headers;
  /** The `Retry-After` header in seconds, when present. */
  readonly retryAfter: number | null;

  constructor(status: number, body: unknown, headers: Headers) {
    const envelope = isRecord(body) ? body : {};
    const message =
      typeof envelope.message === 'string' && envelope.message
        ? envelope.message
        : `Request failed with status ${status}`;
    super(message);
    this.status = status;
    this.code = typeof envelope.code === 'string' ? envelope.code : null;
    this.data = envelope.data;
    this.requestId = headers.get('x-request-id');
    this.headers = headers;
    const retryAfterMs = parseRetryAfter(headers.get('retry-after'));
    this.retryAfter = retryAfterMs === undefined ? null : retryAfterMs / 1000;
  }

  /** Builds the subclass that matches `status`. */
  static from(status: number, body: unknown, headers: Headers): APIError {
    const ErrorClass = errorClassFor(status);
    return new ErrorClass(status, body, headers);
  }
}

/** `400`, and the legacy `422` that the docs say to handle the same way. */
export class BadRequestError extends APIError {
  /** Field errors from an `error.validation_error` response; empty for any other code. */
  readonly fieldErrors: ValidationErrorDetail[];

  constructor(status: number, body: unknown, headers: Headers) {
    super(status, body, headers);
    this.fieldErrors =
      this.code === 'error.validation_error' && Array.isArray(this.data)
        ? this.data.filter(isValidationErrorDetail)
        : [];
  }
}

/** `401`: the API token is missing, invalid, or inactive. */
export class AuthenticationError extends APIError {}

/** `403`: the API key lacks the scope the operation requires. `data.requiredScope` names it. */
export class PermissionDeniedError extends APIError {}

/** `404`: the resource is absent from the organization and user scope. */
export class NotFoundError extends APIError {}

/** `409`: a state conflict or an idempotency conflict. Read `code`. */
export class ConflictError extends APIError {}

/** `429`: returned by a proxy or gateway in your path, not by the API itself. */
export class RateLimitError extends APIError {}

/** `503`: the operation didn't start, or the service is briefly unavailable. */
export class ServiceUnavailableError extends APIError {}

/** Any `5xx` other than `503`. */
export class InternalServerError extends APIError {}

/** The request never produced a response: DNS, connection, TLS, or a dropped socket. */
export class APIConnectionError extends DoctronicError {
  constructor(message = 'Connection error.', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The request exceeded `timeoutMs`. */
export class APITimeoutError extends APIConnectionError {
  constructor(options?: { cause?: unknown }) {
    super('Request timed out.', options);
  }
}

/** The caller aborted the request through its `AbortSignal`. */
export class APIUserAbortError extends DoctronicError {
  constructor(options?: { cause?: unknown }) {
    super('Request was aborted.', options);
  }
}

/** `artifacts.waitUntilReady()` ran out of time while the document was still generating. */
export class ArtifactNotReadyError extends DoctronicError {
  readonly artifactId: string;

  constructor(artifactId: string) {
    super(`Artifact ${artifactId} is still generating.`);
    this.artifactId = artifactId;
  }
}

/** A webhook delivery failed signature verification or isn't a valid envelope. */
export class WebhookVerificationError extends DoctronicError {}

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

function isValidationErrorDetail(value: unknown): value is ValidationErrorDetail {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.message === 'string' &&
    typeof value.code === 'string'
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses `Retry-After` as delay-seconds or an HTTP date, in milliseconds. */
export function parseRetryAfter(
  value: string | null,
  now: () => number = Date.now,
): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.ceil(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now());
}
