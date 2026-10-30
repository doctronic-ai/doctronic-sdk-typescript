import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  isKnownChatStreamEvent,
  type ChatStreamEvent,
  type UserScopedClient,
} from '../src/index.js';
import { parseSse, toChatStreamEvent, type SseFrame } from '../src/streaming.js';
import { delayed, sse, startMockServer, type MockServer } from './support/mock-server.js';

const MESSAGE_ID = 'ac_hist_01K6JGHM5S4W7T9Y2B3C4D5E6F';
const CHAT_ID = 'chat_01K6JGGM2G2DB4Y9KB9H9MJJ6Q';

// A recorded turn: every documented event, a comment, an unknown event with multiline data, and
// multi-byte UTF-8 so some splits land inside a character.
const RECORDED = [
  ': connected',
  '',
  'event: message.start',
  `data: {"type":"message.start","role":"assistant","messageId":"${MESSAGE_ID}","messageTimestamp":1741856873000}`,
  '',
  'event: message.content',
  `data: {"type":"message.content","messageId":"${MESSAGE_ID}","content":"I can help with that — "}`,
  '',
  ': keep-alive',
  'event: guardian',
  'data: {"type":"guardian","guardianId":"emergency_breathing","message":"Please call emergency services now.","endsConversation":false,"category":"emergency"}',
  '',
  'event: message.content',
  `data: {"type":"message.content","messageId":"${MESSAGE_ID}","content":"tell me more 🩺."}`,
  '',
  'event: future.event',
  'data: {"type":"future.event",',
  'data:"detail":"multiline"}',
  '',
  'event: message.stop',
  `data: {"type":"message.stop","messageId":"${MESSAGE_ID}"}`,
  '',
  'event: conversation.offtopic',
  `data: {"type":"conversation.offtopic","messageId":"${MESSAGE_ID}"}`,
  '',
  'event: skill_code.cta',
  'data: {"type":"skill_code.cta","skillCode":"109","widget":"cta_doctor_visit_in_person_widget","text":"See doctor in person"}',
  '',
  'event: conversation.end',
  `data: {"type":"conversation.end","messageId":"${MESSAGE_ID}","reason":"AGENT_STOP_CODE"}`,
  '',
  'event: ai_consultation.complete',
  'data: {"type":"ai_consultation.complete","artifacts":{"longSummary":"art_01K6JGGM2G2DB4Y9KB9H9MJJ6Q","shortSummary":null,"soapNote":null}}',
  '',
  'event: error',
  'data: {"type":"error","errorCode":"error.rate_limited","message":"The service is busy right now.","retryAfterSeconds":7}',
  '',
  '',
];

const EXPECTED_EVENTS: ChatStreamEvent[] = [
  {
    type: 'message.start',
    role: 'assistant',
    messageId: MESSAGE_ID,
    messageTimestamp: 1741856873000,
  },
  { type: 'message.content', messageId: MESSAGE_ID, content: 'I can help with that — ' },
  {
    type: 'guardian',
    guardianId: 'emergency_breathing',
    message: 'Please call emergency services now.',
    endsConversation: false,
    category: 'emergency',
  },
  { type: 'message.content', messageId: MESSAGE_ID, content: 'tell me more 🩺.' },
  { type: 'future.event', data: { type: 'future.event', detail: 'multiline' } },
  { type: 'message.stop', messageId: MESSAGE_ID },
  { type: 'conversation.offtopic', messageId: MESSAGE_ID },
  {
    type: 'skill_code.cta',
    skillCode: '109',
    widget: 'cta_doctor_visit_in_person_widget',
    text: 'See doctor in person',
  },
  { type: 'conversation.end', messageId: MESSAGE_ID, reason: 'AGENT_STOP_CODE' },
  {
    type: 'ai_consultation.complete',
    artifacts: {
      longSummary: 'art_01K6JGGM2G2DB4Y9KB9H9MJJ6Q',
      shortSummary: null,
      soapNote: null,
    },
  },
  {
    type: 'error',
    errorCode: 'error.rate_limited',
    message: 'The service is busy right now.',
    retryAfterSeconds: 7,
  },
];

const LINE_ENDINGS = { LF: '\n', CRLF: '\r\n', CR: '\r' };

function recorded(eol: string): Uint8Array {
  return new TextEncoder().encode(RECORDED.join(eol));
}

function bodyFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });
}

async function collect(chunks: Uint8Array[]): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const frame of parseSse(bodyFrom(chunks))) events.push(toChatStreamEvent(frame));
  return events;
}

