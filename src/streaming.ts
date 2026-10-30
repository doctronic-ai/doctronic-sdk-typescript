// The chat stream: an SSE parser ported from the docs' reference parser
// (conversations/streaming.mdx), the typed event union, and the optional accumulator.
//
// The event types and the fields each event must carry are generated from the contract
// (src/generated/events.ts), from the union that the stream's `x-doctronic-event-schema` names.

import { APIConnectionError, APIUserAbortError, DoctronicError, isRecord } from './errors.js';
import { streamEventFields, type JsonType, type StreamEvents } from './generated/events.js';
import type { components } from './generated/schema.js';

export type SseFrame = { event: string; data: string };

const FRAME_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;

export function decodeFrame(raw: string): SseFrame | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of raw.split(/\r\n|\r|\n/)) {
    if (!line || line.startsWith(':')) continue; // Blank line or comment.
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = FRAME_BOUNDARY.exec(buffer))) {
        const frame = decodeFrame(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (frame) yield frame;
      }
      if (done) {
        finished = true;
        break;
      }
    }
    // Every complete frame ends with a blank line. Leftover text means the stream was cut off
    // mid-frame, so drop it rather than parse a partial event.
  } finally {
    // Runs when the caller breaks out of the loop or aborts: release the connection.
    if (!finished) await reader.cancel('SSE consumer stopped').catch(() => undefined);
    reader.releaseLock();
  }
}

/** `message.start`: start a message with this `role` and `messageId`. */
export type MessageStartEvent = StreamEvents['message.start'];

/** `message.content`: append `content` to the message with the same `messageId`. */
export type MessageContentEvent = StreamEvents['message.content'];

/** `message.stop`: that message is complete. The turn and the consultation continue. */
export type MessageStopEvent = StreamEvents['message.stop'];

/**
 * `guardian`: run your approved safety behavior and log the stable `guardianId`. When
 * `endsConversation` is `true`, stop taking input but keep reading until `conversation.end`.
 */
export type GuardianEvent = StreamEvents['guardian'];

/** The guardian IDs the contract lists. New IDs can be added, so `guardianId` is any string. */
export type GuardianId = components['schemas']['PartnerGuardianId'];

/** The guardian categories the contract lists. New ones can be added, so `category` is any string. */
export type GuardianCategory = components['schemas']['GuardianCategory'];

/** `conversation.offtopic`: the patient's message was classified as off-topic. */
export type ConversationOfftopicEvent = StreamEvents['conversation.offtopic'];

/** `conversation.end`: the assistant ended the conversation. */
export type ConversationEndEvent = StreamEvents['conversation.end'];

/** `skill_code.cta`: present the end-of-flow action mapped to this `skillCode` and `widget`. */
export type SkillCodeCtaEvent = StreamEvents['skill_code.cta'];

/** `ai_consultation.complete`: the consultation is complete. A `null` ID wasn't generated. */
export type AiConsultationCompleteEvent = StreamEvents['ai_consultation.complete'];

/** The document IDs in `ai_consultation.complete`, for `artifacts.retrieve()`. */
export type ConsultationArtifacts = components['schemas']['ConsultationArtifacts'];

/** `error`: a failure after the stream started. Handle it apart from message text. */
export type StreamErrorEvent = StreamEvents['error'];

/** An event this SDK doesn't know yet. New event names are additive: ignore what you don't use. */
export interface UnknownChatStreamEvent {
  type: string;
  data: unknown;
}

/** Every event the contract documents, as a union on `type`. */
export type KnownChatStreamEvent = StreamEvents[keyof StreamEvents];

export type ChatStreamEvent = KnownChatStreamEvent | UnknownChatStreamEvent;

const unknownEvents = new WeakSet<object>();

function jsonTypeOf(value: unknown): JsonType | undefined {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean' || type === 'object'
    ? type
    : undefined;
}

// A documented event must carry each field the contract says it always carries, with one of the
// field's JSON types. Otherwise it's yielded as an unknown event rather than with a type it doesn't
// satisfy. Only the event's own fields are checked: `artifacts` only has to be an object.
// `guardian` is the exception: see GUARDIAN_DEFAULTS.
function isWellFormed(type: string, payload: unknown): payload is Record<string, unknown> {
  if (!Object.hasOwn(streamEventFields, type) || !isRecord(payload)) return false;
  const fields: Readonly<Record<string, readonly JsonType[]>> =
    streamEventFields[type as KnownChatStreamEvent['type']];
  return Object.entries(fields).every(([field, types]) => {
    const actual = jsonTypeOf(payload[field]);
    return actual !== undefined && types.includes(actual);
  });
}

// A safety event is never demoted to unknown over these two fields: a `guardian` event where one is
// missing or `null` gets the contract's default for it. Any other value is still checked, as is
// every other required field.
const GUARDIAN_DEFAULTS: Pick<GuardianEvent, 'endsConversation' | 'category'> = {
  endsConversation: false,
  category: 'other',
};

function withDefaults(type: string, payload: unknown): unknown {
  if (type !== 'guardian' || !isRecord(payload)) return payload;
  const filled = { ...payload };
  for (const [field, value] of Object.entries(GUARDIAN_DEFAULTS)) filled[field] ??= value;
  return filled;
}

