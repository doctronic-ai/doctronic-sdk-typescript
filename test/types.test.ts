// Compile-time checks. `npm run typecheck` fails if any of these stop holding.

import { describe, expectTypeOf, it } from 'vitest';

import {
  Doctronic,
  isKnownChatStreamEvent,
  isKnownWebhookEvent,
  type Appointment,
  type Artifact,
  type Chat,
  type ChatStream,
  type ChatStreamEvent,
  type UnknownChatStreamEvent,
  type User,
  type WebhookEvent,
} from '../src/index.js';
import type { components } from '../src/generated/schema.js';

const client = new Doctronic({ apiToken: 'test-token-not-a-real-credential' });
const scoped = client.forUser('mem_1');

describe('types', () => {
  it('reach user-scoped resources only through forUser()', () => {
    // @ts-expect-error chats are user-scoped
    void client.chats;
    // @ts-expect-error retrieving a user is user-scoped
    void client.users.retrieve;
    // @ts-expect-error saving a pharmacy is user-scoped
    void client.pharmacy.set;
    // @ts-expect-error creating a user is org-scoped
    void scoped.users.create;
  });

  it('take request and response types from the generated schema', () => {
    expectTypeOf<Awaited<ReturnType<typeof client.users.create>>>().toEqualTypeOf<User>();
    expectTypeOf<User>().toEqualTypeOf<components['schemas']['UserCreatedResponse']>();
    expectTypeOf<Awaited<ReturnType<typeof scoped.chats.create>>>().toEqualTypeOf<Chat>();
    expectTypeOf<
      Awaited<ReturnType<typeof scoped.appointments.retrieve>>
    >().toEqualTypeOf<Appointment>();
    expectTypeOf<
      Awaited<ReturnType<typeof scoped.artifacts.retrieve>>
    >().toEqualTypeOf<Artifact | null>();
    expectTypeOf<
      Awaited<ReturnType<typeof scoped.artifacts.waitUntilReady>>
    >().toEqualTypeOf<Artifact>();
    expectTypeOf<Awaited<ReturnType<typeof scoped.chats.stream>>>().toEqualTypeOf<ChatStream>();
    expectTypeOf<Parameters<typeof scoped.users.update>[0]>().toEqualTypeOf<
      components['schemas']['UpdateUserRequest']
    >();
  });

  it('accept an idempotency key only on idempotent operations', () => {
    // Type-checked, never called.
    const check = () => {
      void scoped.chats.create({}, { idempotencyKey: 'k' });
      // @ts-expect-error reads take no idempotency key
      void scoped.chats.list({}, { idempotencyKey: 'k' });
    };
    void check;
  });

  it('narrow stream events after isKnownChatStreamEvent()', () => {
    const handle = (event: ChatStreamEvent) => {
      if (!isKnownChatStreamEvent(event)) {
        expectTypeOf(event).toEqualTypeOf<UnknownChatStreamEvent>();
        return;
      }
      switch (event.type) {
        case 'message.start':
          expectTypeOf(event.role).toBeString();
          break;
        case 'ai_consultation.complete':
          expectTypeOf(event.artifacts.soapNote).toEqualTypeOf<string | null | undefined>();
          break;
        case 'error':
          expectTypeOf(event.retryAfterSeconds).toEqualTypeOf<number | undefined>();
          break;
      }
    };
    void handle;
  });

  it('narrow webhook events after isKnownWebhookEvent()', () => {
    const handle = (event: WebhookEvent) => {
      if (!isKnownWebhookEvent(event)) return;
      if (event.event === 'appointment.waiting_room_ready') {
        expectTypeOf(event.data.waitingRoomUrl).toBeString();
      }
    };
    void handle;
  });
});
