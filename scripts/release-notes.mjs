#!/usr/bin/env node
// Prints one version's notes from CHANGELOG.md, for its GitHub Release. Fails when the version has
// no entry, or an entry with no notes, so release.yml can check before it publishes.
//
//   node scripts/release-notes.mjs 0.1.1

import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>');
  process.exit(2);
}

const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const heading = `## ${version}`;
const start = lines.findIndex((line) => line === heading || line.startsWith(`${heading} `));
if (start === -1) {
  console.error(`::error::CHANGELOG.md has no "${heading}" entry. Add one before tagging.`);
  process.exit(1);
}
const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
const notes = lines
  .slice(start + 1, next === -1 ? lines.length : next)
  .join('\n')
  .trim();
if (!notes) {
  console.error(
    `::error::CHANGELOG.md has a "${heading}" entry with no notes. Add them before tagging.`,
  );
  process.exit(1);
}
console.log(notes);
