import type {
  APIPromise,
  IdempotentRequestOptions,
  RequestBody,
  ResponseData,
  Transport,
} from './client.js';
import type { components } from './generated/schema.js';

export type Pharmacy = components['schemas']['Pharmacy'];
export type PharmacySearchResults = components['schemas']['PharmacySearchResponse'];
export type PharmacySearchParams = RequestBody<'POST /pharmacy/search/'>;
export type SetPharmacyParams = RequestBody<'PUT /pharmacy/'>;

/** Org-scoped: search pharmacies. */
export class PharmacyResource {
  readonly #transport: Transport;

  /** @internal */
  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /** `POST /pharmacy/search/`: results are ranked by proximity without a `searchTerm`. */
  search(
    body: PharmacySearchParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'POST /pharmacy/search/', 200>> {
    return this.#transport.request('POST /pharmacy/search/', { body, options });
  }
}

/** User-scoped: save the user's preferred pharmacy. */
export class ScopedPharmacyResource {
  readonly #transport: Transport;
  readonly #userId: string;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.#transport = transport;
    this.#userId = userId;
  }

  /** `PUT /pharmacy/`: save or replace the preferred pharmacy by its seven-digit `ncpdpId`. */
  set(
    body: SetPharmacyParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'PUT /pharmacy/', 200>> {
    return this.#transport.request('PUT /pharmacy/', { body, userId: this.#userId, options });
  }
}
