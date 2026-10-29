// The chat stream: an SSE parser ported from the docs' reference parser
// (conversations/streaming.mdx), the typed event union, and the optional accumulator.
//
// The contract documents the events as examples only, so the event types below follow the
// event reference table in the docs.

import { APIConnectionError, APIUserAbortError, DoctronicError, isRecord } from './errors.js';

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
export interface MessageStartEvent {
  type: 'message.start';
  role: string;
  messageId: string;
  /** Milliseconds since the Unix epoch. */
  messageTimestamp?: number;
}

/** `message.content`: append `content` to the message with the same `messageId`. */
export interface MessageContentEvent {
  type: 'message.content';
  messageId: string;
  content: string;
}

/** `message.stop`: that message is complete. The turn and the consultation continue. */
export interface MessageStopEvent {
  type: 'message.stop';
  messageId: string;
}

/** `guardian`: run your approved safety behavior and log the stable `guardianId`. */
export interface GuardianEvent {
  type: 'guardian';
  guardianId: string;
  message: string;
}

/** `conversation.offtopic`: the patient's message was classified as off-topic. */
export interface ConversationOfftopicEvent {
  type: 'conversation.offtopic';
  messageId?: string;
}

/** `conversation.end`: the assistant ended the conversation. */
export interface ConversationEndEvent {
  type: 'conversation.end';
  messageId?: string;
  reason?: string;
}

/** `skill_code.cta`: present the end-of-flow action mapped to this `skillCode` and `widget`. */
export interface SkillCodeCtaEvent {
  type: 'skill_code.cta';
  skillCode: string;
  widget: string;
  text?: string;
}

/** `ai_consultation.complete`: the consultation is complete. An absent or `null` ID wasn't generated. */
export interface AiConsultationCompleteEvent {
  type: 'ai_consultation.complete';
  artifacts: {
    longSummary?: string | null;
    shortSummary?: string | null;
    soapNote?: string | null;
  };
}

/** `error`: a failure after the stream started. Handle it apart from message text. */
export interface StreamErrorEvent {
  type: 'error';
  errorCode: string;
  message: string;
  retryAfterSeconds?: number;
}

/** An event this SDK doesn't know yet. New event names are additive: ignore what you don't use. */
export interface UnknownChatStreamEvent {
  type: string;
  data: unknown;
}

export type KnownChatStreamEvent =
  | MessageStartEvent
  | MessageContentEvent
  | MessageStopEvent
  | GuardianEvent
  | ConversationOfftopicEvent
  | ConversationEndEvent
  | SkillCodeCtaEvent
  | AiConsultationCompleteEvent
  | StreamErrorEvent;

export type ChatStreamEvent = KnownChatStreamEvent | UnknownChatStreamEvent;

// The fields each documented event must carry, by type. A payload missing one is yielded as an
// unknown event rather than with a type it doesn't satisfy.
const REQUIRED_FIELDS: Record<KnownChatStreamEvent['type'], Record<string, 'string' | 'object'>> = {
  'message.start': { role: 'string', messageId: 'string' },
  'message.content': { messageId: 'string', content: 'string' },
  'message.stop': { messageId: 'string' },
  guardian: { guardianId: 'string', message: 'string' },
  'conversation.offtopic': {},
  'conversation.end': {},
  'skill_code.cta': { skillCode: 'string', widget: 'string' },
  'ai_consultation.complete': { artifacts: 'object' },
  error: { errorCode: 'string', message: 'string' },
};

const unknownEvents = new WeakSet<object>();

function isWellFormed(type: string, payload: unknown): payload is Record<string, unknown> {
  if (!Object.hasOwn(REQUIRED_FIELDS, type) || !isRecord(payload)) return false;
  const required = REQUIRED_FIELDS[type as KnownChatStreamEvent['type']];
  return Object.entries(required).every(([field, kind]) =>
    kind === 'object' ? isRecord(payload[field]) : typeof payload[field] === kind,
  );
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
 * one whose payload lacks its required fields, is yielded as `{ type, data }`.
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
  if (isWellFormed(type, payload)) return { ...payload, type } as KnownChatStreamEvent;
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
        if (event.messageTimestamp !== undefined) message.messageTimestamp = event.messageTimestamp;
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
