// Classes are exported as values, never with `export type`: tsup's declaration bundler drops the
// `type` modifier, so a type-only class export would compile in a consumer and fail at runtime.
// scripts/check-package.mjs compares the published declarations with the runtime exports.
export {
  APIPromise,
  BASE_URLS,
  Doctronic,
  UserScopedClient,
  VERSION,
  type APIResponse,
  type ClientOptions,
  type Environment,
  type IdempotentRequestOptions,
  type QueryParams,
  type RequestBody,
  type RequestOptions,
  type ResponseData,
} from './client.js';
export {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  ArtifactNotReadyError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  DoctronicError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServiceUnavailableError,
  WebhookVerificationError,
  type ValidationErrorDetail,
} from './errors.js';
export {
  ChatStream,
  isKnownChatStreamEvent,
  type AiConsultationCompleteEvent,
  type ChatStreamEvent,
  type ConversationEndEvent,
  type ConversationOfftopicEvent,
  type FinalMessages,
  type GuardianEvent,
  type KnownChatStreamEvent,
  type MessageContentEvent,
  type MessageStartEvent,
  type MessageStopEvent,
  type SkillCodeCtaEvent,
  type StreamErrorEvent,
  type StreamedMessage,
  type UnknownChatStreamEvent,
} from './streaming.js';
export {
  WEBHOOK_SIGNATURE_HEADER,
  isKnownWebhookEvent,
  verifyWebhook,
  type AppointmentCallEndedEvent,
  type AppointmentPractitionerJoinedEvent,
  type AppointmentWaitingRoomReadyEvent,
  type ArtifactReadyEvent,
  type KnownWebhookEvent,
  type UnknownWebhookEvent,
  type WebhookEnvelope,
  type WebhookEvent,
} from './webhooks.js';

export { AddressResource, type Address, type SetAddressParams } from './address.js';
export {
  AppointmentsResource,
  type Appointment,
  type AppointmentPage,
  type AppointmentResult,
  type AppointmentStatus,
  type AsapAppointment,
  type AvailableSlots,
  type AvailableSlotsParams,
  type CreateAsapAppointmentParams,
  type CreateScheduledAppointmentParams,
  type ListAppointmentsParams,
  type RescheduleAppointmentParams,
  type ScheduledAppointment,
  type UsState,
} from './appointments.js';
export {
  ArtifactsResource,
  type Artifact,
  type ArtifactType,
  type WaitUntilReadyOptions,
} from './artifacts.js';
export {
  ChatsResource,
  type Chat,
  type ChatMessage,
  type ChatMessagePage,
  type ChatPage,
  type CreateChatParams,
  type ListChatMessagesParams,
  type ListChatsParams,
  type StreamChatParams,
} from './chats.js';
export { CoverageResource, type SetCoverageParams } from './coverage.js';
export {
  PharmacyResource,
  ScopedPharmacyResource,
  type Pharmacy,
  type PharmacySearchParams,
  type PharmacySearchResults,
  type SetPharmacyParams,
} from './pharmacy.js';
export {
  ScopedUsersResource,
  UsersResource,
  type CreateUserParams,
  type Sex,
  type UpdateUserParams,
  type User,
} from './users.js';
export type { components, operations as contractOperations, paths } from './generated/schema.js';
