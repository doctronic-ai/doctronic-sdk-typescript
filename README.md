# Doctronic TypeScript SDK

Call the Doctronic API from your Node backend: create users, stream consultations, book
appointments, retrieve consultation documents, and verify webhooks.

Requires Node 20 or later; see [Supported Node versions](#supported-node-versions). ESM and
CommonJS. No runtime dependencies. Using Python? See the
[Doctronic Python SDK](https://github.com/doctronic-ai/doctronic-sdk-python).

## Install

```bash
npm install @doctronic-ai/sdk
```

## Quickstart

Stream an assistant message in staging with a synthetic patient. You need a staging API token; see
[get access](https://docs.doctronic.ai/docs/authentication/#get-access).

```bash
export DOCTRONIC_API_TOKEN="replace-with-your-staging-token"
```

The code uses top-level `await`, so run it as an ES module: a `.mjs` or `.mts` file, or a file in a
package with `"type": "module"`. In CommonJS, put the calls in an `async` function.

```ts
import { randomUUID } from 'node:crypto';

import { Doctronic } from '@doctronic-ai/sdk';

const client = new Doctronic(); // Reads DOCTRONIC_API_TOKEN. Targets staging by default.

// 1. Create a user, and save user.id on the patient record in your system.
// Email and phone number are unique per user, so each run uses a fresh email and no phone number.
const user = await client.users.create({
  firstName: 'Avery',
  lastName: 'Chen',
  dateOfBirth: '1990-06-15',
  email: `avery+live-quickstart-${randomUUID()}@example.com`,
  sex: 'female',
});

// 2. Create a chat for the consultation.
const patient = client.forUser(user.id);
const chat = await patient.chats.create({ timezone: 'America/New_York' });

// 3. Stream a patient turn.
const stream = await patient.chats.stream(chat.id, {
  userInput: 'I have had a sore throat and fever since yesterday.',
  timezone: 'America/New_York',
});
for await (const event of stream) {
  console.log(event.type, event);
}
```

[`examples/quickstart.ts`](https://github.com/doctronic-ai/doctronic-sdk-typescript/blob/main/examples/quickstart.ts)
is the runnable version. It assembles each message and prints every other event.

**Safety:** a turn can emit a `guardian` event that your product must act on. Read
[Safety](https://docs.doctronic.ai/docs/safety/) before you show the stream to patients.

Run the client on your backend only. The API token authorizes your organization's whole scope,
so the client refuses to start in a browser unless you pass `dangerouslyAllowBrowser: true`.

## Configure the client

```ts
const client = new Doctronic({
  apiToken: process.env.DOCTRONIC_API_TOKEN, // Default: DOCTRONIC_API_TOKEN.
  environment: 'production', // Default: DOCTRONIC_ENVIRONMENT, then 'staging'.
  timeoutMs: 30_000, // Per attempt. Default: 60 s.
  maxRetries: 2, // Default: 2.
});
```

| Option                    | Default                                 | Notes                                                                       |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| `apiToken`                | `DOCTRONIC_API_TOKEN`                   | Required. The client throws without one and never prints it.                |
| `environment`             | `DOCTRONIC_ENVIRONMENT`, then `staging` | `staging` or `production`.                                                  |
| `baseUrl`                 | The environment's URL                   | Overrides `environment`.                                                    |
| `timeoutMs`               | `60000`                                 | Per attempt for JSON requests; for a stream, the time it may take to start. |
| `maxRetries`              | `2`                                     | Retries after the first attempt. See [Retries](#idempotency-and-retries).   |
| `fetch`                   | `globalThis.fetch`                      | A custom `fetch`.                                                           |
| `dangerouslyAllowBrowser` | `false`                                 | Allows a browser. Don't.                                                    |

| Environment  | Base URL                                       |
| ------------ | ---------------------------------------------- |
| `staging`    | `https://staging-partners.doctronic.ai/api/v1` |
| `production` | `https://partners.doctronic.ai/api/v1`         |

Every method also takes per-call options: `signal`, `timeoutMs`, `maxRetries`, and, on idempotent
operations, `idempotencyKey`.

## User scope

The token authenticates your organization; `X-Doctronic-User-ID` selects the patient. Two
operations take the token alone and live on the client:

```ts
await client.users.create({ firstName: 'Avery' });
await client.pharmacy.search({ latitude: 40.7608, longitude: -111.891 });
```

Everything else is about one patient. Call `forUser()` with the user ID from your mapping, and the
scoped client sends the header on every request:

```ts
const patient = client.forUser(userId);

await patient.users.retrieve();
await patient.users.update({ phoneNumber: '+15555550100', email: null }); // null clears a field
await patient.chats.list({ orderBy: '-createdAt' });
await patient.chats.messages(chatId, { page: 1, size: 50 });
await patient.address.set({
  line1: '100 Example Street',
  city: 'New York',
  state: 'NY',
  postalCode: '10001',
});
await patient.appointments.availableSlots({ state: 'NY' });
await patient.appointments.createScheduled({ chatId, startsAt, location: { state: 'NY' } });
await patient.pharmacy.set({ ncpdpId: '1234567' });
await patient.coverage.set({
  payerId: '00590',
  payerName: 'Example Health Plan',
  memberId: 'ABC1234567',
});
```

User-scoped resources aren't on the base client, so no request about a patient can go out without a
user ID. Derive the ID on your backend from the patient your system authenticated.

| Resource               | Methods                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `client.users`         | `create`                                                                                                |
| `client.pharmacy`      | `search`                                                                                                |
| `patient.users`        | `retrieve`, `update`                                                                                    |
| `patient.chats`        | `create`, `list`, `retrieve`, `messages`, `stream`                                                      |
| `patient.appointments` | `availableSlots`, `createScheduled`, `createAsap`, `list`, `retrieve`, `result`, `cancel`, `reschedule` |
| `patient.address`      | `retrieve`, `set`                                                                                       |
| `patient.pharmacy`     | `set`                                                                                                   |
| `patient.coverage`     | `set`                                                                                                   |
| `patient.artifacts`    | `retrieve`, `waitUntilReady`                                                                            |

Methods resolve to the envelope's `data`. Arguments and results use the contract's camelCase field
names, and their types come from the generated contract types.

## Stream a turn

`chats.stream()` sends one patient turn and resolves once the server accepts it. Iterate the result
for typed events:

```ts
import { isKnownChatStreamEvent } from '@doctronic-ai/sdk';

const stream = await patient.chats.stream(chatId, { userInput, signal });

for await (const event of stream) {
  if (!isKnownChatStreamEvent(event)) continue; // New event types are additive. Ignore them.
  switch (event.type) {
    case 'message.start': // Start a message with event.role, keyed by event.messageId.
    case 'message.content': // Append event.content to the message with the same messageId.
    case 'message.stop': // That message is complete. The turn continues.
      break;
    case 'guardian':
      // When event.endsConversation is true, stop taking input but read on to conversation.end.
      runSafetyBehavior(event.guardianId, event.endsConversation);
      break;
    case 'ai_consultation.complete':
      storeArtifactIds(event.artifacts);
      break;
    case 'error':
      handleStreamError(event.errorCode, event.retryAfterSeconds);
      break;
  }
}
```

Events form a union on `type`: `message.start`, `message.content`, `message.stop`, `guardian`,
`conversation.offtopic`, `conversation.end`, `skill_code.cta`, `ai_consultation.complete`, and
`error`. Their types are generated from the event schemas the contract publishes. An event this SDK
doesn't know yet arrives as `{ type, data }`, and so does a documented event that lacks a field the
contract says it always carries. Neither throws, so later events, such as `guardian`, still arrive.
Check `isKnownChatStreamEvent()` before you switch so TypeScript narrows each case.

A `guardian` event is never set aside for lacking `endsConversation` or `category`: it arrives typed,
with the contract's defaults, `false` and `"other"`.

`guardianId` and `category` take values the contract doesn't list yet, so they're typed as
`string`. `GuardianId` and `GuardianCategory` list the documented values. In
`ai_consultation.complete`, each ID in `artifacts` is a string, or `null` when that document wasn't
generated.

To collect the whole turn instead, call `finalMessages()`. It assembles messages by `messageId` with
the role from `message.start`, and returns every other event in arrival order:

```ts
const { messages, controlEvents } = await stream.finalMessages();
```

- **Errors before the stream starts** reject the `stream()` call: `ConflictError` for
  `409 error.partner.chat_stream_in_progress`, `ServiceUnavailableError` for
  `503 error.partner.chat_stream_unavailable`.
- **Errors after it starts** arrive as an `error` event. They don't throw.
- **Cancel** with the `signal` you pass, or `stream.abort()`. No event is delivered after either.
  Breaking out of the loop also closes the connection.
- **The stream is never retried.** The turn takes no idempotency key and may already have produced
  a reply. After a failure, read `patient.chats.messages(chatId)` before you let the patient resend.

`timeoutMs` bounds how long the stream may take to start. Once it starts, only your signal ends it.
A success response that isn't `text/event-stream`, such as a proxy's sign-in page, rejects with
`APIError` rather than reading as an empty turn.

## Retrieve consultation documents

`artifacts.retrieve()` resolves to `null` while a document is still generating (`202`).
`waitUntilReady()` polls with bounded exponential backoff and stops on `404` and `500` with their
typed errors:

```ts
const document = await patient.artifacts.waitUntilReady(artifactId, { timeoutMs: 60_000 });
if (document.content.chatId !== chatId) throw new Error('Artifact belongs to another chat');
```

`timeoutMs` (default 120 s) bounds the whole wait, including a request in flight and its retries.
When it passes, the call rejects with `ArtifactNotReadyError`. `appointments.result()` also
resolves to `null` while the visit result isn't available yet. Treat `content.body` as untrusted
Markdown.

## Idempotency and retries

The SDK reads from the contract which operations declare an `Idempotency-Key` (11 today). For
each call to one of them, it generates a key, or uses yours, and sends the same key and body on
every retry of that call:

```ts
// Reuse your own key across processes, for example a booking ID.
await patient.appointments.createScheduled(body, { idempotencyKey: bookingId });
```

| Failure                                                     | Reads (`GET`)                                                                          | Idempotent mutations | `chats.stream()` |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------- | ---------------- |
| Network error or timeout                                    | Retried                                                                                | Retried, same key    | Never            |
| `429`                                                       | Retried                                                                                | Retried, same key    | Never            |
| `503`                                                       | Retried                                                                                | Retried, same key    | Never            |
| `409` idempotency conflict                                  | —                                                                                      | Retried, same key    | Never            |
| `409` documented state conflict, such as `slot_unavailable` | —                                                                                      | Not retried          | Never            |
| Other `5xx`                                                 | Retried, unless the contract documents it for the operation, like `500` on an artifact | Not retried          | Never            |
| Other `4xx`                                                 | Not retried                                                                            | Not retried          | Never            |

A `409` code that the contract documents for the operation is a state conflict and isn't retried,
unless the contract lists it in `x-doctronic-retryable-codes` as safe to retry with the same key.

Retries back off exponentially with jitter from 0.5 s, and wait for `Retry-After` when the response
carries one. A `Retry-After` over 60 s ends the call with its error instead. A mutation without an
idempotency key is never retried once it may have reached the server.

## Errors

Every error extends `DoctronicError`. A response with an error status throws an `APIError`
subclass:

| Status                       | Class                     |
| ---------------------------- | ------------------------- |
| `400` (and the legacy `422`) | `BadRequestError`         |
| `401`                        | `AuthenticationError`     |
| `403`                        | `PermissionDeniedError`   |
| `404`                        | `NotFoundError`           |
| `409`                        | `ConflictError`           |
| `429`                        | `RateLimitError`          |
| `503`                        | `ServiceUnavailableError` |
| Other `5xx`                  | `InternalServerError`     |

`APIError` carries `status`, `code`, `message`, `data`, `requestId` (from `X-Request-ID`),
`headers`, and `retryAfter` (seconds, from `Retry-After`). Branch on `code`; log `requestId` with
every failed request.

```ts
import { BadRequestError, ConflictError } from '@doctronic-ai/sdk';

try {
  await patient.appointments.createScheduled({ chatId, startsAt, location: { state: 'NY' } });
} catch (error) {
  if (error instanceof ConflictError && error.code === 'error.appointments.slot_unavailable') {
    // Refresh availability and ask the patient to choose again.
  } else if (error instanceof BadRequestError) {
    console.error(error.code, error.fieldErrors, error.requestId);
  } else {
    throw error;
  }
}
```

`fieldErrors` lists the `{ field, message, code }` entries of an `error.validation_error`. A success
response without the `data` its contract schema requires throws `APIError` too. A failure
without a response throws `APIConnectionError`, or `APITimeoutError` after `timeoutMs`. An aborted
signal throws `APIUserAbortError`.

## Read the raw response

Every method returns a promise with `.withResponse()`, for the raw response as well as the data:

```ts
const {
  data: chat,
  response,
  requestId,
  idempotencyKey,
  idempotencyReplayed,
} = await patient.chats.create().withResponse();
```

| Field                 | Contents                                                              |
| --------------------- | --------------------------------------------------------------------- |
| `data`                | The unwrapped `data`, as the method resolves to                       |
| `response`            | The `fetch` `Response`: `status`, `headers`                           |
| `requestId`           | The `X-Request-ID` header                                             |
| `idempotencyKey`      | The key sent on every attempt, or `null` for an operation without one |
| `idempotencyReplayed` | `true` when the API replayed a stored result for the key              |

## Verify webhooks

Pass the raw request body, exactly as received, with the `X-Doctronic-Signature` header and your
webhook secret. `verifyWebhook()` checks the HMAC-SHA256 signature in constant time and returns the
parsed envelope, or throws `WebhookVerificationError`:

```ts
import express from 'express';
import { isKnownWebhookEvent, verifyWebhook, WebhookVerificationError } from '@doctronic-ai/sdk';

const app = express();

app.post('/webhooks/doctronic', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = verifyWebhook(
      req.body,
      req.get('x-doctronic-signature'),
      process.env.DOCTRONIC_WEBHOOK_SECRET!,
    );
  } catch (error) {
    if (error instanceof WebhookVerificationError) return res.sendStatus(400);
    throw error;
  }
  // Deduplicate on event.eventId, queue the work, then acknowledge.
  if (isKnownWebhookEvent(event) && event.event === 'appointment.waiting_room_ready') {
    saveWaitingRoomUrl(event.data.appointmentId, event.data.waitingRoomUrl);
  }
  res.sendStatus(204); // Acknowledge unknown events too.
});
```

Typed events: `appointment.waiting_room_ready`, `appointment.practitioner_joined`,
`appointment.call_ended`, and `artifact.ready`, with payload types generated from the contract's
`webhooks`. Any other name arrives with `data: unknown`.

## Versioning

The SDK follows [semantic versioning](https://semver.org). While it's at 0.x:

- A patch release, such as 0.1.1 to 0.1.2, fixes bugs and doesn't break code written for the
  previous release.
- A minor release, such as 0.1.x to 0.2.0, can break code: a renamed method, or a type that a
  contract change narrows. The
  [CHANGELOG](https://github.com/doctronic-ai/doctronic-sdk-typescript/blob/main/CHANGELOG.md)
  lists every breaking change.

`npm install` saves a caret range such as `^0.1.1`, which on 0.x accepts patch releases only, so
you take a minor release when you choose to. The SDK calls version 1 of the API (`/api/v1`), and
its types come from the published v1 contract. 1.0.0 will mark a stable SDK; after it, breaking
changes wait for a major release.

## Supported Node versions

CI tests every even-numbered Node line from 20 up: 20, 22, 24, and 26. `engines` stays `>=20`
through 0.1.x. Node 20 reached end of life in April 2026, so a later minor release may raise the
minimum to Node 22; the CHANGELOG says so when it does. A new Node line joins the CI matrix soon
after its release.

## Support

- **The Doctronic API**: guides, the API reference, errors, and safety requirements are at
  [docs.doctronic.ai](https://docs.doctronic.ai).
- **SDK bugs and feature requests**:
  [open an issue](https://github.com/doctronic-ai/doctronic-sdk-typescript/issues/new/choose)
  with the SDK and Node versions and the `requestId` of a failed request. **Never post API tokens,
  webhook secrets, patient data, or PHI.**
- **Security vulnerabilities**: report them privately through
  [GitHub's private vulnerability reporting](https://github.com/doctronic-ai/doctronic-sdk-typescript/security/advisories/new),
  never in a public issue. See
  [SECURITY.md](https://github.com/doctronic-ai/doctronic-sdk-typescript/blob/main/SECURITY.md).

Fixes, security fixes included, go to the latest 0.x release.

## Develop

See [CONTRIBUTING.md](https://github.com/doctronic-ai/doctronic-sdk-typescript/blob/main/CONTRIBUTING.md)
to build and test the SDK and to regenerate it from the API contract. The code in
`src/generated/` is generated and never edited by hand.

## License

MIT. See [LICENSE](https://github.com/doctronic-ai/doctronic-sdk-typescript/blob/main/LICENSE).
