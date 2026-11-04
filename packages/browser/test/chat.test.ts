import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorCode, type ChatState, type DoctronicBrowserOptions } from '../src/index.js';
import {
  CONFIG,
  RATING,
  count,
  drain,
  frame,
  harness,
  json,
  reply,
  sessionBody,
  settle,
  sse,
} from './helpers.js';

const STREAM = 'POST /chats/chat_1/stream/';
const OFFRAMPS = 'GET /embed/chats/chat_1/offramps/*';

afterEach(() => {
  vi.useRealTimers();
});

type Wire = string[];

async function chatWith(
  replies: Wire[],
  {
    config = CONFIG,
    options = {},
  }: { config?: object; options?: Partial<DoctronicBrowserOptions> } = {},
) {
  const h = harness();
  let turn = 0;
  const streams: ReturnType<typeof sse>[] = [];
  h.routes['GET /embed/config/'] = () => json(config);
  h.routes[STREAM] = () => {
    const stream = sse(replies[turn++] ?? []);
    streams.push(stream);
    return stream.response;
  };
  h.routes[OFFRAMPS] = (url) => {
    const kind = url.pathname.split('/').at(-2)!;
    return json({ kind, label: kind, url: `https://dest.test/${kind}?ref=r_x` });
  };
  const client = await h.started(options);
  const chat = await client.createChat();
  return { h, client, chat, streams };
}

describe('turns', () => {
  it('refuses overlapping sends', async () => {
    const { chat } = await chatWith([reply('m1'), reply('m2')]);
    const first = chat.send('one');
    await first.next();
    await expect(chat.send('two').next()).rejects.toMatchObject({ code: ErrorCode.chatBusy });
    await drain(first);
    await expect(drain(chat.send('two'))).resolves.toHaveLength(3);
  });

  it('waits for a rate limit sent as the first event, and resends nothing', async () => {
    const { h, chat } = await chatWith([
      [
        frame({
          type: 'error',
          errorCode: 'error.rate_limited',
          message: 'wait',
          retryAfterSeconds: 30,
        }),
      ],
      reply('m1'),
    ]);
    const before = Date.now();
    await drain(chat.send('hi'));
    expect(chat.state.unavailable).toMatchObject({
      reason: 'rate_limited',
      code: 'error.rate_limited',
    });
    expect(chat.state.unavailable!.retryAtMs! - before).toBeGreaterThanOrEqual(30_000);
    expect(count(h.calls, STREAM)).toBe(1);
    await drain(chat.send('hi'));
    expect(chat.state.unavailable).toBeNull();
  });

  it('says the chat is paused when an open stream ends as paused, with no retry', async () => {
    const { h, chat } = await chatWith([
      [
        ...reply('m1').slice(0, 2),
        frame({ type: 'error', errorCode: ErrorCode.paused, message: 'paused' }),
      ],
    ]);
    await drain(chat.send('hi'));
    expect(chat.state.unavailable).toEqual({
      reason: 'paused',
      code: ErrorCode.paused,
      retryAtMs: null,
    });
    expect(count(h.calls, STREAM)).toBe(1);
  });

  it('says the chat is paused when the turn is refused as paused', async () => {
    const { h, chat, client } = await chatWith([]);
    h.routes[STREAM] = () => json({ code: ErrorCode.paused, message: 'paused' }, 503);
    await expect(drain(chat.send('hi'))).rejects.toMatchObject({ code: ErrorCode.paused });
    expect(chat.state.unavailable).toMatchObject({ reason: 'paused' });
    expect(client.sessionStatus).toBe('active');
  });

  it('ends the chat when its session expires, and refuses to send', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { h, chat } = await chatWith([reply('m1')]);
    vi.setSystemTime(Date.now() + 901_000);
    await expect(chat.send('hi').next()).rejects.toMatchObject({ code: ErrorCode.chatEnded });
    expect(chat.state.ended).toEqual({ reason: 'session_ended', cause: 'expired' });
    expect(h.calls).not.toContain(STREAM);
  });
});

