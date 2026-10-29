// A scripted local HTTP server. Each request takes the next queued handler, so a test lists the
// responses it wants in order and then asserts on what the client sent.

import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import { Doctronic, type ClientOptions } from '../../src/index.js';

export const TEST_TOKEN = 'test-token-not-a-real-credential';

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: IncomingHttpHeaders;
  body: string;
  receivedAt: number;
  /** Resolves when the client closes the connection. */
  closed: Promise<void>;
}

export type Handler = (request: RecordedRequest, res: ServerResponse) => void | Promise<void>;

export interface MockServer {
  url: string;
  requests: RecordedRequest[];
  enqueue(...handlers: Handler[]): void;
  client(options?: ClientOptions): Doctronic;
  close(): Promise<void>;
}

export async function startMockServer(): Promise<MockServer> {
  const requests: RecordedRequest[] = [];
  const queue: Handler[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const recorded: RecordedRequest = {
        method: req.method ?? '',
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        receivedAt: Date.now(),
        closed: new Promise((resolve) => res.once('close', () => resolve())),
      };
      requests.push(recorded);
      const handler = queue.shift();
      if (!handler) {
        res.writeHead(599, { 'content-type': 'text/plain' }).end('No handler queued');
        return;
      }
      await handler(recorded, res);
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    requests,
    enqueue: (...handlers) => queue.push(...handlers),
    client: (options = {}) => new Doctronic({ apiToken: TEST_TOKEN, baseUrl: url, ...options }),
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

const REQUEST_ID = 'req_01TESTREQUESTID';

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Handler {
  return (_request, res) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'x-request-id': REQUEST_ID,
      ...headers,
    });
    res.end(JSON.stringify(body));
  };
}

/** A success envelope around `data`. */
export function ok(data: unknown, status = 200, headers: Record<string, string> = {}): Handler {
  return json(status, { code: 'success', message: 'Request successful', data }, headers);
}

export function apiError(
  status: number,
  code: string | undefined,
  message?: string,
  options: { data?: unknown; headers?: Record<string, string> } = {},
): Handler {
  const body: Record<string, unknown> = {};
  if (code !== undefined) body.code = code;
  if (message !== undefined) body.message = message;
  if (options.data !== undefined) body.data = options.data;
  return json(status, body, options.headers);
}

/** Answers with a status and no body. */
export function empty(status: number, headers: Record<string, string> = {}): Handler {
  return (_request, res) => {
    res.writeHead(status, { 'x-request-id': REQUEST_ID, ...headers });
    res.end();
  };
}

/** Drops the connection before any response, like a network failure. */
export function dropConnection(): Handler {
  return (_request, res) => {
    res.socket?.destroy();
  };
}

/** Sends a status and headers, then cuts the connection partway through the body. */
export function truncatedBody(status: number, headers: Record<string, string> = {}): Handler {
  return (_request, res) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': '200',
      'x-request-id': REQUEST_ID,
      ...headers,
    });
    res.write('{"code":"error.');
    setTimeout(() => res.socket?.destroy(), 10);
  };
}

/** Waits before running `handler`. */
export function delayed(ms: number, handler: Handler): Handler {
  return async (request, res) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    if (!res.destroyed) await handler(request, res);
  };
}

/** Writes an SSE body in the given chunks, pausing `gapMs` between them. */
export function sse(chunks: string[], options: { gapMs?: number; end?: boolean } = {}): Handler {
  const { gapMs = 0, end = true } = options;
  return async (_request, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-request-id': REQUEST_ID,
    });
    res.flushHeaders();
    for (const chunk of chunks) {
      if (gapMs) await new Promise((resolve) => setTimeout(resolve, gapMs));
      if (res.destroyed) return;
      res.write(chunk);
    }
    if (end) res.end();
  };
}

export { REQUEST_ID };
