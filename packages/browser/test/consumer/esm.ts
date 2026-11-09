// A browser app's use of the package. Every class it exports is used as a value, which fails to
// compile if the declarations mark it type-only.

import {
  APIError,
  BASE_URLS,
  Chat,
  ChatStateError,
  DoctronicBrowser,
  DoctronicError,
  ErrorCode,
  RateLimitError,
  StreamInterruptedError,
  attributionFromQuery,
  isKnownChatStreamEvent,
  stateStep,
  type ChatState,
  type ChatStreamEvent,
  type DeploymentConfig,
  type GuardianId,
  type StateStep,
} from '@doctronic-ai/browser';

export const staging: string = BASE_URLS.staging;

export async function start(): Promise<Chat> {
  const client = new DoctronicBrowser({
    publishableKey: 'pk_test_example',
    attribution: attributionFromQuery('?utm_source=newsletter', 'web'),
  });
  const config: DeploymentConfig = await client.getConfig();
  const step: StateStep = stateStep(config.intake);
  if (step.mode === 'unsupported') throw new Error('unsupported');
  await client.startSession({
    intake: {
      age: 40,
      sex: 'female',
      state: step.mode === 'selection' ? step.states[0] : undefined,
    },
    termsAccepted: true,
  });
  return client.createChat();
}

export async function turn(chat: Chat): Promise<ChatState> {
  for await (const event of chat.send('What does stage 2 mean?')) {
    if (isKnownChatStreamEvent(event) && event.type === 'message.content') void event.content;
  }
  return chat.state;
}

export function waitFor(error: unknown): number | null {
  if (error instanceof RateLimitError) return error.retryAfter;
  if (error instanceof APIError && error.code === ErrorCode.paused) return null;
  return null;
}

export const classes: readonly unknown[] = [ChatStateError, DoctronicError, StreamInterruptedError];

export type Events = ChatStreamEvent;

// `guardianId` is open: it takes IDs the contract doesn't list yet.
export const BREATHING: GuardianId = 'emergency_breathing';
