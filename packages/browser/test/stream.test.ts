import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APIConnectionError,
  APITimeoutError,
  ServiceUnavailableError,
  StreamInterruptedError,
  isKnownChatStreamEvent,
  type ChatStreamEvent,
} from '../src/index.js';
import { count, drain, frame, harness, json, sse } from './helpers.js';

const STREAM = 'POST /chats/chat_1/stream/';

const events: ChatStreamEvent[] = [
  { type: 'message.start', role: 'assistant', messageId: 'm1' },
  { type: 'message.content', messageId: 'm1', content: 'Hi\nthere ✓' },
  { type: 'message.stop', messageId: 'm1' },
];
const wire = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

async function streamWith(chunks: (string | Uint8Array)[]) {
  const h = harness();
  const stream = sse(chunks);
  h.routes[STREAM] = () => stream.response;
  const onDiagnostic = vi.fn();
  const client = await h.started({ onDiagnostic });
  const chat = await client.createChat();
  return { h, chat, stream, onDiagnostic };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('stream parsing', () => {
  it('handles frames split at arbitrary points', async () => {
    const { chat } = await streamWith(wire.match(/[\s\S]{1,7}/g)!);
    expect(await drain(chat.send('hi'))).toEqual(events);
  });

  it('handles a UTF-8 character split across chunks', async () => {
    const bytes = new TextEncoder().encode(wire);
    const check = bytes.indexOf(0xe2); // The first byte of ✓.
    const { chat } = await streamWith([bytes.slice(0, check + 1), bytes.slice(check + 1)]);
    expect(await drain(chat.send('hi'))).toEqual(events);
  });

  it('handles CRLF line endings, including a CRLF split across chunks', async () => {
    const crlf = wire.replaceAll('\n\n', '\r\n\r\n');
    const at = crlf.indexOf('\r\n') + 1;
    const { chat } = await streamWith([crlf.slice(0, at), crlf.slice(at)]);
    expect(await drain(chat.send('hi'))).toEqual(events);
  });

  it('handles CR line endings', async () => {
    const { chat } = await streamWith([wire.replaceAll('\n\n', '\r\r')]);
    expect(await drain(chat.send('hi'))).toEqual(events);
  });

  it("doesn't split a multi-line data field when a CRLF straddles two chunks", async () => {
    const payload = JSON.stringify(events[0], null, 2).split('\n');
    const text = `${payload.map((line) => `data: ${line}`).join('\r\n')}\r\n\r\n`;
    const at = text.indexOf('\r\n') + 1;
    const { chat, onDiagnostic } = await streamWith([
      text.slice(0, at),
      text.slice(at),
      wire.slice(wire.indexOf('data', 1)),
    ]);
    expect(await drain(chat.send('hi'))).toEqual(events);
    expect(onDiagnostic).not.toHaveBeenCalled();
  });

  it('joins multi-line data fields, and ignores comments, ids, retries and a leading BOM', async () => {
    const payload = JSON.stringify(events[0], null, 2).split('\n');
    const first = `${String.fromCharCode(0xfeff)}: keep-alive\nid: 1\nretry: 10\n${payload.map((line) => `data: ${line}`).join('\n')}\n\n`;
    const { chat } = await streamWith([first, wire.slice(wire.indexOf('data', 1))]);
    expect(await drain(chat.send('hi'))).toEqual(events);
  });

  it('takes the type from the event name when the payload has none', async () => {
    const { chat } = await streamWith([
      'event: message.start\ndata: {"role":"assistant","messageId":"m1"}\n\n',
      wire.slice(wire.indexOf('data', 1)),
    ]);
    expect((await drain(chat.send('hi')))[0]).toEqual(events[0]);
  });

  it('passes on unknown event names and extra fields', async () => {
    const { chat, onDiagnostic } = await streamWith([
      frame({ type: 'message.start', role: 'assistant', messageId: 'm1', futureField: 1 }),
      frame({ type: 'widget.new', anything: true }),
      wire.slice(wire.indexOf('data', 1)),
    ]);
    const received = await drain(chat.send('hi'));
    expect(received[0]).toEqual({ ...events[0], futureField: 1 });
    expect(received[1]).toEqual({
      type: 'widget.new',
      data: { type: 'widget.new', anything: true },
    });
    expect(isKnownChatStreamEvent(received[1]!)).toBe(false);
    expect(onDiagnostic).toHaveBeenCalledWith({ code: 'stream.unknown_event', count: 1 });
  });

  it("drops a documented event that lacks a required field, and fills a guardian's defaults", async () => {
    const { chat, onDiagnostic } = await streamWith([
      frame({ type: 'message.content', messageId: 'm1' }),
      frame({ type: 'guardian', guardianId: 'check_emergency_phrase', message: '' }),
      wire,
    ]);
    const received = await drain(chat.send('hi'));
    expect(received[0]).toEqual({
      type: 'guardian',
      guardianId: 'check_emergency_phrase',
      message: '',
      endsConversation: false,
      category: 'other',
    });
    expect(received.slice(1)).toEqual(events);
    expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
      code: 'stream.invalid_event',
      count: 1,
    });
  });

  it('reports malformed frames without their content and keeps going', async () => {
    const { chat, onDiagnostic } = await streamWith(['data: {not json secret text}\n\n', wire]);
    expect(await drain(chat.send('hi'))).toEqual(events);
    expect(onDiagnostic).toHaveBeenCalledWith({ code: 'stream.malformed_frame', count: 1 });
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('secret');
  });

  it('drops an event left unfinished when the stream ends', async () => {
    const { chat } = await streamWith([wire, 'data: {"type":"message.start"']);
    expect(await drain(chat.send('hi'))).toEqual(events);
  });

  it('never exposes consultation documents', async () => {
    const complete = {
      type: 'ai_consultation.complete',
      artifacts: { longSummary: 'art_1', shortSummary: null, soapNote: 'art_2' },
    };
    const { chat } = await streamWith([wire, frame(complete)]);
    const received = await drain(chat.send('hi'));
    expect(received.at(-1)).toEqual({ type: 'ai_consultation.complete' });
    expect(JSON.stringify(received)).not.toContain('art_');
  });

  it('cancels the network stream when the consumer stops early', async () => {
    const { chat, stream } = await streamWith(events.map((event) => frame(event as never)));
    for await (const event of chat.send('hi')) {
      expect(event.type).toBe('message.start');
      break;
    }
    expect(stream.cancelled()).toBe(true);
    expect(chat.state.streaming).toBe(false);
  });
});