/**
 * Narrows an event to the documented types. TypeScript can't narrow a union with an open-ended
 * `type: string` member on `event.type` alone, so check this first, then switch on `event.type`.
 */
export function isKnownChatStreamEvent(event: ChatStreamEvent): event is KnownChatStreamEvent {
  return !unknownEvents.has(event) && isWellFormed(event.type, event);
}

/**
 * Turns one SSE frame into a typed event. Never throws: an unknown event name, or a documented
 * one whose payload lacks its required fields, is yielded as `{ type, data }`. A `guardian` event
 * whose `endsConversation` or `category` is missing or `null` gets the contract's default for it,
 * `false` or `"other"`.
 */
export function toChatStreamEvent(frame: SseFrame): ChatStreamEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    payload = frame.data;
  }
  // The SSE event name is the discriminant. A frame without one gets the SSE default,
  // `message`; the payload's `type` matches the event name on the wire, so use that instead.
  const type =
    frame.event === 'message' && isRecord(payload) && typeof payload.type === 'string'
      ? payload.type
      : frame.event;
  const filled = withDefaults(type, payload);
  if (isWellFormed(type, filled)) return { ...filled, type } as KnownChatStreamEvent;
  const event: UnknownChatStreamEvent = { type, data: payload };
  unknownEvents.add(event);
  return event;
}

/** One message assembled from `message.*` events. */
export interface StreamedMessage {
  messageId: string;
  /** The role from `message.start`. */
  role: string;
  content: string;
  messageTimestamp?: number;
  /** `true` once `message.stop` arrived for this message. */
  complete: boolean;
}

/** What {@link ChatStream.finalMessages} returns. */
export interface FinalMessages {
  /** Messages in the order their `message.start` arrived. */
  messages: StreamedMessage[];
  /** Every event other than `message.*`, in arrival order, including unknown event types. */
  controlEvents: ChatStreamEvent[];
}

class Accumulator {
  readonly #messages = new Map<string, StreamedMessage>();
  readonly #controlEvents: ChatStreamEvent[] = [];

  add(event: ChatStreamEvent): void {
    if (!isKnownChatStreamEvent(event)) {
      this.#controlEvents.push(event);
      return;
    }
    switch (event.type) {
      case 'message.start': {
        const message: StreamedMessage = {
          messageId: event.messageId,
          role: event.role,
          content: '',
          complete: false,
        };
        if (typeof event.messageTimestamp === 'number') {
          message.messageTimestamp = event.messageTimestamp;
        }
        this.#messages.set(event.messageId, message);
        break;
      }
      case 'message.content': {
        // Key chunks by messageId. Content for a message that never started has no role to render
        // with, so it's skipped, as the docs' reference parser does.
        const message = this.#messages.get(event.messageId);
        if (message) message.content += event.content;
        break;
      }
      case 'message.stop': {
        const message = this.#messages.get(event.messageId);
        if (message) message.complete = true;
        break;
      }
      default:
        this.#controlEvents.push(event);
    }
  }

  snapshot(): FinalMessages {
    return {
      messages: [...this.#messages.values()].map((message) => ({ ...message })),
      controlEvents: [...this.#controlEvents],
    };
  }
}

/**
 * One streamed turn. Iterate it with `for await` to read events as they arrive. It can be read
 * once. The stream is never retried: to recover from an error, read the transcript first.
 */
export class ChatStream implements AsyncIterable<ChatStreamEvent> {
  /** The HTTP response that carries the stream. */
  readonly response: Response;
  /** The `X-Request-ID` response header. */
  readonly requestId: string | null;

  readonly #controller: AbortController;
  readonly #release: () => void;
  readonly #accumulator = new Accumulator();
  #iterated = false;

  /** @internal */
  constructor(response: Response, controller: AbortController, release: () => void = () => {}) {
    this.response = response;
    this.requestId = response.headers.get('x-request-id');
    this.#controller = controller;
    this.#release = release;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ChatStreamEvent> {
    if (this.#iterated) throw new DoctronicError('This stream has already been read.');
    this.#iterated = true;
    const body = this.response.body;
    try {
      if (!body) return;
      for await (const frame of parseSse(body)) {
        // One network chunk can hold several frames. Deliver none of them after an abort.
        if (this.#controller.signal.aborted) throw new APIUserAbortError();
        const event = toChatStreamEvent(frame);
        this.#accumulator.add(event);
        yield event;
      }
    } catch (error) {
      throw this.#translate(error);
    } finally {
      this.#release();
    }
  }

  /** Stops reading and closes the connection. */
  abort(): void {
    this.#controller.abort();
    this.#release();
  }

  /**
   * Assembles messages by `messageId` with the role from `message.start`, and collects every
   * other event. Reads the stream to the end if it hasn't been iterated; otherwise returns what
   * the events read so far produced.
   */
  async finalMessages(): Promise<FinalMessages> {
    if (!this.#iterated) {
      for await (const event of this) void event;
    }
    return this.#accumulator.snapshot();
  }

  #translate(error: unknown): unknown {
    if (error instanceof DoctronicError) return error;
    if (this.#controller.signal.aborted) return new APIUserAbortError({ cause: error });
    return new APIConnectionError('The stream was interrupted.', { cause: error });
  }
}
