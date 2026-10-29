# Changelog

## 0.1.0 (2026-10-28)

First version of `@doctronic-ai/sdk`, generated from the Doctronic API contract (OpenAPI 3.1, 22
operations).

- `Doctronic` client with `staging` and `production` environments, `baseUrl`, `timeoutMs`,
  `maxRetries`, and a custom `fetch`. Refuses to run in a browser unless
  `dangerouslyAllowBrowser` is set.
- Org-scoped `users.create` and `pharmacy.search`; every other operation through
  `forUser(userId)`, which sends `X-Doctronic-User-ID`.
- Resources: `users`, `chats`, `appointments`, `address`, `pharmacy`, `coverage`, `artifacts`.
  Methods resolve to the envelope's `data`; `.withResponse()` adds the raw response and
  `requestId`.
- `chats.stream()`: typed SSE events, unknown events as `{ type, data }`, cancellation, and the
  optional `finalMessages()` accumulator. Never retried.
- Idempotency keys per call for the 11 operations whose contract declares one, reused on every
  retry. Retries for network errors, `429`, `503`, idempotency conflicts, and `5xx` on reads, with
  exponential backoff, jitter, and `Retry-After`.
- `artifacts.waitUntilReady()` polls through `202`.
- Typed errors: `APIError` and its status subclasses, connection, timeout, and abort errors.
- Types for `403 error.auth.insufficient_scope`, whose `data.requiredScope` names the scope the
  API key lacks, and for the `400`, `403`, and `404` statuses the contract documents on 8
  operations.
- `verifyWebhook()` with typed envelopes for the four documented events.