describe('sending a turn', () => {
  it('never resends a turn the API refused', async () => {
    const { h, chat } = await streamWith([]);
    h.routes[STREAM] = () => json({ code: 'error.unknown' }, 503);
    await expect(drain(chat.send('hi'))).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(count(h.calls, STREAM)).toBe(1);
    expect(chat.state.unavailable).toMatchObject({ reason: 'error', code: 'error.unknown' });
  });

  it('never resends a turn whose connection failed', async () => {
    const { h, chat } = await streamWith([]);
    h.routes[STREAM] = () => Promise.reject(new TypeError('network'));
    await expect(drain(chat.send('hi'))).rejects.toBeInstanceOf(APIConnectionError);
    expect(count(h.calls, STREAM)).toBe(1);
  });

  it('shows the fallback when the connection fails or drops, but not when the caller aborts', async () => {
    const { h, chat } = await streamWith([]);
    h.routes[STREAM] = () => Promise.reject(new TypeError('network'));
    await expect(drain(chat.send('hi'))).rejects.toBeInstanceOf(APIConnectionError);
    expect(chat.state.unavailable).toMatchObject({
      reason: 'error',
      code: 'error.client.connection',
    });

    h.routes[STREAM] = () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(frame(events[0] as never)));
          controller.error(new TypeError('dropped'));
        },
      });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    };
    await expect(drain(chat.send('hi'))).rejects.toMatchObject({
      message: 'The stream was interrupted.',
    });
    expect(chat.state.unavailable).toMatchObject({
      reason: 'error',
      code: 'error.client.connection',
    });

    h.routes[STREAM] = () => sse(events.map((event) => frame(event as never))).response;
    await drain(chat.send('hi'));
    expect(chat.state.unavailable).toBeNull();
    const abort = new AbortController();
    abort.abort();
    await expect(drain(chat.send('hi', { signal: abort.signal }))).rejects.toMatchObject({
      name: 'APIUserAbortError',
    });
    expect(chat.state.unavailable).toBeNull();
  });

  it('reports a stream cut off mid-reply, without resending it', async () => {
    const { h, chat } = await streamWith([frame(events[0] as never), frame(events[1] as never)]);
    await expect(drain(chat.send('hi'))).rejects.toBeInstanceOf(StreamInterruptedError);
    expect(chat.state.unavailable).toMatchObject({
      reason: 'error',
      code: 'error.client.stream_interrupted',
    });
    expect(count(h.calls, STREAM)).toBe(1);
  });

  it('reports a stream that closes without any events', async () => {
    const { chat } = await streamWith([]);
    await expect(drain(chat.send('hi'))).rejects.toBeInstanceOf(StreamInterruptedError);
  });

  it('reports a stream that sends back only the visitor message', async () => {
    const { chat } = await streamWith([
      frame({ type: 'message.start', role: 'user', messageId: 'u1' }),
      frame({ type: 'message.stop', messageId: 'u1' }),
    ]);
    await expect(drain(chat.send('hi'))).rejects.toBeInstanceOf(StreamInterruptedError);
  });

  it('counts a turn that only ends the conversation as answered', async () => {
    const { chat } = await streamWith([frame({ type: 'conversation.end' })]);
    await expect(drain(chat.send('bye'))).resolves.toHaveLength(1);
    expect(chat.state.unavailable).toBeNull();
  });

  it('gives up on a stream that stalls, so the input does not stay locked', async () => {
    const h = harness();
    h.routes[STREAM] = (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(frame(events[0] as never)));
          init.signal!.addEventListener('abort', () =>
            controller.error(new DOMException('', 'AbortError')),
          );
        },
      });
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    };
    const client = await h.started({ streamTimeoutMs: 50 });
    const chat = await client.createChat();
    await expect(drain(chat.send('hi'))).rejects.toBeInstanceOf(APITimeoutError);
    expect(chat.state.streaming).toBe(false);
  });

  it('keeps a timeout a timeout when frames are still buffered', async () => {
    const h = harness();
    h.routes[STREAM] = () => sse([wire]).response;
    const client = await h.started({ streamTimeoutMs: 30 });
    const chat = await client.createChat();
    const send = chat.send('hi');
    await send.next();
    await new Promise((resolve) => setTimeout(resolve, 60)); // The deadline passes mid-turn.
    await expect(drain(send)).rejects.toBeInstanceOf(APITimeoutError);
    expect(chat.state.unavailable).toMatchObject({ reason: 'error', code: 'error.client.timeout' });
  });

  it("refuses a response that isn't an event stream", async () => {
    const { h, chat } = await streamWith([]);
    h.routes[STREAM] = () =>
      new Response('<html>proxy</html>', { headers: { 'Content-Type': 'text/html' } });
    await expect(drain(chat.send('hi'))).rejects.toMatchObject({
      code: 'error.client.invalid_response',
    });
  });

  it('sends the turn with the session token and the timezone, and nothing else', async () => {
    const h = harness();
    h.routes[STREAM] = () => sse([wire]).response;
    const client = await h.started({ timezone: 'America/Chicago' });
    const chat = await client.createChat();
    await drain(chat.send('hello'));
    const init = h.inits.at(-1)!;
    expect(JSON.parse(init.body as string)).toEqual({
      userEvent: { type: 'user_message', userInput: 'hello' },
      timezone: 'America/Chicago',
    });
    expect(init.headers).toEqual({
      Accept: 'text/event-stream',
      Authorization: 'Bearer tok_1',
      'Content-Type': 'application/json',
    });
  });
});