describe('a replaced session', () => {
  it('stops a turn still streaming when a new session replaces its own', async () => {
    const { h, client, chat, streams } = await chatWith([
      reply('m1', [{ type: 'conversation.end' }]),
    ]);
    const send = chat.send('hi');
    const first = await send.next();
    expect(first.value).toMatchObject({ type: 'message.start' });
    h.routes['POST /embed/sessions/'] = () => json(sessionBody('tok_new'), 201);
    await client.startSession({
      intake: { age: 40, sex: 'female', state: 'AL' },
      termsAccepted: true,
    });
    expect(await send.next()).toEqual({ done: true, value: undefined });
    expect(streams[0]!.cancelled()).toBe(true);
    expect(chat.state).toMatchObject({
      streaming: false,
      ended: { reason: 'session_ended', cause: 'replaced' },
    });
  });

  it('closes a turn that was still opening when a new session replaced its own', async () => {
    const { h, client, chat, streams } = await chatWith([reply('m1')]);
    let respond!: () => void;
    const stream = h.routes['POST /chats/chat_1/stream/']!;
    h.routes['POST /chats/chat_1/stream/'] = (url, init) =>
      new Promise((resolve) => {
        respond = () => resolve(stream(url, init));
      });
    const send = drain(chat.send('hi'));
    await settle();
    h.routes['POST /embed/sessions/'] = () => json(sessionBody('tok_new'), 201);
    await client.startSession({
      intake: { age: 40, sex: 'female', state: 'AL' },
      termsAccepted: true,
    });
    respond();
    expect(await send).toEqual([]);
    expect(streams[0]!.cancelled()).toBe(true);
    expect(chat.state.streaming).toBe(false);
  });

  it("refuses to rate a chat whose session was replaced, without sending the new session's token", async () => {
    const { h, client, chat } = await chatWith([[frame({ type: 'conversation.end' })]], {
      config: { ...CONFIG, offramps: [], rating: RATING },
    });
    await drain(chat.send('bye'));
    h.routes['POST /embed/sessions/'] = () => json(sessionBody('tok_new'), 201);
    await client.startSession({
      intake: { age: 40, sex: 'female', state: 'AL' },
      termsAccepted: true,
    });
    await expect(chat.rate(4)).rejects.toMatchObject({ code: ErrorCode.chatEnded });
    await expect(chat.rateMessage('hi')).rejects.toMatchObject({ code: ErrorCode.chatEnded });
    expect(h.calls.filter((call) => call.includes('/rating/'))).toEqual([]);
  });
});

describe('off-ramps', () => {
  it('shows the specialist off-ramp on the doctor-visit CTA', async () => {
    const { chat } = await chatWith([
      reply('m1', [
        { type: 'skill_code.cta', skillCode: '101', widget: 'cta_doctor_visit_widget' },
      ]),
    ]);
    await drain(chat.send('hi'));
    await settle();
    expect(chat.state.offramps.map((o) => o.kind)).toEqual(['specialist']);
    expect(chat.state.offramps[0]!.url).toContain('ref=r_x');
  });

  it('shows the specialist off-ramp after the configured number of replies', async () => {
    const { chat } = await chatWith([reply('m1'), reply('m2'), reply('m3')]);
    await drain(chat.send('1'));
    await drain(chat.send('2'));
    await settle();
    expect(chat.state.offramps).toEqual([]);
    await drain(chat.send('3'));
    await settle();
    expect(chat.state.offramps.map((o) => o.kind)).toEqual(['specialist']);
  });

  it('ends the chat and shows the survey on conversation end; further sends are refused', async () => {
    const { chat } = await chatWith([
      reply('m1', [{ type: 'conversation.end', reason: 'completed' }]),
    ]);
    await drain(chat.send('hi'));
    await settle();
    expect(chat.state.ended).toEqual({ reason: 'ended' });
    expect(chat.state.offramps.map((o) => o.kind)).toEqual(['survey']);
    await expect(chat.send('again').next()).rejects.toMatchObject({ code: ErrorCode.chatEnded });
  });

  it('ignores a link that arrives after the chat moved on to a new session', async () => {
    const { h, client, chat } = await chatWith([reply('m1', [{ type: 'conversation.end' }])]);
    let release!: () => void;
    h.routes[OFFRAMPS] = () =>
      new Promise((resolve) => {
        release = () =>
          resolve(json({ kind: 'survey', label: 'Survey', url: 'https://dest.test/s' }));
      });
    await drain(chat.send('bye'));
    await client.startSession({
      intake: { age: 40, sex: 'female', state: 'AL' },
      termsAccepted: true,
    });
    release();
    await settle();
    expect(chat.state.offramps).toEqual([]);
    expect(chat.state.ended).toEqual({ reason: 'ended' });
  });

  it('tries a failed link a bounded number of times, waiting between attempts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const onDiagnostic = vi.fn();
    const { h, chat } = await chatWith([reply('m1', [{ type: 'conversation.end' }])], {
      options: { onDiagnostic },
    });
    h.routes[OFFRAMPS] = () => json({ code: 'error.unknown' }, 503);
    await drain(chat.send('bye'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(count(h.calls, 'GET /embed/chats/chat_1/offramps/survey/')).toBe(3);
    expect(onDiagnostic).toHaveBeenLastCalledWith({ code: 'offramp.link_failed', count: 3 });
    expect(chat.state.offramps).toEqual([]);
  });

  it('fetches no new link and asks no rating once the session has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { h, chat } = await chatWith([reply('m1', [{ type: 'conversation.end' }])], {
      config: { ...CONFIG, rating: RATING },
    });
    const send = chat.send('bye');
    await send.next();
    vi.setSystemTime(Date.now() + 901_000); // The tab slept: no timer ran.
    await expect(drain(send)).resolves.toHaveLength(3);
    await settle();
    expect(chat.state).toMatchObject({
      ended: { reason: 'session_ended', cause: 'expired' },
      ratingDue: false,
      offramps: [],
    });
    expect(h.calls.filter((call) => call.startsWith('GET /embed/chats/'))).toEqual([]);
  });
});

