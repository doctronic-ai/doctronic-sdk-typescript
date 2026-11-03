#!/usr/bin/env node
// Prints one version's notes from a CHANGELOG, for its GitHub Release. Fails when the version has
// no entry, or an entry with no notes, so a release workflow can check before it publishes.
//
//   node scripts/release-notes.mjs 0.1.1                                 # CHANGELOG.md
//   node scripts/release-notes.mjs 0.1.0 packages/browser/CHANGELOG.md   # another package's
//
// A relative CHANGELOG path is read from the repository root, wherever the script runs from.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [version, changelog = 'CHANGELOG.md'] = process.argv.slice(2);
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version> [changelog]');
  process.exit(2);
}

const lines = readFileSync(resolve(root, changelog), 'utf8').split('\n');
const heading = `## ${version}`;
const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
if (start === -1) {
  console.error(`::error::${changelog} has no "${heading}" entry. Add one before tagging.`);
  process.exit(1);
}
const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
const notes = lines
  .slice(start + 1, next === -1 ? lines.length : next)
  .join('\n')
  .trim();
if (!notes) {
  console.error(
    `::error::${changelog} has a "${heading}" entry with no notes. Add them before tagging.`,
  );
  process.exit(1);
}
console.log(notes);
