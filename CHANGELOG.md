# Changelog

## Unreleased

A minor release. The stream event and webhook payload types are generated from the contract, and
the stream event types change where the contract differs from the handwritten ones. The pinned
contract also brings the API changes under "Contract update".

### Breaking type changes

The stream event types follow the contract, which describes what the API sends:

- `MessageStartEvent`: `role` is `'assistant' | 'user'`, not `string`. `messageTimestamp` can be
  `null`.
- `GuardianEvent`: new required `endsConversation: boolean` and `category: string`, and new optional
  `title` and `text` (`string | null`). `guardianId` and `category` stay open: any string.
- `SkillCodeCtaEvent`: `widget` is optional and can be `null`; it was a required string. `text` can
  be `null`.
- `AiConsultationCompleteEvent`: `artifacts.longSummary`, `shortSummary`, and `soapNote` are
  required, `string | null`. They were optional.
- `ConversationOfftopicEvent.messageId`, `ConversationEndEvent.messageId` and `reason`, and
  `StreamErrorEvent.retryAfterSeconds` can be `null`. They stay optional.
- The nine event types are type aliases, not interfaces, so declaration merging can't extend them.
  `extends` and `implements` still work.

The webhook event types keep their shapes.

### Stream events and webhooks

- `KnownChatStreamEvent` is the contract's event union, and `KnownWebhookEvent` the union of its
  webhook payloads. Every exported name stays.
- New types: `GuardianId` and `GuardianCategory` (the documented values), `ConsultationArtifacts`,
  and the webhook data types `AppointmentWaitingRoomReadyData`,
  `AppointmentPractitionerJoinedData`, `AppointmentCallEndedData`, and `ArtifactReadyData`.
- A documented stream event must carry the fields the contract marks required, with their JSON
  types, or it arrives as `{ type, data }`. `guardian` now needs `endsConversation` and `category`,
  and `skill_code.cta` no longer needs `widget`. Unknown event types still arrive as
  `{ type, data }`, and unknown webhook events with `data: unknown`.
- `finalMessages()` leaves out a `null` `messageTimestamp`.

### Code generation

- `npm run generate` writes `src/generated/events.ts`: the stream events from the union that
  `x-doctronic-event-schema` names on `POST /chats/{chatId}/stream/`, and the webhooks from the
  contract's `webhooks`. A contract without either fails the run, which writes nothing.

### Contract update

The pinned contract (`info.version` 1.0.0) also brings:

- The 11 idempotent operations document `409 error.idempotency.payload_mismatch` and
  `error.idempotency.concurrent_request`, and list `concurrent_request` as retryable. A
  `409 payload_mismatch`, a key reused with a different body, is no longer retried.
  `concurrent_request`, and a `409` without a code, still are.
- `CreateChatParams` has an optional `starterPromptIndex`, and `PharmacySearchParams` optional
  `phoneNumber` and `address`.
- `address.set()` and `pharmacy.set()` resolve to `null`, not `unknown`.
- `POST /chats/`, `GET /chats/{chatId}/`, `GET /chats/{chatId}/messages/`, and the stream document
  `429`.
- Seven browser-only `/embed/` operations are skipped, because they don't take the organization's
  API token.

## 0.1.1

### Fixes

- `APIPromise` and the resource classes (`UsersResource`, `ScopedUsersResource`, `ChatsResource`,
  `AppointmentsResource`, `AddressResource`, `PharmacyResource`, `ScopedPharmacyResource`,
  `CoverageResource`, `ArtifactsResource`) are exported at runtime. 0.1.0's declarations exported
  them as values, but the JavaScript didn't, so importing one compiled and then failed at runtime.
  `instanceof APIPromise` now works.
- A `409` whose code the contract documents for the operation is retried only when the contract
  lists the code in `x-doctronic-retryable-codes`, as safe to retry with the same idempotency key.
  An operation without that list retries as in 0.1.0.
- `baseUrl` trailing slashes are trimmed with a loop instead of a regular expression that
  backtracked on long runs of slashes (CodeQL `js/polynomial-redos`).

### Code generation

- `npm run generate` reads a pinned copy of the contract, `openapi/doctronic-v1.json`, and the
  required codegen check compares against that copy. A scheduled job reports drift from the
  published contract, and `regenerate.yml` opens a pull request when it changes.
- Operations that don't take the organization's API token, such as browser-only operations, are
  skipped. The generated code for the 22 operations is unchanged.

### Packaging and CI

- CI tests Node 20, 22, 24, and 26, and installs the packed tarball into ESM, CommonJS, and bundler
  consumers to check its types and runtime exports.
- The first release published from GitHub Actions through npm trusted publishing, with provenance,
  and with a GitHub Release from this changelog.

### Documentation and metadata

- README: a Safety note about the `guardian` event, the ES module requirement for the quickstart's
  top-level `await`, `const app = express()` in the webhook example, absolute links that work on
  npm, a link to the Python SDK, and Versioning, Supported Node versions, and Support sections.
- The quickstart example no longer reads `DOCTRONIC_API_URL`, which the SDK never read. Pass
  `baseUrl` to use another URL.
- `package.json` has `keywords` and `"author": "Doctronic"`.
- Issue and pull request templates, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `CODEOWNERS`.

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
