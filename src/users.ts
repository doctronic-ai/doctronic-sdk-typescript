import type {
  APIPromise,
  IdempotentRequestOptions,
  RequestBody,
  RequestOptions,
  ResponseData,
  Transport,
} from './client.js';
import type { components } from './generated/schema.js';

/** A Doctronic user: the record for one patient in your organization. */
export type User = components['schemas']['UserCreatedResponse'];
export type Sex = components['schemas']['Sex'];
export type CreateUserParams = RequestBody<'POST /users/'>;
/** Send only the fields to change. `null` clears a field; an omitted or `undefined` one keeps it. */
export type UpdateUserParams = RequestBody<'PATCH /users/'>;

/** Org-scoped: create users. */
export class UsersResource {
  readonly #transport: Transport;

  /** @internal */
  constructor(transport: Transport) {
    this.#transport = transport;
  }

  /** `POST /users/`. Every field is optional. Store the returned `id` with the patient record. */
  create(
    body: CreateUserParams = {},
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'POST /users/', 201>> {
    return this.#transport.request('POST /users/', { body, options });
  }
}

/** User-scoped: read and update the user in `forUser()`. */
export class ScopedUsersResource {
  readonly #transport: Transport;
  readonly #userId: string;

  /** @internal */
  constructor(transport: Transport, userId: string) {
    this.#transport = transport;
    this.#userId = userId;
  }

  /** `GET /users/`: the user's profile. */
  retrieve(options?: RequestOptions): APIPromise<ResponseData<'GET /users/', 200>> {
    return this.#transport.request('GET /users/', { userId: this.#userId, options });
  }

  /**
   * `PATCH /users/`: correct or complete the profile. A replayed update returns the original
   * response; call `retrieve()` for the current profile.
   */
  update(
    body: UpdateUserParams,
    options?: IdempotentRequestOptions,
  ): APIPromise<ResponseData<'PATCH /users/', 200>> {
    return this.#transport.request('PATCH /users/', { body, userId: this.#userId, options });
  }
}
