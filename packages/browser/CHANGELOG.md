# Changelog

## Unreleased

The first version: a headless browser client for partners that use a publishable key.

### Client

- `DoctronicBrowser`: reads the deployment's config, starts an anonymous embed session, keeps its
  token in memory and refreshes it before it expires, and creates chats. Targets staging by
  default, like the server SDK. Refuses any key that doesn't start with `pk_`.
- `Chat`: sends turns and yields the stream's events, and keeps the state a chat UI renders: the
  end of the conversation, guardian notices, off-ramp links, the rating question, and why the last
  turn didn't get through.
- `stateStep()` reads the deployment's state rule, and `attributionFromQuery()` reads UTM values
  for `attribution`.
- Errors follow the server SDK: `APIError` and one subclass per status, plus `ErrorCode` for the
  codes to branch on.

### Behaviour

- Reading the config is retried on transient failures. Starting a session, creating a chat and
  sending a turn are never retried.
- A rejected refresh ends the session; a rate-limited one waits for `retryAfter`; a paused
  deployment ends it with a clear state. A disposed client never comes back from a late refresh.
- A guardian that ends the conversation stops sending, and the stream is still read to its end.
  No off-ramps or rating follow a safety end. An emergency's internal label and the consultation's
  document IDs are never passed on.
- Diagnostics carry fixed codes and counts only. Nothing is logged.

### Types

- The wire types come from the contract's browser profile (`src/generated/`), with friendlier
  public types built on them: the config with the contract's defaults filled in, and the stream
  events as the client passes them on.
