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
  verifyWebhook,
  type ChatStreamEvent,
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

export function verify(body: string, signature: string, secret: string): WebhookEvent | null {
  try {
    return verifyWebhook(body, signature, secret);
  } catch (error) {
    if (error instanceof APIError) throw error;
    return null;
  }
}
