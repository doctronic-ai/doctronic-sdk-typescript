import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// The `on.push.tags` patterns of a workflow, read from its one-line `tags: [...]` list.
function tagPatterns(workflow: string): string[] {
  const text = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
  const lists = [...text.matchAll(/^ {4}tags: \[(.*)\]$/gm)];
  expect(lists, `${workflow} has one tags list`).toHaveLength(1);
  return lists[0]![1]!.split(',').map((pattern) => pattern.trim().replace(/^'(.*)'$/, '$1'));
}

// GitHub's filter patterns: `*` matches any characters except `/`, and `**` matches any
// characters. The patterns here use no other special characters, which the first check enforces.
function matches(pattern: string, tag: string): boolean {
  expect(pattern).toMatch(/^[\w./*-]+$/);
  const source = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((text) => text.replace(/[.]/g, '\\.'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${source}$`).test(tag);
}

const fires = (workflow: string, tag: string) =>
  tagPatterns(workflow).some((pattern) => matches(pattern, tag));

describe('release workflow tag filters', () => {
  it('runs release.yml for server SDK tags only', () => {
    expect(fires('release.yml', 'v0.2.0')).toBe(true);
    expect(fires('release.yml', 'v0.3.0-beta.1')).toBe(true);
    expect(fires('release.yml', 'browser/v0.1.0')).toBe(false);
    expect(fires('release.yml', 'browser/v0.2.0-beta.1')).toBe(false);
  });

  it('runs release-browser.yml for browser package tags only', () => {
    expect(fires('release-browser.yml', 'browser/v0.1.0')).toBe(true);
    expect(fires('release-browser.yml', 'browser/v0.2.0-beta.1')).toBe(true);
    expect(fires('release-browser.yml', 'v0.2.0')).toBe(false);
    expect(fires('release-browser.yml', 'v0.3.0-beta.1')).toBe(false);
  });
});
