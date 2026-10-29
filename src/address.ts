import type {
  APIPromise,
  IdempotentRequestOptions,
  RequestBody,
  RequestOptions,
  ResponseData,
  Transport,
} from './client.js';
import type { components } from './generated/schema.js';

export type Address = components['schemas']['AddressResponse'];
export type SetAddressParams = RequestBody<'PUT /address/'>;

export class AddressResource {
  readonly #transport: Transport;
  readonly #userId: string;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.#transport = transport;
    this.#userId = userId;
  }

  /** `GET /address/`. Rejects with `NotFoundError` (`error.address.not_found`) when none is on file. */
  retrieve(options?: RequestOptions): APIPromise<ResponseData<'GET /address/', 200>> {
    return this.#transport.request('GET /address/', { userId: this.#userId, options });
  }

  /**
   * `PUT /address/`: create or replace the address. Booking needs `line1`, `city`, `state`, and
   * `postalCode`.
   */
  set(
    body: SetAddressParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'PUT /address/', 200>> {
    return this.#transport.request('PUT /address/', { body, userId: this.#userId, options });
  }
}
