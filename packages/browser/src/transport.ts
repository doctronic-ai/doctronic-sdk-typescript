// Sending one request: the URL from the generated operation, the abort and timeout signals, and the
// error a failure turns into. Nothing here logs: a request body can hold chat text.

import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  DoctronicError,
  ErrorCode,
  isRecord,
} from './errors.js';
import { operations, type OperationKey } from './generated/operations.js';

/** Longer than this, `setTimeout` overflows and fires at once. */
export const MAX_TIMER_MS = 2 ** 31 - 1;

export interface Call {
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  /** The embed session token, for operations that take one. */
  token?: string;
  signal?: AbortSignal | undefined;
  timeoutMs: number;
}

/** One request's abort signal: the client's lifetime, the caller's signal and a timeout. */
export function linkAbort(
  lifetime: AbortSignal,
  caller: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort();
  const sources = caller ? [lifetime, caller] : [lifetime];
  for (const source of sources) {
    if (source.aborted) controller.abort();
    else source.addEventListener('abort', onAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    Math.min(timeoutMs, MAX_TIMER_MS),
  );
  const clearTimer = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    controller,
    signal: controller.signal,
    clearTimer,
    dispose: (): void => {
      clearTimer();
      for (const source of sources) source.removeEventListener('abort', onAbort);
    },
    translate: (cause: unknown): DoctronicError => {
      if (cause instanceof DoctronicError) return cause;
      if (lifetime.aborted || caller?.aborted) return new APIUserAbortError({ cause });
      if (timedOut) return new APITimeoutError({ cause });
      return new APIConnectionError(undefined, { cause });
    },
  };
}

export type Abort = ReturnType<typeof linkAbort>;

/** The URL for an operation, with its path parameters encoded. */
export function urlFor(
  baseUrl: string,
  key: OperationKey,
  call: Pick<Call, 'pathParams' | 'query'>,
) {
  const path = operations[key].path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = call.pathParams?.[name];
    if (typeof value !== 'string' || !value) {
      throw new DoctronicError(`\`${name}\` must be a non-empty string.`);
    }
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams(call.query).toString();
  return `${baseUrl}${path}${query ? `?${query}` : ''}`;
}

export function headersFor(
  call: Pick<Call, 'body' | 'token'>,
  accept: string,
): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept };
  if (call.body !== undefined) headers['Content-Type'] = 'application/json';
  if (call.token !== undefined) headers.Authorization = `Bearer ${call.token}`;
  return headers;
}

/** Reads a JSON body. A body that isn't JSON reads as `undefined`. */
export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** The success envelope's `data`, or an error when the operation requires it and it's missing. */
export function unwrap(key: OperationKey, body: unknown): unknown {
  const data = isRecord(body) ? body.data : undefined;
  if (operations[key].dataRequired && (data === undefined || data === null)) {
    throw new DoctronicError('The response is missing `data`.', {
      code: ErrorCode.invalidResponse,
    });
  }
  return data ?? null;
}

/** Turns a non-success response into the matching {@link APIError}. */
export async function errorFrom(response: Response): Promise<APIError> {
  const body = await readJson(response).catch(() => undefined);
  return APIError.from(response.status, body, response.headers);
}
