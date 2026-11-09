# @doctronic-ai/browser

A browser client for the Doctronic chat, for partners who build their own chat UI on their own web
page. It uses the deployment's publishable key (`pk_...`), which isn't a secret, and handles the
embed session, the chat stream and the chat's state for you. It has no UI and no dependencies, and
works with any framework.

**Not published yet.** The package lives in this repository and isn't on npm.

To call Doctronic from your backend with your organization's API token, use the server SDK,
[`@doctronic-ai/sdk`](https://github.com/doctronic-ai/doctronic-sdk-typescript#readme), instead. Never put that token in a browser.

## Usage

```ts
import { DoctronicBrowser, isKnownChatStreamEvent, stateStep } from '@doctronic-ai/browser';

const doctronic = new DoctronicBrowser({ publishableKey: 'pk_...' }); // Staging by default.

// Theme, copy, intake rules, off-ramps, rating question, and whether the deployment is paused.
const config = await doctronic.getConfig();
const step = stateStep(config.intake); // selection, disclaimer, none or unsupported

// After the visitor accepts the terms and answers the intake questions:
await doctronic.startSession({
  intake: { age: 52, sex: 'female', state: 'AL' },
  termsAccepted: true,
});

const chat = await doctronic.createChat();
chat.subscribe((state) => render(state)); // ended, notice, offramps, ratingDue, unavailable

for await (const event of chat.send('What does stage 2 mean?')) {
  if (isKnownChatStreamEvent(event) && event.type === 'message.content') {
    appendText(event.messageId, event.content);
  }
}

if (chat.state.ratingDue) await chat.rate(5); // The deployment's end-of-chat question.
```

Pass `environment: 'production'` with a production key. Call `doctronic.dispose()` when the chat
goes away. Branch on an error's `code` (see `ErrorCode`), never on its message.

## What the client handles

- **Sessions.** The session token is refreshed before it expires, timed from the server's
  durations rather than this device's clock. A rejected token ends the session for good, and a
  rate-limited refresh waits as long as the server asks. `onSessionEnd` says when a session can
  no longer be used.
- **Retries.** Reading the config is retried a couple of times on a network failure. Starting a
  session, creating a chat and sending a turn are never retried, so a message is never sent twice.
  After a failure, `chat.state.unavailable` says whether the deployment is paused, the visitor
  must wait, or the turn failed.
- **The stream.** Events are read as the server sends them. Events this version doesn't know are
  passed on as `{ type, data }`, so a new event type doesn't break your page.
- **Intake.** `stateStep()` reads the deployment's state rule. When the rule is one this version
  doesn't know, `startSession()` refuses to start, since eligibility is contractual.
- **Off-ramps and rating.** The deployment's off-ramp links appear in `chat.state.offramps` when
  their conditions are met, and `ratingDue` says when to ask the rating question.

## Safety

- When a guardian ends the conversation, the chat stops sending at once, and the client still
  reads the stream to its end so the server can confirm it.
- A guardian that repeats updates the same notice and keeps its earlier copy.
- An emergency guardian's internal label is never passed on: show its `title` and `text`, or your
  own emergency guidance.
- No off-ramps and no rating question follow a safety end, and an expired session doesn't ask
  for a rating.
- Consultation documents are never exposed in the browser.

## Privacy

- The session token stays in memory: no cookies, no local or session storage. A new visit starts
  a new session.
- The client sends nothing to analytics, session replay or error tracking, and writes nothing to
  the console.
- `onDiagnostic` reports fixed codes and counts only, never chat content.
- The client refuses any key that doesn't start with `pk_`.

Importing the package touches neither `window` nor `document`, so it's safe in server-side
rendering.

## Development

From the repository root, `npm test` runs the package's tests. In `packages/browser/`,
`npm run build` builds it and `npm run check:package` checks the tarball. See
[CONTRIBUTING.md](https://github.com/doctronic-ai/doctronic-sdk-typescript/blob/main/CONTRIBUTING.md).