async function frames(text: string): Promise<SseFrame[]> {
  const result: SseFrame[] = [];
  for await (const frame of parseSse(bodyFrom([new TextEncoder().encode(text)])))
    result.push(frame);
  return result;
}

describe('parseSse', () => {
  for (const [name, eol] of Object.entries(LINE_ENDINGS)) {
    describe(`${name} line endings`, () => {
      const bytes = recorded(eol);

      it('parses the recorded turn in one chunk', async () => {
        expect(await collect([bytes])).toEqual(EXPECTED_EVENTS);
      });

      it('parses the same events when split at every byte offset', async () => {
        for (let offset = 0; offset <= bytes.length; offset += 1) {
          const events = await collect([bytes.subarray(0, offset), bytes.subarray(offset)]);
          expect(events, `split at byte ${offset}`).toEqual(EXPECTED_EVENTS);
        }
      });

      it('parses the same events when split into three chunks around every offset', async () => {
        for (let offset = 0; offset < bytes.length; offset += 1) {
          const second = Math.min(bytes.length, offset + 1 + (offset % 7));
          const events = await collect([
            bytes.subarray(0, offset),
            bytes.subarray(offset, second),
            bytes.subarray(second),
          ]);
          expect(events, `split at bytes ${offset} and ${second}`).toEqual(EXPECTED_EVENTS);
        }
      });

      it('parses the same events one byte at a time', async () => {
        const single = Array.from(bytes, (byte) => Uint8Array.of(byte));
        expect(await collect(single)).toEqual(EXPECTED_EVENTS);
      });
    });
  }

  it('drops a truncated final frame', async () => {
    const text = `event: message.stop\ndata: {"messageId":"a"}\n\nevent: message.start\ndata: {"role":"assistant","messageId":"b"}\n`;
    expect(await frames(text)).toEqual([{ event: 'message.stop', data: '{"messageId":"a"}' }]);
  });

  it('skips comments and frames without data, and defaults the event name', async () => {
    expect(await frames(': ping\n\nevent: message.stop\n\ndata: plain\n\n')).toEqual([
      { event: 'message', data: 'plain' },
    ]);
  });

  it('joins multiline data with newlines and strips one leading space', async () => {
    expect(await frames('event: x\ndata:  a\ndata:b\ndata\n\n')).toEqual([
      { event: 'x', data: ' a\nb\n' },
    ]);
  });

  it('releases the body when the consumer stops early', async () => {
    let cancelled = false;
    // An open connection: one chunk arrives and the server keeps the stream going.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(recorded('\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const frame of parseSse(body)) {
      expect(frame.event).toBe('message.start');
      break;
    }
    expect(cancelled).toBe(true);
  });
});

describe('toChatStreamEvent', () => {
  it('yields unknown event names as { type, data } without throwing', () => {
    expect(toChatStreamEvent({ event: 'new.thing', data: '{"a":1}' })).toEqual({
      type: 'new.thing',
      data: { a: 1 },
    });
    expect(toChatStreamEvent({ event: 'new.thing', data: 'not json' })).toEqual({
      type: 'new.thing',
      data: 'not json',
    });
  });

  it('uses the SSE event name as the discriminant', () => {
    expect(toChatStreamEvent({ event: 'message.stop', data: '{"messageId":"m"}' })).toEqual({
      type: 'message.stop',
      messageId: 'm',
    });
  });

  it('yields a documented event with a malformed payload as unknown, without throwing', () => {
    for (const data of ['oops', '[]', '{"guardianId":"g"}', '{"guardianId":7,"message":"m"}']) {
      const event = toChatStreamEvent({ event: 'guardian', data });
      expect(event.type).toBe('guardian');
      expect(event).toHaveProperty('data');
      expect(isKnownChatStreamEvent(event)).toBe(false);
    }
  });

  it('falls back to the payload type when a frame has no event name', () => {
    expect(
      toChatStreamEvent({ event: 'message', data: '{"type":"message.stop","messageId":"m"}' }),
    ).toEqual({ type: 'message.stop', messageId: 'm' });
    expect(toChatStreamEvent({ event: 'message', data: 'plain' })).toEqual({
      type: 'message',
      data: 'plain',
    });
  });

  it('narrows known events', () => {
    expect(
      isKnownChatStreamEvent({
        type: 'guardian',
        guardianId: 'g',
        message: 'm',
        endsConversation: false,
        category: 'other',
      }),
    ).toBe(true);
    expect(isKnownChatStreamEvent({ type: 'future.event', data: null })).toBe(false);
  });
});

