// Compile-time checks. `npm run typecheck` fails if any of these stop holding.

import { describe, expectTypeOf, it } from 'vitest';

import {
  Doctronic,
  isKnownChatStreamEvent,
  isKnownWebhookEvent,
  type AppointmentCallEndedData,
  type AppointmentCallEndedEvent,
  type AppointmentPractitionerJoinedData,
  type AppointmentPractitionerJoinedEvent,
  type AppointmentWaitingRoomReadyData,
  type AppointmentWaitingRoomReadyEvent,
  type Appointment,
  type Artifact,
  type ArtifactReadyData,
  type ArtifactReadyEvent,
  type ArtifactType,
  type Chat,
  type ChatStream,
  type ChatStreamEvent,
  type ConsultationArtifacts,
  type GuardianCategory,
  type GuardianEvent,
  type GuardianId,
  type KnownChatStreamEvent,
  type KnownWebhookEvent,
  type UnknownChatStreamEvent,
  type User,
  type WebhookEnvelope,
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
          expectTypeOf(event.artifacts.soapNote).toEqualTypeOf<string | null>();
          break;
        case 'error':
          expectTypeOf(event.retryAfterSeconds).toEqualTypeOf<number | null | undefined>();
          break;
      }
    };
    void handle;
  });

  it('take stream event types from the contract', () => {
    expectTypeOf<KnownChatStreamEvent['type']>().toEqualTypeOf<
      | 'message.start'
      | 'message.content'
      | 'message.stop'
      | 'guardian'
      | 'conversation.offtopic'
      | 'conversation.end'
      | 'skill_code.cta'
      | 'ai_consultation.complete'
      | 'error'
    >();
    expectTypeOf<KnownChatStreamEvent>().toEqualTypeOf<components['schemas']['StreamChatEvent']>();
    expectTypeOf<ConsultationArtifacts>().toEqualTypeOf<{
      longSummary: string | null;
      shortSummary: string | null;
      soapNote: string | null;
    }>();
  });

  it('keep guardian IDs and categories open', () => {
    expectTypeOf<GuardianEvent['guardianId']>().toEqualTypeOf<string>();
    expectTypeOf<GuardianEvent['category']>().toEqualTypeOf<string>();
    expectTypeOf<'emergency_breathing'>().toExtend<GuardianId>();
    expectTypeOf<'emergency'>().toExtend<GuardianCategory>();
    expectTypeOf<GuardianEvent['endsConversation']>().toEqualTypeOf<boolean>();
  });

  it('take webhook payload types from the contract, in the documented envelope', () => {
    expectTypeOf<AppointmentWaitingRoomReadyEvent>().toEqualTypeOf<
      WebhookEnvelope<'appointment.waiting_room_ready', AppointmentWaitingRoomReadyData>
    >();
    expectTypeOf<AppointmentPractitionerJoinedEvent>().toEqualTypeOf<
      WebhookEnvelope<'appointment.practitioner_joined', AppointmentPractitionerJoinedData>
    >();
    expectTypeOf<AppointmentCallEndedEvent>().toEqualTypeOf<
      WebhookEnvelope<'appointment.call_ended', AppointmentCallEndedData>
    >();
    expectTypeOf<ArtifactReadyEvent>().toEqualTypeOf<
      WebhookEnvelope<'artifact.ready', ArtifactReadyData>
    >();
    expectTypeOf<AppointmentWaitingRoomReadyData>().toEqualTypeOf<{
      appointmentId: string;
      userId: string;
      waitingRoomUrl: string;
    }>();
    expectTypeOf<AppointmentCallEndedData>().toEqualTypeOf<{
      appointmentId: string;
      userId: string;
    }>();
    expectTypeOf<ArtifactReadyData>().toEqualTypeOf<{
      artifactId: string;
      artifactType: ArtifactType;
      chatId: string;
      userId: string | null;
    }>();
    expectTypeOf<KnownWebhookEvent['event']>().toEqualTypeOf<
      | 'appointment.waiting_room_ready'
      | 'appointment.practitioner_joined'
      | 'appointment.call_ended'
      | 'artifact.ready'
    >();
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
