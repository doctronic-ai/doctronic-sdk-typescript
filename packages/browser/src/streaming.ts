// The chat stream: server-sent events per the WHATWG spec, and the typed events. The event types
// and the fields each event must carry are generated from the contract (generated/events.ts).

import { isRecord } from './errors.js';
import { streamEventFields, type JsonType, type StreamEvents } from './generated/events.js';
import type { components } from './generated/schema.js';

export type MessageStartEvent = StreamEvents['message.start'];
export type MessageContentEvent = StreamEvents['message.content'];
export type MessageStopEvent = StreamEvents['message.stop'];
export type ConversationEndEvent = StreamEvents['conversation.end'];
export type ConversationOfftopicEvent = StreamEvents['conversation.offtopic'];
export type StreamErrorEvent = StreamEvents['error'];
export type SkillCodeCtaEvent = StreamEvents['skill_code.cta'];

/**
 * `guardian`. `message` is legacy: this client passes it on only for the `safety` category, where
 * the contract says it is patient-ready. For any other category it is empty, since an emergency's
 * `message` can be an internal label.
 */
export type GuardianEvent = StreamEvents['guardian'];

/** The guardian IDs the contract lists. New IDs can be added, so `guardianId` is any string. */
export type GuardianId = components['schemas']['PartnerGuardianId'];

/** The categories the contract lists. Treat a value you don't know as `other`. */
export type GuardianCategory = components['schemas']['GuardianCategory'];

/**
 * `ai_consultation.complete`: the consultation is complete. The contract's event carries document
 * IDs; this client drops them, since a visitor's browser never retrieves consultation documents.
 */
export type AiConsultationCompleteEvent = Omit<
  StreamEvents['ai_consultation.complete'],
  'artifacts'
>;

/** Every event the contract documents, as a union on `type`. */
export type KnownChatStreamEvent =
  | MessageStartEvent
  | MessageContentEvent
  | MessageStopEvent
  | ConversationEndEvent
  | ConversationOfftopicEvent
  | GuardianEvent
  | StreamErrorEvent
  | SkillCodeCtaEvent
  | AiConsultationCompleteEvent;

/** An event this version doesn't know. New event names are additive: ignore what you don't use. */
export interface UnknownChatStreamEvent {
  type: string;
  data: unknown;
}

export type ChatStreamEvent = KnownChatStreamEvent | UnknownChatStreamEvent;

const unknownEvents = new WeakSet<object>();

/**
 * Narrows an event to the documented types. TypeScript can't narrow a union with an open-ended
 * `type: string` member on `event.type` alone, so check this first, then switch on `event.type`.
 */
export function isKnownChatStreamEvent(event: ChatStreamEvent): event is KnownChatStreamEvent {
  return !unknownEvents.has(event) && Object.hasOwn(streamEventFields, event.type);
}

/** @internal One SSE event: its `event` name (`message` by default) and its joined `data`. */
export interface SseFrame {
  event: string;
  data: string;
}

const BOM = '\uFEFF';

/**
 * @internal Reads server-sent events per the WHATWG spec: LF, CRLF or CR line endings (a CRLF split
 * across chunks included), multi-line `data`, comments, a leading BOM, and UTF-8 split across
 * chunks. An event left unfinished when the stream ends is dropped, as the spec says. The reader is
 * cancelled when the consumer stops early.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let first = true;
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      let text = buffer + (done ? decoder.decode() : decoder.decode(value, { stream: true }));
      if (first && text) {
        if (text.startsWith(BOM)) text = text.slice(1);
        first = false;
      }
      // A trailing CR may be the first half of a CRLF split across chunks: hold it back.
      const carry = !done && text.endsWith('\r') ? '\r' : '';
      if (carry) text = text.slice(0, -1);
      const lines = text.split(/\r\n|\r|\n/);
      buffer = (lines.pop() ?? '') + carry;
      for (const line of lines) {
        if (line === '') {
          if (data.length) yield { event: event || 'message', data: data.join('\n') };
          event = '';
          data = [];
          continue;
        }
        if (line.startsWith(':')) continue; // A comment, such as a keep-alive.
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        let fieldValue = colon === -1 ? '' : line.slice(colon + 1);
        if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1);
        if (field === 'event') event = fieldValue;
        else if (field === 'data') data.push(fieldValue);
        // `id` and `retry` aren't used: a turn is never resumed or reconnected.
      }
      if (done) {
        finished = true;
        return;
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function jsonTypeOf(value: unknown): JsonType | undefined {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean' || type === 'object'
    ? type
    : undefined;
}

function hasRequiredFields(type: keyof StreamEvents, payload: Record<string, unknown>): boolean {
  const fields: Readonly<Record<string, readonly JsonType[]>> = streamEventFields[type];
  return Object.entries(fields).every(([field, types]) => {
    const actual = jsonTypeOf(payload[field]);
    return actual !== undefined && types.includes(actual);
  });
}

// A safety event is never set aside over these two fields: a `guardian` event where one is missing
// or `null` gets the contract's default for it, as the server SDK does.
const GUARDIAN_DEFAULTS = { endsConversation: false, category: 'other' } as const;

/** @internal What one frame turned out to be. */
export type ParsedFrame =
  | { kind: 'event'; event: ChatStreamEvent }
  /** A documented event without its required fields, or not valid JSON. Never shown. */
  | { kind: 'invalid'; type: string; endsConversation: boolean }
  | { kind: 'malformed' };

/**
 * @internal Turns one SSE frame into an event. A frame that isn't JSON is `malformed`. A documented
 * event that lacks a required field is `invalid`, and records only whether it was a guardian that
 * ends the conversation, so the chat can still stop. An unknown event name is passed on as
 * `{ type, data }`.
 */
export function toChatStreamEvent(frame: SseFrame): ParsedFrame {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    return { kind: 'malformed' };
  }
  // The SSE event name is the discriminant; without one, the payload's `type` matches it.
  const type =
    frame.event === 'message' && isRecord(payload) && typeof payload.type === 'string'
      ? payload.type
      : frame.event;
  if (!Object.hasOwn(streamEventFields, type)) {
    const event: UnknownChatStreamEvent = { type, data: payload };
    unknownEvents.add(event);
    return { kind: 'event', event };
  }
  const known = type as keyof StreamEvents;
  if (!isRecord(payload)) return { kind: 'invalid', type, endsConversation: false };
  const filled: Record<string, unknown> = { ...payload, type };
  if (known === 'guardian') {
    filled.endsConversation ??= GUARDIAN_DEFAULTS.endsConversation;
    filled.category ??= GUARDIAN_DEFAULTS.category;
  }
  if (!hasRequiredFields(known, filled)) {
    return {
      kind: 'invalid',
      type,
      endsConversation: known === 'guardian' && payload.endsConversation === true,
    };
  }
  if (known === 'ai_consultation.complete') {
    // Consultation documents are never exposed in the browser.
    delete filled.artifacts;
    return { kind: 'event', event: filled as AiConsultationCompleteEvent };
  }
  if (known === 'guardian' && filled.category !== 'safety') filled.message = '';
  return { kind: 'event', event: filled as unknown as KnownChatStreamEvent };
}
