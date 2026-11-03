/**
 * Generated from the Doctronic API contract by `npm run generate`. Do not edit by hand.
 */

import type { components } from './schema.js';

/** The JSON types a field can have on the wire. */
export type JsonType = 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string';

/**
 * Each event that `POST /chats/{chatId}/stream/` sends, by `type`: the `StreamChatEvent` union that
 * the stream's `x-doctronic-event-schema` names.
 */
export interface StreamEvents {
  "ai_consultation.complete": components["schemas"]["StreamChatConsultationCompleteEvent"];
  "conversation.end": components["schemas"]["StreamChatConversationEndEvent"];
  "conversation.offtopic": components["schemas"]["StreamChatConversationOfftopicEvent"];
  "error": components["schemas"]["StreamChatErrorEvent"];
  "guardian": components["schemas"]["StreamChatGuardianEvent"];
  "message.content": components["schemas"]["StreamChatMessageContentEvent"];
  "message.start": components["schemas"]["StreamChatMessageStartEvent"];
  "message.stop": components["schemas"]["StreamChatMessageStopEvent"];
  "skill_code.cta": components["schemas"]["StreamChatCTAEvent"];
}

/**
 * The fields each stream event always carries, other than `type`, with the JSON types
 * each can have: the event schema's `required`.
 */
export const streamEventFields = {
  "ai_consultation.complete": { "artifacts": ["object"] },
  "conversation.end": {},
  "conversation.offtopic": {},
  "error": { "errorCode": ["string"], "message": ["string"] },
  "guardian": { "guardianId": ["string"], "message": ["string"], "endsConversation": ["boolean"], "category": ["string"] },
  "message.content": { "messageId": ["string"], "content": ["string"] },
  "message.start": { "role": ["string"], "messageId": ["string"] },
  "message.stop": { "messageId": ["string"] },
  "skill_code.cta": { "skillCode": ["string"] },
} as const satisfies {
  readonly [T in keyof StreamEvents]: Readonly<Record<string, readonly JsonType[]>>;
};

/** Each webhook's payload, by event name: the contract's `webhooks`. */
export interface WebhookPayloads {
  "appointment.call_ended": components["schemas"]["AppointmentCallEndedPayload"];
  "appointment.practitioner_joined": components["schemas"]["AppointmentPractitionerJoinedPayload"];
  "appointment.waiting_room_ready": components["schemas"]["AppointmentWaitingRoomReadyPayload"];
  "artifact.ready": components["schemas"]["ArtifactReadyPayload"];
}

/** The webhook event names the contract documents. */
export const webhookEvents = [
  "appointment.call_ended",
  "appointment.practitioner_joined",
  "appointment.waiting_room_ready",
  "artifact.ready",
] as const satisfies readonly (keyof WebhookPayloads)[];
