/**
 * Generated from the Doctronic API contract by `npm run generate`. Do not edit by hand.
 */

export interface OperationSpec {
  /** HTTP method. */
  readonly method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template relative to the base URL. */
  readonly path: string;
  /** The operation declares an `Idempotency-Key` header. */
  readonly idempotent: boolean;
  /** The operation takes the embed session token. Without it, the operation is public. */
  readonly sessionToken: boolean;
  /** The operation responds with `text/event-stream`. */
  readonly stream: boolean;
  /** Every response status the contract documents for the operation. */
  readonly statuses: readonly number[];
  /** Error codes the contract documents for the operation's `409` response. */
  readonly conflictCodes: readonly string[];
  /**
   * The `409` codes the contract marks safe to retry with the same idempotency key
   * (`x-doctronic-retryable-codes`). Absent when the contract doesn't say.
   */
  readonly retryableConflictCodes?: readonly string[];
  /** The success envelope's schema requires `data`. */
  readonly dataRequired: boolean;
}

export const operations = {
  "POST /chats/": {
    method: "POST",
    path: "/chats/",
    idempotent: true,
    sessionToken: true,
    stream: false,
    statuses: [201,400,401,403,404,409,422,429,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: true,
  },
  "GET /chats/{chatId}/": {
    method: "GET",
    path: "/chats/{chatId}/",
    idempotent: false,
    sessionToken: true,
    stream: false,
    statuses: [200,400,401,403,404,422,429],
    conflictCodes: [],
    dataRequired: true,
  },
  "GET /chats/{chatId}/messages/": {
    method: "GET",
    path: "/chats/{chatId}/messages/",
    idempotent: false,
    sessionToken: true,
    stream: false,
    statuses: [200,400,401,403,404,422,429],
    conflictCodes: [],
    dataRequired: true,
  },
  "POST /chats/{chatId}/stream/": {
    method: "POST",
    path: "/chats/{chatId}/stream/",
    idempotent: false,
    sessionToken: true,
    stream: true,
    statuses: [200,400,401,403,404,409,422,429,503],
    conflictCodes: ["error.partner.chat_stream_in_progress"],
    dataRequired: false,
  },
  "GET /embed/config/": {
    method: "GET",
    path: "/embed/config/",
    idempotent: false,
    sessionToken: false,
    stream: false,
    statuses: [200,400,401,422],
    conflictCodes: [],
    dataRequired: true,
  },
  "POST /embed/sessions/": {
    method: "POST",
    path: "/embed/sessions/",
    idempotent: false,
    sessionToken: false,
    stream: false,
    statuses: [201,400,401,403,422,429,503],
    conflictCodes: [],
    dataRequired: true,
  },
  "POST /embed/sessions/refresh/": {
    method: "POST",
    path: "/embed/sessions/refresh/",
    idempotent: true,
    sessionToken: true,
    stream: false,
    statuses: [200,401,404,409,429,503],
    conflictCodes: [],
    dataRequired: true,
  },
  "GET /embed/chats/{chatId}/offramps/{kind}/": {
    method: "GET",
    path: "/embed/chats/{chatId}/offramps/{kind}/",
    idempotent: false,
    sessionToken: true,
    stream: false,
    statuses: [200,400,401,404,422,429,503],
    conflictCodes: [],
    dataRequired: true,
  },
  "GET /embed/go/{ref}/": {
    method: "GET",
    path: "/embed/go/{ref}/",
    idempotent: false,
    sessionToken: false,
    stream: false,
    statuses: [302,400,404,422],
    conflictCodes: [],
    dataRequired: false,
  },
  "POST /embed/chats/{chatId}/rating/": {
    method: "POST",
    path: "/embed/chats/{chatId}/rating/",
    idempotent: true,
    sessionToken: true,
    stream: false,
    statuses: [200,400,401,404,409,422,429,503],
    conflictCodes: ["error.embed.rating_not_configured"],
    dataRequired: true,
  },
  "PATCH /embed/chats/{chatId}/rating/": {
    method: "PATCH",
    path: "/embed/chats/{chatId}/rating/",
    idempotent: true,
    sessionToken: true,
    stream: false,
    statuses: [200,400,401,404,409,422,429,503],
    conflictCodes: ["error.embed.rating_not_configured"],
    dataRequired: true,
  },
} as const satisfies Record<string, OperationSpec>;

export type OperationKey = keyof typeof operations;
