// Tests talk only to the local mock server. Anything else is refused and fails the test file.

import { afterAll } from 'vitest';

const localFetch = globalThis.fetch;
const blocked: string[] = [];

globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.hostname !== '127.0.0.1') {
    blocked.push(url.origin);
    return Promise.reject(new Error(`Blocked a request to ${url.origin}: tests must stay local.`));
  }
  return localFetch(input, init);
};

afterAll(() => {
  if (blocked.length) throw new Error(`Tests tried to reach ${[...new Set(blocked)].join(', ')}`);
});
