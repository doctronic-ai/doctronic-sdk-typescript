import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const script = new URL('../scripts/release-notes.mjs', import.meta.url).pathname;
const notes = (...args: string[]) =>
  execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' });

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
    expect(() => notes('9.9.9')).toThrow(/CHANGELOG\.md has no "## 9\.9\.9" entry/);
  });

  it('reads the root CHANGELOG.md when no path is given', () => {
    expect(notes('0.1.0', 'CHANGELOG.md')).toBe(notes('0.1.0'));
  });

  describe('with another CHANGELOG', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-notes-'));
    const changelog = join(dir, 'CHANGELOG.md');
    writeFileSync(
      changelog,
      [
        '# Changelog',
        '',
        '## 0.2.0-beta.1',
        '',
        'A prerelease.',
        '',
        '## 0.1.0 (2026-01-01)',
        '',
        'The first version.',
        '',
        '### Added',
        '',
        '- A client.',
        '',
        '## 0.0.1',
        '',
      ].join('\n'),
    );
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('prints the notes from that file, up to the next entry', () => {
      expect(notes('0.1.0', changelog)).toBe('The first version.\n\n### Added\n\n- A client.\n');
    });

    it('reads a prerelease entry', () => {
      expect(notes('0.2.0-beta.1', changelog)).toBe('A prerelease.\n');
    });

    it('names that file when the version has no entry', () => {
      expect(() => notes('9.9.9', changelog)).toThrow(`${changelog} has no "## 9.9.9" entry`);
    });

    it('fails for an entry with no notes', () => {
      expect(() => notes('0.0.1', changelog)).toThrow(/"## 0\.0\.1" entry with no notes/);
    });
  });
});
