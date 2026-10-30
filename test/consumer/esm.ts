// An ES module consumer. Every class the package exports is used as a value, which fails to
// compile if the declarations mark it type-only.

import {
  APIError,
  APIPromise,
  AddressResource,
  AppointmentsResource,
  ArtifactsResource,
  ChatStream,
  ChatsResource,
  CoverageResource,
  Doctronic,
  PharmacyResource,
  ScopedPharmacyResource,
  ScopedUsersResource,
  UserScopedClient,
  UsersResource,
  VERSION,
  isKnownChatStreamEvent,
  isKnownWebhookEvent,
  verifyWebhook,
  type ArtifactReadyData,
  type ChatStreamEvent,
  type ConsultationArtifacts,
  type GuardianId,
  type User,
  type WebhookEvent,
} from '@doctronic-ai/sdk';

export const version: string = VERSION;

export function createUser(client: Doctronic): APIPromise<User> {
  return client.users.create({ firstName: 'Avery' });
}

export function scoped(client: Doctronic): UserScopedClient {
  return client.forUser('mem_example');
}

export function classes(): readonly unknown[] {
  return [
    APIPromise,
    AddressResource,
    AppointmentsResource,
    ArtifactsResource,
    ChatsResource,
    CoverageResource,
    PharmacyResource,
    ScopedPharmacyResource,
    ScopedUsersResource,
    UsersResource,
  ];
}

export function isPending(value: unknown): value is APIPromise<unknown> {
  return value instanceof APIPromise;
}

export async function firstEvent(stream: ChatStream): Promise<ChatStreamEvent | undefined> {
  for await (const event of stream) {
    if (isKnownChatStreamEvent(event)) return event;
  }
  return undefined;
}

// The stream event and webhook payload types, which the package generates from the contract.
// `guardianId` is open: it takes IDs the contract doesn't list yet, so it's a string.
const BREATHING: GuardianId = 'emergency_breathing';

export function onEvent(event: ChatStreamEvent): ConsultationArtifacts | boolean | null {
  if (!isKnownChatStreamEvent(event)) return null;
  if (event.type === 'guardian') return event.guardianId === BREATHING || event.endsConversation;
  if (event.type === 'ai_consultation.complete') return event.artifacts;
  return null;
}

export function onArtifactReady(event: WebhookEvent): ArtifactReadyData | null {
  return isKnownWebhookEvent(event) && event.event === 'artifact.ready' ? event.data : null;
}

export function verify(body: string, signature: string, secret: string): WebhookEvent | null {
  try {
    return verifyWebhook(body, signature, secret);
  } catch (error) {
    if (error instanceof APIError) throw error;
    return null;
  }
}
