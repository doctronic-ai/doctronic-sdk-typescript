import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const script = new URL('../scripts/release-notes.mjs', import.meta.url).pathname;
const notes = (version: string) =>
  execFileSync(process.execPath, [script, version], { encoding: 'utf8', stdio: 'pipe' });

describe('scripts/release-notes.mjs', () => {
  it("prints the package version's notes, without the heading or the next entry", () => {
    const { version } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const text = notes(version);
    expect(text.trim()).not.toBe('');
    expect(text).not.toMatch(/^## /m);
  });

  it('reads an entry whose heading has a date', () => {
    expect(notes('0.1.0')).toMatch(/^First version of `@doctronic-ai\/sdk`/);
  });

  it('fails for a version without an entry', () => {
    expect(() => notes('9.9.9')).toThrow(/no "## 9\.9\.9" entry/);
  });
});