describe('safety', () => {
  it('locks on a conversation-ending guardian, shows no off-ramps and asks no rating', async () => {
    const { chat } = await chatWith(
      [
        [
          frame({
            type: 'guardian',
            guardianId: 'emergency_crushing_chest_pain',
            message: '',
            text: 'Call 911',
            endsConversation: true,
            category: 'emergency',
          }),
          frame({ type: 'conversation.end', reason: 'guardian_blocked' }),
        ],
      ],
      { config: { ...CONFIG, rating: RATING } },
    );
    const ended: ChatState['ended'][] = [];
    chat.subscribe((state) => ended.push(state.ended));
    await drain(chat.send('my chest hurts'));
    await settle();
    expect(chat.state.ended).toEqual({
      reason: 'safety',
      guardianId: 'emergency_crushing_chest_pain',
      category: 'emergency',
      message: '',
      text: 'Call 911',
    });
    expect(chat.state).toMatchObject({ offramps: [], ratingDue: false });
    expect(ended.at(-1)).toMatchObject({ reason: 'safety' });
    await expect(chat.rate(5)).rejects.toMatchObject({ code: ErrorCode.chatEnded });
  });

  it('stops sending at a guardian end, but reads the stream to its end', async () => {
    const { chat, streams } = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'emergency_stroke',
          message: '',
          endsConversation: true,
          category: 'emergency',
        }),
        ...reply('m1'),
        frame({ type: 'conversation.end' }),
      ],
    ]);
    const types: string[] = [];
    for await (const event of chat.send('my face is drooping')) {
      types.push(event.type);
      if (event.type === 'guardian') {
        await expect(chat.send('more').next()).rejects.toMatchObject({ code: ErrorCode.chatEnded });
      }
    }
    expect(types).toEqual([
      'guardian',
      'message.start',
      'message.content',
      'message.stop',
      'conversation.end',
    ]);
    expect(streams[0]!.cancelled()).toBe(false);
  });

  it('keeps reading in the background when the consumer stops after a guardian end', async () => {
    const { chat, streams } = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'emergency_stroke',
          message: '',
          endsConversation: true,
          category: 'emergency',
        }),
        ...reply('m1'),
        frame({ type: 'conversation.end' }),
      ],
    ]);
    for await (const event of chat.send('my face is drooping')) {
      expect(event.type).toBe('guardian');
      break;
    }
    await settle();
    expect(streams[0]!.cancelled()).toBe(false);
    expect(chat.state.streaming).toBe(false);
  });

  it('locks the chat for any category when the guardian ends it, feedback included', async () => {
    const { chat } = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'agent_feedback_negative',
          message: '',
          endsConversation: true,
          category: 'feedback',
        }),
      ],
    ]);
    await drain(chat.send('this is useless'));
    expect(chat.state.ended).toMatchObject({ reason: 'safety', category: 'feedback' });
  });

  it('still locks the chat for an ending guardian that lacks its other fields', async () => {
    const { chat } = await chatWith([[frame({ type: 'guardian', endsConversation: true })]]);
    await drain(chat.send('hi'));
    expect(chat.state.ended).toMatchObject({ reason: 'safety' });
  });

  it('does not lock or warn on a feedback guardian', async () => {
    const { chat } = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'agent_feedback_positive',
          message: '',
          category: 'feedback',
        }),
        ...reply('m1'),
      ],
    ]);
    await drain(chat.send('thanks'));
    expect(chat.state.ended).toBeNull();
    expect(chat.state.notice).toBeNull();
  });

  it('raises a dismissable notice for a guardian that does not end the chat, unknown categories as other', async () => {
    const { chat } = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'check_emergency_phrase',
          message: '',
          category: 'emergency',
        }),
        ...reply('m1'),
      ],
      [
        frame({
          type: 'guardian',
          guardianId: 'uncommon_message',
          message: 'internal',
          category: 'brand_new',
        }),
        ...reply('m2'),
      ],
    ]);
    await drain(chat.send('I am having a heart attack'));
    expect(chat.state.notice).toEqual({
      guardianId: 'check_emergency_phrase',
      category: 'emergency',
      message: '',
    });
    expect(chat.state.ended).toBeNull();
    chat.dismissNotice();
    expect(chat.state.notice).toBeNull();
    await drain(chat.send('ok'));
    expect(chat.state.notice).toEqual({
      guardianId: 'uncommon_message',
      category: 'other',
      message: '',
    });
  });

  it("never surfaces an emergency guardian's internal label, in the state or the events", async () => {
    const label = '\u{1F6E1}️ Guardian stopped';
    const { chat } = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'check_emergency_phrase',
          message: label,
          category: 'emergency',
        }),
        ...reply('m1'),
      ],
      [
        frame({
          type: 'guardian',
          guardianId: 'emergency_crushing_chest_pain',
          message: label,
          endsConversation: true,
          category: 'emergency',
        }),
        frame({ type: 'conversation.end', reason: 'guardian_blocked' }),
      ],
    ]);
    const first = await drain(chat.send('I am having a heart attack'));
    expect(chat.state.notice).toEqual({
      guardianId: 'check_emergency_phrase',
      category: 'emergency',
      message: '',
    });
    const second = await drain(chat.send('my chest hurts'));
    expect(chat.state.ended).toEqual({
      reason: 'safety',
      guardianId: 'emergency_crushing_chest_pain',
      category: 'emergency',
      message: '',
    });
    expect(JSON.stringify([first, second, chat.state])).not.toContain('Guardian stopped');
  });

  it('updates the notice for a repeated guardian, keeping copy the repeat leaves empty', async () => {
    const copy = { title: 'Get help now', text: 'Call **911**.' };
    const { chat } = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'check_emergency_phrase',
          message: '',
          category: 'emergency',
        }),
        frame({
          type: 'guardian',
          guardianId: 'check_emergency_phrase',
          message: '',
          category: 'emergency',
          ...copy,
        }),
        frame({
          type: 'guardian',
          guardianId: 'check_emergency_phrase',
          message: '',
          category: 'emergency',
          title: null,
          text: ' ',
        }),
        ...reply('m1'),
      ],
    ]);
    const notices: unknown[] = [];
    chat.subscribe((state) => {
      if (state.notice && state.notice !== notices.at(-1)) notices.push(state.notice);
    });
    await drain(chat.send('I am having a heart attack'));
    const base = { guardianId: 'check_emergency_phrase', category: 'emergency', message: '' };
    expect(notices).toEqual([base, { ...base, ...copy }, { ...base, ...copy }]);
  });

  it("keeps a safety guardian's message, and the notice's copy when the same guardian ends the chat", async () => {
    const safety = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'check_input_language',
          message: 'Please write in English.',
          endsConversation: true,
          category: 'safety',
        }),
      ],
    ]);
    await drain(safety.chat.send('hola'));
    expect(safety.chat.state.ended).toEqual({
      reason: 'safety',
      guardianId: 'check_input_language',
      category: 'safety',
      message: 'Please write in English.',
    });

    const emergency = await chatWith([
      [
        frame({
          type: 'guardian',
          guardianId: 'check_emergency_phrase',
          message: '',
          category: 'emergency',
          title: 'Get help now',
        }),
        frame({
          type: 'guardian',
          guardianId: 'check_emergency_phrase',
          message: '',
          category: 'emergency',
          endsConversation: true,
        }),
      ],
    ]);
    await drain(emergency.chat.send('I am having a heart attack'));
    expect(emergency.chat.state.ended).toEqual({
      reason: 'safety',
      guardianId: 'check_emergency_phrase',
      category: 'emergency',
      message: '',
      title: 'Get help now',
    });
  });

  it('withdraws off-ramps already shown when a guardian ends the chat', async () => {
    const { chat } = await chatWith([
      reply('m1', [
        { type: 'skill_code.cta', skillCode: '101', widget: 'cta_doctor_visit_widget' },
      ]),
      [
        frame({
          type: 'guardian',
          guardianId: 'emergency_stroke',
          message: '',
          endsConversation: true,
          category: 'emergency',
        }),
      ],
    ]);
    await drain(chat.send('hi'));
    await settle();
    expect(chat.state.offramps.map((o) => o.kind)).toEqual(['specialist']);
    await drain(chat.send('my face is drooping'));
    expect(chat.state.offramps).toEqual([]);
  });

  it('shows no off-ramp link that arrives after a safety end', async () => {
    const { h, chat } = await chatWith([
      [
        ...reply('m1', [
          { type: 'skill_code.cta', skillCode: '101', widget: 'cta_doctor_visit_widget' },
        ]),
        frame({
          type: 'guardian',
          guardianId: 'emergency_stroke',
          message: '',
          endsConversation: true,
          category: 'emergency',
        }),
      ],
    ]);
    let release!: () => void;
    h.routes[OFFRAMPS] = () =>
      new Promise((resolve) => {
        release = () =>
          resolve(json({ kind: 'specialist', label: 'Book', url: 'https://dest.test/b' }));
      });
    await drain(chat.send('hi'));
    release();
    await settle();
    expect(chat.state.offramps).toEqual([]);
  });
});