describe('events the contract documents', () => {
  const event = (type: string, data: object) =>
    toChatStreamEvent({ event: type, data: JSON.stringify({ type, ...data }) });
  const contract = JSON.parse(
    readFileSync(new URL('../openapi/doctronic-v1.json', import.meta.url), 'utf8'),
  );
  const schemas = contract.components.schemas;

  it('parses every stream example in the pinned contract into a known event', async () => {
    const examples: { value: string }[] = Object.values(
      contract.paths['/chats/{chatId}/stream/'].post.responses['200'].content['text/event-stream']
        .examples,
    );
    expect(examples.length).toBeGreaterThan(0);
    for (const { value } of examples) {
      const [frame] = await frames(value);
      if (!frame) throw new Error(`no frame in ${value}`);
      const parsed = toChatStreamEvent(frame);
      expect(isKnownChatStreamEvent(parsed), frame.data).toBe(true);
      expect(parsed).toEqual(JSON.parse(frame.data));
    }
  });

  it('keeps a guardian event whose guardianId and category are new', () => {
    const guardian = event('guardian', {
      guardianId: 'emergency_new_condition',
      message: '',
      endsConversation: true,
      category: 'escalation',
    });
    if (!isKnownChatStreamEvent(guardian) || guardian.type !== 'guardian') {
      throw new Error('expected a known guardian event');
    }
    expect(guardian.guardianId).toBe('emergency_new_condition');
    expect(guardian.category).toBe('escalation');
    expect(guardian.endsConversation).toBe(true);
  });

  it('keeps ai_consultation.complete when every artifact ID is null', () => {
    const artifacts = { longSummary: null, shortSummary: null, soapNote: null };
    const complete = event('ai_consultation.complete', { artifacts });
    expect(complete).toEqual({ type: 'ai_consultation.complete', artifacts });
    expect(isKnownChatStreamEvent(complete)).toBe(true);
  });

  it('yields an event type the contract does not list as unknown', () => {
    const paused = event('conversation.paused', { messageId: 'm' });
    expect(paused).toEqual({
      type: 'conversation.paused',
      data: { type: 'conversation.paused', messageId: 'm' },
    });
    expect(isKnownChatStreamEvent(paused)).toBe(false);
  });

  it('delivers a guardian event without endsConversation or category typed, with the defaults', () => {
    const guardian = schemas.StreamChatGuardianEvent.properties;
    expect([guardian.endsConversation.default, guardian.category.default]).toEqual([
      false,
      'other',
    ]);

    const bare = event('guardian', { guardianId: 'emergency_breathing', message: 'Call now.' });
    expect(bare).toEqual({
      type: 'guardian',
      guardianId: 'emergency_breathing',
      message: 'Call now.',
      endsConversation: guardian.endsConversation.default,
      category: guardian.category.default,
    });
    if (!isKnownChatStreamEvent(bare) || bare.type !== 'guardian') {
      throw new Error('expected a known guardian event');
    }
    expect(bare.endsConversation).toBe(false);
    expect(bare.category).toBe('other');

    // Only a missing field gets its default.
    const partial = event('guardian', {
      guardianId: 'emergency_breathing',
      message: '',
      endsConversation: true,
    });
    expect(partial).toMatchObject({ endsConversation: true, category: 'other' });
    expect(isKnownChatStreamEvent(partial)).toBe(true);
  });

  it('still yields a guardian event as unknown when a field is the wrong type or guardianId is missing', () => {
    for (const data of [
      { guardianId: 'emergency_breathing', message: 'Call now.', endsConversation: 'yes' },
      { guardianId: 'emergency_breathing', message: 'Call now.', category: null },
      { message: 'Call now.' },
    ]) {
      const malformed = event('guardian', data);
      // The unknown event carries the payload as sent, without the defaults.
      expect(malformed).toEqual({ type: 'guardian', data: { type: 'guardian', ...data } });
      expect(isKnownChatStreamEvent(malformed)).toBe(false);
    }
  });

  it('accepts the fields the contract makes optional', () => {
    expect(isKnownChatStreamEvent(event('skill_code.cta', { skillCode: '109' }))).toBe(true);
    expect(isKnownChatStreamEvent(event('conversation.end', {}))).toBe(true);
    expect(
      isKnownChatStreamEvent(event('error', { errorCode: 'error.internal', message: 'Failed.' })),
    ).toBe(true);
  });
});

