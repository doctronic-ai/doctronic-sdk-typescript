// @doctronic-ai/browser: a headless Doctronic chat client for a partner's web page, using a
// publishable key. The server SDK, @doctronic-ai/sdk, with a secret token, is for the partner's
// backend.

export {
  BASE_URLS,
  DoctronicBrowser,
  type Diagnostic,
  type DoctronicBrowserOptions,
  type Environment,
  type Intake,
  type SessionStatus,
} from './client.js';
export {
  Chat,
  ChatStateError,
  StreamInterruptedError,
  type ChatEnd,
  type ChatState,
  type DiagnosticCode,
  type GuardianCopy,
  type Offramp,
  type Rating,
  type SessionEndCause,
  type Unavailable,
} from './chat.js';
export {
  attributionFromQuery,
  stateStep,
  type ArtifactType,
  type Attribution,
  type Copy,
  type DeploymentConfig,
  type IntakeRules,
  type OfframpConfig,
  type OfframpTrigger,
  type Platform,
  type RatingConfig,
  type Sex,
  type StarterPrompt,
  type StateCode,
  type StateDisclaimer,
  type StateSelection,
  type StateStep,
  type Theme,
} from './config.js';
export {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  DEFAULT_RETRY_AFTER_SECONDS,
  DoctronicError,
  ErrorCode,
  InternalServerError,
  MAX_RETRY_AFTER_SECONDS,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServiceUnavailableError,
} from './errors.js';
export {
  isKnownChatStreamEvent,
  type AiConsultationCompleteEvent,
  type ChatStreamEvent,
  type ConversationEndEvent,
  type ConversationOfftopicEvent,
  type GuardianCategory,
  type GuardianEvent,
  type GuardianId,
  type KnownChatStreamEvent,
  type MessageContentEvent,
  type MessageStartEvent,
  type MessageStopEvent,
  type SkillCodeCtaEvent,
  type StreamErrorEvent,
  type UnknownChatStreamEvent,
} from './streaming.js';

// The types and runtime facts generated from the contract's browser profile.
export type { components, operations as contractOperations, paths } from './generated/schema.js';
export { operations, type OperationKey, type OperationSpec } from './generated/operations.js';
export { streamEventFields, type JsonType, type StreamEvents } from './generated/events.js';
