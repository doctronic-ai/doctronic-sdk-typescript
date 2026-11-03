// A mock `fetch` for the client, routed by `METHOD /path/`. Synthetic data only.

import { vi } from 'vitest';

import {
  DoctronicBrowser,
  type ChatStreamEvent,
  type DeploymentConfig,
  type DoctronicBrowserOptions,
} from '../src/index.js';

export const BASE = 'https://api.test/api/v1';

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export const CONFIG: DeploymentConfig = {
  deploymentId: 'dep_test',
  partnerId: 'partner_test',
  configVersion: '1',
  allowedOrigins: [],
  theme: { primaryColor: '#000000', secondaryColor: '#ffffff', headlineFont: 'A', bodyFont: 'B' },
  content: { title: 't', body: 'b', inputPlaceholder: 'p', starterPrompts: [] },
  intake: {
    minAge: 18,
    state: { mode: 'selection', states: ['AL'], ineligibleMessage: 'no' },
    roles: null,
    ineligibleMessage: 'no',
  },
  offramps: [
    {
      kind: 'specialist',
      label: 'Book',
      showWhen: {
        ctaWidgets: ['cta_doctor_visit_widget'],
        onConversationEnd: false,
        afterAssistantReplies: 3,
      },
    },
    {
      kind: 'survey',
      label: 'Survey',
      showWhen: { ctaWidgets: [], onConversationEnd: true, afterAssistantReplies: null },
    },
  ],
  rating: null,
  hiddenArtifacts: ['soap_note'],
  hideSoapNote: true,
  paused: false,
};

export const RATING = {
  scale: 'helpful_0_5',
  min: 0,
  max: 5,
  question: 'How helpful?',
  minLabel: 'Not',
  maxLabel: 'Very',
  messagePrompt: 'Tell us more',
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(status < 400 ? { code: 'success', data: body } : body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function sessionBody(token = 'tok_1', expiresIn = 900, refreshIn = 600) {
  return {
    token,
    expiresAt: nowSeconds() + expiresIn,
    refreshAfter: nowSeconds() + refreshIn,
    expiresInSeconds: expiresIn,
    refreshInSeconds: refreshIn,
    configVersion: '1',
  };
}

/** An event-stream response that sends `chunks` (strings or raw bytes), one per read. */
export function sse(chunks: (string | Uint8Array)[]): {
  response: Response;
  cancelled: () => boolean;
} {
  let cancelled = false;
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[i++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
  return { response, cancelled: () => cancelled };
}

/** One SSE frame. On the wire, fields the contract defaults may be missing. */
export const frame = (event: Record<string, unknown> & { type: string }): string =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

export function reply(id: string, extra: (Record<string, unknown> & { type: string })[] = []) {
  return [
    frame({ type: 'message.start', role: 'assistant', messageId: id }),
    frame({ type: 'message.content', messageId: id, content: 'ok' }),
    frame({ type: 'message.stop', messageId: id }),
    ...extra.map(frame),
  ];
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

export interface Harness {
  routes: Record<string, Handler>;
  calls: string[];
  inits: RequestInit[];
  fetch: typeof fetch;
  client(options?: Partial<DoctronicBrowserOptions>): DoctronicBrowser;
  started(options?: Partial<DoctronicBrowserOptions>): Promise<DoctronicBrowser>;
}

export function harness(): Harness {
  const calls: string[] = [];
  const inits: RequestInit[] = [];
  const routes: Record<string, Handler> = {
    'GET /embed/config/': () => json(CONFIG),
    'POST /embed/sessions/': () => json(sessionBody(), 201),
    'POST /chats/': () => json({ id: 'chat_1', createdAt: '2026-01-01T00:00:00Z' }, 201),
  };
  const fetchMock = vi.fn((input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const key = `${init.method ?? 'GET'} ${url.pathname.replace('/api/v1', '')}`;
    calls.push(key);
    inits.push(init);
    if (init.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const route = Object.entries(routes).find(
      ([pattern]) =>
        key === pattern || (pattern.endsWith('*') && key.startsWith(pattern.slice(0, -1))),
    );
    if (!route) return Promise.reject(new Error(`unrouted ${key}`));
    return Promise.resolve(route[1](url, init));
  });
  const make = (options: Partial<DoctronicBrowserOptions> = {}) =>
    new DoctronicBrowser({
      publishableKey: 'pk_test',
      baseUrl: BASE,
      fetch: fetchMock,
      ...options,
    });
  return {
    routes,
    calls,
    inits,
    fetch: fetchMock,
    client: make,
    async started(options) {
      const client = make(options);
      await client.startSession({
        intake: { age: 40, sex: 'female', state: 'AL' },
        termsAccepted: true,
      });
      return client;
    },
  };
}

export async function drain(iterable: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

/** Lets promise callbacks (such as off-ramp links) run. */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export const count = (calls: string[], key: string): number =>
  calls.filter((call) => call === key).length;

/** A stand-in for `document`, enough for the client's visibility listener. */
export function fakeDocument() {
  const target = new EventTarget() as EventTarget & { visibilityState: string; cookie: string };
  target.visibilityState = 'visible';
  return {
    document: target,
    show: (): void => {
      target.visibilityState = 'visible';
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
}
