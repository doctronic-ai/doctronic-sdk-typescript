import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  browserContract,
  describeOperations,
  EMBED_SESSION_SCHEME,
  loadContract,
  PINNED_CONTRACT,
  sdkContract,
  type Contract,
} from '../scripts/contract.mjs';

const script = new URL('../scripts/report-operations.mjs', import.meta.url).pathname;

let dir: string;
let pinned: Contract;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'report-operations-'));
  pinned = await loadContract(PINNED_CONTRACT);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function report(before: Contract, after: Contract): string {
  const beforePath = join(dir, 'before.json');
  const afterPath = join(dir, 'after.json');
  writeFileSync(beforePath, JSON.stringify(before));
  writeFileSync(afterPath, JSON.stringify(after));
  return execFileSync(process.execPath, [script, beforePath, afterPath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

// The text of one package's section, from its heading to the next package's.
const section = (text: string, title: string) =>
  text.split(/^### /m).find((part) => part.startsWith(title)) ?? '';

describe('scripts/report-operations.mjs', () => {
  it('reports each package, unchanged, for the same contract', () => {
    const text = report(pinned, pinned);
    for (const title of ['Server SDK', 'Browser package']) {
      expect(section(text, title)).toMatch(/None were added or removed/);
    }
    expect(section(text, 'Browser package')).toMatch(
      /packages\/browser\/src\/generated\/schema\.ts/,
    );
  });

  it('reports a change to a browser-only operation under the browser package', () => {
    const server = new Set(describeOperations(sdkContract(pinned).contract).map((op) => op.key));
    const browserOnly = describeOperations(browserContract(pinned).contract, 'browser').find(
      (op) => !server.has(op.key),
    );
    expect(browserOnly).toBeDefined();
    const { method, path, key } = browserOnly!;

    const after = structuredClone(pinned) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    after.paths[path]![method.toLowerCase()]!.responses['418'] = { description: 'Teapot.' };

    const text = report(pinned, after);
    expect(section(text, 'Server SDK')).toMatch(/None were added or removed/);
    const browser = section(text, 'Browser package');
    expect(browser).toMatch(/Operations whose runtime facts changed/);
    expect(browser).toContain(`\`${key}\`: \`statuses\``);
  });

  it('counts every browser operation as new when the previous contract had no embed scheme', () => {
    const before = structuredClone(pinned) as {
      components: { securitySchemes: Record<string, unknown> };
    };
    delete before.components.securitySchemes[EMBED_SESSION_SCHEME];

    const browser = section(report(before, pinned), 'Browser package');
    expect(browser).toMatch(/#### New operations/);
    expect(browser).toMatch(/\(0 before\)/);
    expect(browser).not.toMatch(/resource method/);
  });

  it("says the browser package can't be generated when the new contract has no embed scheme", () => {
    const after = structuredClone(pinned) as {
      components: { securitySchemes: Record<string, unknown> };
    };
    delete after.components.securitySchemes[EMBED_SESSION_SCHEME];

    const text = report(pinned, after);
    expect(section(text, 'Browser package')).toMatch(/can't be generated/);
    expect(section(text, 'Server SDK')).toMatch(/It covers \d+ operations/);
  });
});