describe('chats.stream', () => {
  let server: MockServer;
  let scoped: UserScopedClient;
  const turn = { userInput: 'I have had a sore throat and fever since yesterday.' };

  beforeEach(async () => {
    server = await startMockServer();
    scoped = server.client().forUser('mem_01K6JGGM2G2DB4Y9KB9H9MJJ6Q');
  });

  afterEach(async () => {
    await server.close();
  });

  function chunked(eol: string, size: number): string[] {
    const text = RECORDED.join(eol);
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
    return chunks;
  }

  it('yields typed events as the server writes them', async () => {
    server.enqueue(sse(chunked('\r\n', 37), { gapMs: 1 }));
    const stream = await scoped.chats.stream(CHAT_ID, turn);
    const events: ChatStreamEvent[] = [];
    for await (const event of stream) events.push(event);
    expect(events).toEqual(EXPECTED_EVENTS);
  });

  it('yields a stream error event instead of throwing', async () => {
    server.enqueue(sse(chunked('\n', 64)));
    const stream = await scoped.chats.stream(CHAT_ID, turn);
    const types: string[] = [];
    for await (const event of stream) types.push(event.type);
    expect(types.at(-1)).toBe('error');
  });

  it('assembles messages with finalMessages()', async () => {
    server.enqueue(sse(chunked('\n', 50)));
    const stream = await scoped.chats.stream(CHAT_ID, turn);
    const { messages, controlEvents } = await stream.finalMessages();
    expect(messages).toEqual([
      {
        messageId: MESSAGE_ID,
        role: 'assistant',
        content: 'I can help with that — tell me more 🩺.',
        messageTimestamp: 1741856873000,
        complete: true,
      },
    ]);
    expect(controlEvents.map((event) => event.type)).toEqual([
      'guardian',
      'future.event',
      'conversation.offtopic',
      'skill_code.cta',
      'conversation.end',
      'ai_consultation.complete',
      'error',
    ]);
  });

  it('keys message chunks by messageId, not by arrival', async () => {
    const frame = (event: string, data: object) =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    server.enqueue(
      sse([
        frame('message.start', { role: 'assistant', messageId: 'a' }),
        frame('message.start', { role: 'user', messageId: 'b' }),
        frame('message.content', { messageId: 'a', content: 'A1 ' }),
        frame('message.content', { messageId: 'b', content: 'B1' }),
        frame('message.content', { messageId: 'a', content: 'A2' }),
        frame('message.content', { messageId: 'orphan', content: 'dropped' }),
        frame('message.stop', { messageId: 'a' }),
      ]),
    );
    const { messages } = await (await scoped.chats.stream(CHAT_ID, turn)).finalMessages();
    expect(messages).toEqual([
      { messageId: 'a', role: 'assistant', content: 'A1 A2', complete: true },
      { messageId: 'b', role: 'user', content: 'B1', complete: false },
    ]);
  });

  it('leaves out a null messageTimestamp', async () => {
    server.enqueue(
      sse([
        `event: message.start\ndata: ${JSON.stringify({ role: 'assistant', messageId: 'a', messageTimestamp: null })}\n\n`,
      ]),
    );
    const { messages } = await (await scoped.chats.stream(CHAT_ID, turn)).finalMessages();
    expect(messages).toEqual([{ messageId: 'a', role: 'assistant', content: '', complete: false }]);
  });

  it('accumulates what was read when iteration stops early', async () => {
    server.enqueue(sse(chunked('\n', 80)));
    const stream = await scoped.chats.stream(CHAT_ID, turn);
    for await (const event of stream) {
      if (event.type === 'guardian') break;
    }
    const { messages, controlEvents } = await stream.finalMessages();
    expect(messages[0]?.content).toBe('I can help with that — ');
    expect(controlEvents.map((event) => event.type)).toEqual(['guardian']);
    await expect(async () => {
      for await (const event of stream) void event;
    }).rejects.toThrow(/already been read/);
  });

  it('cancels through the AbortSignal and closes the connection', async () => {
    const controller = new AbortController();
    server.enqueue(sse(chunked('\n', 40), { gapMs: 50 }));
    const stream = await scoped.chats.stream(CHAT_ID, { ...turn, signal: controller.signal });
    const seen: string[] = [];
    const reading = (async () => {
      for await (const event of stream) {
        seen.push(event.type);
        if (seen.length === 1) controller.abort();
      }
    })();
    await expect(reading).rejects.toBeInstanceOf(APIUserAbortError);
    await server.requests[0]?.closed;
    expect(seen.length).toBeLessThan(EXPECTED_EVENTS.length);
  });

  it('delivers no buffered events after an abort', async () => {
    const frame = (event: string, data: object) =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    // Several complete events in one network chunk.
    server.enqueue(
      sse([
        frame('message.start', { role: 'assistant', messageId: 'm' }) +
          frame('message.content', { messageId: 'm', content: 'a' }) +
          frame('message.stop', { messageId: 'm' }),
      ]),
    );
    const stream = await scoped.chats.stream(CHAT_ID, turn);
    const seen: string[] = [];
    const reading = (async () => {
      for await (const event of stream) {
        seen.push(event.type);
        stream.abort();
      }
    })();
    await expect(reading).rejects.toBeInstanceOf(APIUserAbortError);
    expect(seen).toEqual(['message.start']);
  });

  it('keeps reading past a malformed event', async () => {
    server.enqueue(
      sse([
        'event: guardian\ndata: not json\n\n',
        'event: guardian\ndata: {"guardianId":"emergency_breathing","message":"Call now.","endsConversation":false,"category":"emergency"}\n\n',
      ]),
    );
    const { controlEvents } = await (await scoped.chats.stream(CHAT_ID, turn)).finalMessages();
    expect(controlEvents).toEqual([
      { type: 'guardian', data: 'not json' },
      {
        type: 'guardian',
        guardianId: 'emergency_breathing',
        message: 'Call now.',
        endsConversation: false,
        category: 'emergency',
      },
    ]);
    expect(controlEvents.map(isKnownChatStreamEvent)).toEqual([false, true]);
  });

  it('rejects a success response that is not an event stream', async () => {
    server.enqueue((_request, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>Sign in to the proxy</html>');
    });
    await expect(scoped.chats.stream(CHAT_ID, turn)).rejects.toMatchObject({
      constructor: APIError,
      status: 200,
      message: 'Expected an event stream, got "text/html".',
    });
    expect(server.requests).toHaveLength(1);
  });

  it('cancels with abort()', async () => {
    server.enqueue(sse(chunked('\n', 40), { gapMs: 50 }));
    const stream = await scoped.chats.stream(CHAT_ID, turn);
    const reading = (async () => {
      for await (const event of stream) {
        if (event.type === 'message.start') stream.abort();
      }
    })();
    await expect(reading).rejects.toBeInstanceOf(APIUserAbortError);
  });

  it('rejects before sending when the signal is already aborted', async () => {
    await expect(
      scoped.chats.stream(CHAT_ID, { ...turn, signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(APIUserAbortError);
  });

  it('surfaces a dropped connection mid-stream as a connection error', async () => {
    server.enqueue(async (request, res) => {
      await sse(['event: message.start\ndata: {"role":"assistant","messageId":"m"}\n\n'], {
        end: false,
      })(request, res);
      setTimeout(() => res.socket?.destroy(), 20);
    });
    const stream = await scoped.chats.stream(CHAT_ID, turn);
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const event of stream) seen.push(event.type);
      })(),
    ).rejects.toBeInstanceOf(APIConnectionError);
    expect(seen).toEqual(['message.start']);
    expect(server.requests).toHaveLength(1);
  });

  it('times out while waiting for the stream to start, but not while it runs', async () => {
    server.enqueue(delayed(300, sse([])));
    await expect(scoped.chats.stream(CHAT_ID, { ...turn, timeoutMs: 100 })).rejects.toBeInstanceOf(
      APITimeoutError,
    );

    server.enqueue(sse(chunked('\n', 200), { gapMs: 60 }));
    const stream = await scoped.chats.stream(CHAT_ID, { ...turn, timeoutMs: 100 });
    const { messages } = await stream.finalMessages();
    expect(messages).toHaveLength(1);
  });

  it('exposes the response and request ID', async () => {
    server.enqueue(sse([]));
    const {
      data: stream,
      response,
      requestId,
      idempotencyKey,
      idempotencyReplayed,
    } = await scoped.chats.stream(CHAT_ID, turn).withResponse();
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(requestId).toBe(stream.requestId);
    expect(idempotencyKey).toBeNull();
    expect(idempotencyReplayed).toBe(false);
    expect(requestId).toMatch(/^req_/);
    await stream.finalMessages();
  });
});