describe('ratings', () => {
  it('asks for the rating when the chat ends, and records the answer and comment', async () => {
    const { h, chat } = await chatWith([[frame({ type: 'conversation.end' })]], {
      config: { ...CONFIG, offramps: [], rating: RATING },
    });
    const sent: string[] = [];
    h.routes['POST /embed/chats/chat_1/rating/'] = (_url, init) => {
      sent.push(`POST ${init.body as string}`);
      return json({ score: 4, scale: RATING.scale });
    };
    h.routes['PATCH /embed/chats/chat_1/rating/'] = (_url, init) => {
      sent.push(`PATCH ${init.body as string}`);
      return json({ score: 4, scale: RATING.scale });
    };
    expect(chat.state.ratingDue).toBe(false);
    await drain(chat.send('bye'));
    expect(chat.state.ratingDue).toBe(true);
    await chat.rate(4);
    await chat.rateMessage('Clear answers');
    expect(chat.state).toMatchObject({
      ratingDue: false,
      rating: { score: 4, scale: RATING.scale },
    });
    expect(sent).toEqual(['POST {"score":4}', 'PATCH {"message":"Clear answers"}']);
  });

  it('asks for no rating after a safety end, or when the deployment has none', async () => {
    const safety = await chatWith(
      [
        [
          frame({
            type: 'guardian',
            guardianId: 'emergency_stroke',
            message: '',
            endsConversation: true,
            category: 'emergency',
          }),
          frame({ type: 'conversation.end' }),
        ],
      ],
      { config: { ...CONFIG, offramps: [], rating: RATING } },
    );
    await drain(safety.chat.send('my face is drooping'));
    expect(safety.chat.state).toMatchObject({ ended: { reason: 'safety' }, ratingDue: false });

    const none = await chatWith([[frame({ type: 'conversation.end' })]], {
      config: { ...CONFIG, offramps: [], rating: null },
    });
    await drain(none.chat.send('bye'));
    expect(none.chat.state).toMatchObject({ ended: { reason: 'ended' }, ratingDue: false });
  });

  it('stops asking for the rating once the session expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { h, chat, client } = await chatWith([[frame({ type: 'conversation.end' })]], {
      config: { ...CONFIG, offramps: [], rating: RATING },
    });
    h.routes['POST /embed/sessions/refresh/'] = () => json({ code: ErrorCode.sessionInvalid }, 401);
    await drain(chat.send('bye'));
    expect(chat.state.ratingDue).toBe(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(client.sessionStatus).toBe('expired');
    expect(chat.state).toMatchObject({ ratingDue: false, ended: { reason: 'ended' } });
  });
});

describe('privacy', () => {
  it('writes nothing to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const { h, chat } = await chatWith([
      [
        'data: {broken secret}\n\n',
        frame({ type: 'unknown.thing' }),
        ...reply('m1', [{ type: 'conversation.end' }]),
      ],
    ]);
    h.routes[OFFRAMPS] = () => json({ code: 'error.unknown' }, 503);
    await drain(chat.send('my private symptom'));
    await settle();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
