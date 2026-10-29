import type { APIPromise, APIResponse, RequestOptions, ResponseData, Transport } from './client.js';
import { APIUserAbortError, ArtifactNotReadyError, DoctronicError } from './errors.js';
import type { components } from './generated/schema.js';
import { sleep } from './retry.js';

/** A consultation document: a summary, SOAP note, or clinician note. */
export type Artifact = ResponseData<'GET /artifacts/{artifactId}/', 200>;
export type ArtifactType = components['schemas']['ArtifactResponse']['artifactType'];

export interface WaitUntilReadyOptions {
  /** How long to keep polling while the document is generating. Default 120 s. */
  timeoutMs?: number | undefined;
  /** Stops polling. */
  signal?: AbortSignal | undefined;
}

const DEFAULT_WAIT_MS = 120_000;
const INITIAL_POLL_MS = 1_000;
const MAX_POLL_MS = 16_000;
const MAX_TIMER_MS = 2 ** 31 - 1;

export class ArtifactsResource {
  readonly #transport: Transport;
  readonly #userId: string;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.#transport = transport;
    this.#userId = userId;
  }

  /**
   * `GET /artifacts/{artifactId}/`. Resolves to `null` while the document is still generating
   * (`202`). Rejects with `NotFoundError` when it's outside this user's scope, and with
   * `InternalServerError` (`error.internal`) when generation failed permanently.
   *
   * Before you attach the document to a record, check that `content.chatId` is the chat whose
   * completion event or appointment result supplied the ID.
   */
  retrieve(artifactId: string, options?: RequestOptions): APIPromise<Artifact | null> {
    return this.#transport.request('GET /artifacts/{artifactId}/', {
      pathParams: { artifactId },
      userId: this.#userId,
      options,
    });
  }

  /**
   * Polls `retrieve()` with bounded exponential backoff while the document is generating.
   * Stops on `404` and `500` with their typed errors. `timeoutMs` bounds the whole wait,
   * including requests in flight and their retries; when it passes, rejects with
   * `ArtifactNotReadyError`. You can wait for the `artifact.ready` webhook instead.
   */
  waitUntilReady(artifactId: string, options: WaitUntilReadyOptions = {}): APIPromise<Artifact> {
    return this.#transport.wrap(this.#wait(artifactId, options));
  }

  async #wait(artifactId: string, options: WaitUntilReadyOptions): Promise<APIResponse<Artifact>> {
    const { signal, timeoutMs = DEFAULT_WAIT_MS } = options;
    if (typeof timeoutMs !== 'number' || Number.isNaN(timeoutMs) || timeoutMs <= 0) {
      throw new DoctronicError('`timeoutMs` must be a positive number.');
    }
    // One signal for the whole wait: the caller's, or the deadline, whichever comes first.
    const wait = new AbortController();
    const onAbort = () => wait.abort(signal?.reason);
    const timer = setTimeout(() => wait.abort(), Math.min(timeoutMs, MAX_TIMER_MS));
    if (signal?.aborted) wait.abort(signal.reason);
    else signal?.addEventListener('abort', onAbort, { once: true });

    try {
      for (let poll = 0; ; poll += 1) {
        const result = await this.retrieve(artifactId, { signal: wait.signal }).withResponse();
        if (result.data !== null) return { ...result, data: result.data };
        const delay = Math.min(MAX_POLL_MS, INITIAL_POLL_MS * 2 ** poll);
        await sleep(delay + Math.random() * delay * 0.1, wait.signal);
      }
    } catch (error) {
      const expired = wait.signal.aborted && !signal?.aborted;
      if (expired && error instanceof APIUserAbortError)
        throw new ArtifactNotReadyError(artifactId);
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
