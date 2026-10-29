import type {
  APIPromise,
  IdempotentRequestOptions,
  RequestBody,
  ResponseData,
  Transport,
} from './client.js';

export type SetCoverageParams = RequestBody<'PUT /coverage/'>;

export class CoverageResource {
  readonly #transport: Transport;
  readonly #userId: string;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.#transport = transport;
    this.#userId = userId;
  }

  /**
   * `PUT /coverage/`: store or replace the patient's primary coverage. Send every required field
   * on every call.
   */
  set(
    body: SetCoverageParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'PUT /coverage/', 200>> {
    return this.#transport.request('PUT /coverage/', { body, userId: this.#userId, options });
  }
}
