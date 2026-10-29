// Retry rules from the docs' Errors page (errors.mdx), applied per operation using the facts the
// contract declares about it (src/generated/operations.ts).

import { APIUserAbortError, parseRetryAfter } from './errors.js';
import type { OperationSpec } from './generated/operations.js';

export { parseRetryAfter };

export const DEFAULT_MAX_RETRIES = 2;

const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;
const JITTER = 0.25;

/** A `Retry-After` longer than this ends the call instead of holding it open. */
export const MAX_RETRY_AFTER_MS = 60_000;

/** What came back from one attempt. */
export type AttemptOutcome =
  { kind: 'connection' } | { kind: 'status'; status: number; code: string | null };

/**
 * Decides whether a failed attempt may be sent again.
 *
 * - A streamed turn is never resent: it takes no idempotency key and may already have produced
 *   a reply.
 * - A mutation without an `Idempotency-Key` is never resent once it may have reached the server.
 * - Network failures and timeouts are retried for reads and idempotent mutations. For a mutation
 *   the outcome is unknown, so it's resent with the same key and body.
 * - `429` and `503` are retried for reads and idempotent mutations.
 * - `409` is retried only for an idempotent mutation, and only when its code isn't one the
 *   contract documents for that operation, or the contract lists it in
 *   `x-doctronic-retryable-codes` as safe to retry with the same key. A documented code that isn't
 *   listed is a state conflict, or an idempotency error that a retry can't fix, such as a reused
 *   key with a different body. Without the list, every documented code is final, and what's left
 *   is the idempotency conflict, which the docs say to wait out and retry.
 * - Other `5xx` are retried for reads only, unless the contract documents that status for the
 *   operation as a definitive result, like `500` for an artifact whose generation failed.
 */
export function shouldRetry(operation: OperationSpec, outcome: AttemptOutcome): boolean {
  if (operation.stream) return false;
  const safeRead = operation.method === 'GET';
  if (!safeRead && !operation.idempotent) return false;
  if (outcome.kind === 'connection') return true;

  const { status, code } = outcome;
  if (status === 429 || status === 503) return true;
  if (status === 409) {
    if (!operation.idempotent) return false;
    if (code === null || operation.retryableConflictCodes?.includes(code)) return true;
    return !operation.conflictCodes.includes(code);
  }
  if (status >= 500) return safeRead && !operation.statuses.includes(status);
  return false;
}

/**
 * Milliseconds to wait before retry number `retry` (0-based), or `null` when the server asks for
 * a longer wait than {@link MAX_RETRY_AFTER_MS}.
 */
export function retryDelayMs(
  retry: number,
  retryAfter: string | null,
  random: () => number = Math.random,
): number | null {
  const requested = parseRetryAfter(retryAfter);
  if (requested !== undefined) return requested > MAX_RETRY_AFTER_MS ? null : requested;
  const base = Math.min(MAX_DELAY_MS, INITIAL_DELAY_MS * 2 ** retry);
  return base + random() * base * JITTER;
}

/** Waits `ms`, or rejects with {@link APIUserAbortError} as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new APIUserAbortError({ cause: signal.reason }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new APIUserAbortError({ cause: signal?.reason }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
