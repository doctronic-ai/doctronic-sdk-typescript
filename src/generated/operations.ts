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
  /** The operation's security requires `X-Doctronic-User-ID`. */
  readonly userScoped: boolean;
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
  "GET /users/": {
    method: "GET",
    path: "/users/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404],
    conflictCodes: [],
    dataRequired: true,
  },
  "POST /users/": {
    method: "POST",
    path: "/users/",
    idempotent: true,
    userScoped: false,
    stream: false,
    statuses: [201,400,401,403,409,422,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: true,
  },
  "PATCH /users/": {
    method: "PATCH",
    path: "/users/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,409,422,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: true,
  },
  "GET /chats/": {
    method: "GET",
    path: "/chats/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,422],
    conflictCodes: [],
    dataRequired: true,
  },
  "POST /chats/": {
    method: "POST",
    path: "/chats/",
    idempotent: true,
    userScoped: true,
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
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,422,429],
    conflictCodes: [],
    dataRequired: true,
  },
  "GET /chats/{chatId}/messages/": {
    method: "GET",
    path: "/chats/{chatId}/messages/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,422,429],
    conflictCodes: [],
    dataRequired: true,
  },
  "POST /chats/{chatId}/stream/": {
    method: "POST",
    path: "/chats/{chatId}/stream/",
    idempotent: false,
    userScoped: true,
    stream: true,
    statuses: [200,400,401,403,404,409,422,429,503],
    conflictCodes: ["error.partner.chat_stream_in_progress"],
    dataRequired: false,
  },
  "GET /appointments/scheduled/available-slots/": {
    method: "GET",
    path: "/appointments/scheduled/available-slots/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,422],
    conflictCodes: [],
    dataRequired: true,
  },
  "POST /appointments/scheduled/": {
    method: "POST",
    path: "/appointments/scheduled/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [201,400,401,403,404,409,422,502,503],
    conflictCodes: ["error.appointments.slot_unavailable","error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: true,
  },
  "POST /appointments/asap/": {
    method: "POST",
    path: "/appointments/asap/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [201,400,401,403,404,409,422,502,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: true,
  },
  "GET /appointments/": {
    method: "GET",
    path: "/appointments/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,422],
    conflictCodes: [],
    dataRequired: true,
  },
  "GET /appointments/{appointment_id}/": {
    method: "GET",
    path: "/appointments/{appointment_id}/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,422],
    conflictCodes: [],
    dataRequired: true,
  },
  "GET /appointments/{appointment_id}/result/": {
    method: "GET",
    path: "/appointments/{appointment_id}/result/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,202,400,401,403,404,409,422],
    conflictCodes: ["error.appointments.result_unavailable"],
    dataRequired: true,
  },
  "POST /appointments/{appointment_id}/cancel/": {
    method: "POST",
    path: "/appointments/{appointment_id}/cancel/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,409,422,503],
    conflictCodes: ["error.appointments.cannot_be_cancelled_or_rescheduled","error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: false,
  },
  "POST /appointments/{appointment_id}/reschedule/": {
    method: "POST",
    path: "/appointments/{appointment_id}/reschedule/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,409,422,503],
    conflictCodes: ["error.appointments.cannot_be_cancelled_or_rescheduled","error.appointments.unavailable_time","error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: false,
  },
  "GET /address/": {
    method: "GET",
    path: "/address/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404],
    conflictCodes: [],
    dataRequired: true,
  },
  "PUT /address/": {
    method: "PUT",
    path: "/address/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,409,422,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: false,
  },
  "POST /pharmacy/search/": {
    method: "POST",
    path: "/pharmacy/search/",
    idempotent: true,
    userScoped: false,
    stream: false,
    statuses: [200,400,401,403,409,422,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: true,
  },
  "PUT /pharmacy/": {
    method: "PUT",
    path: "/pharmacy/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,409,422,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: false,
  },
  "PUT /coverage/": {
    method: "PUT",
    path: "/coverage/",
    idempotent: true,
    userScoped: true,
    stream: false,
    statuses: [200,400,401,403,404,409,422,503],
    conflictCodes: ["error.idempotency.concurrent_request","error.idempotency.payload_mismatch"],
    retryableConflictCodes: ["error.idempotency.concurrent_request"],
    dataRequired: false,
  },
  "GET /artifacts/{artifactId}/": {
    method: "GET",
    path: "/artifacts/{artifactId}/",
    idempotent: false,
    userScoped: true,
    stream: false,
    statuses: [200,202,400,401,403,404,422,500],
    conflictCodes: [],
    dataRequired: true,
  },
} as const satisfies Record<string, OperationSpec>;

export type OperationKey = keyof typeof operations;
