#!/usr/bin/env node
// Reports, in Markdown, how the operations of each generated package change between two copies of
// the contract: the server SDK (src/generated/) and the browser package
// (packages/browser/src/generated/). The regenerate and contract-drift workflows put it in a pull
// request or a job summary.
//
//   node scripts/report-operations.mjs <before.json> <after.json>
//
// A new operation gets types and runtime facts from `npm run generate`. In the server SDK it has no
// method until someone writes one in src/, so the report lists every generated server operation
// that no resource method calls yet. The browser package has no hand-written methods.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  browserContract,
  describeOperations,
  EMBED_SESSION_SCHEME,
  loadContract,
  sdkContract,
} from './contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PROFILES = [
  {
    name: 'server',
    title: 'Server SDK',
    select: sdkContract,
    // The server profile needs the organization's token scheme; sdkContract throws without it.
    available: () => true,
    methodsDir: 'src',
    skippedReason: "don't take the organization's API token, so the SDK doesn't generate them",
    types:
      'Request, response, stream event, and webhook types can change too; review ' +
      '`src/generated/schema.ts` and `src/generated/events.ts` in the diff.',
  },
  {
    name: 'browser',
    title: 'Browser package',
    select: browserContract,
    // Until the embed API launches, a contract can lack the embed session token scheme.
    available: (contract) =>
      Object.hasOwn(contract.components?.securitySchemes ?? {}, EMBED_SESSION_SCHEME),
    methodsDir: undefined,
    skippedReason:
      "need a credential other than an embed session token, so the browser package doesn't generate them",
    types:
      'Request, response, and stream event types can change too; review ' +
      '`packages/browser/src/generated/schema.ts` and `packages/browser/src/generated/events.ts` ' +
      'in the diff.',
  },
];

// The profile's operations by key, or undefined when the contract can't produce the profile.
function operationsOf(contract, profile) {
  if (!profile.available(contract)) return undefined;
  const { contract: covered, skipped } = profile.select(contract);
  return {
    operations: new Map(describeOperations(covered, profile.name).map((op) => [op.key, op])),
    skipped,
  };
}

// Operation keys that the hand-written code in a directory mentions, like 'POST /users/'.
async function referencedKeys(dir) {
  const keys = new Set();
  const src = join(root, dir);
  for (const name of await readdir(src)) {
    if (!name.endsWith('.ts')) continue;
    const text = await readFile(join(src, name), 'utf8');
    for (const [, key] of text.matchAll(/'((?:GET|PUT|POST|PATCH|DELETE) \/[^']*)'/g))
      keys.add(key);
  }
  return keys;
}

// Every field either side has, so a fact that disappears, like `retryableConflictCodes` when the
// contract drops `x-doctronic-retryable-codes`, counts as a change too.
function changedFacts(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => field !== 'key')
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => `\`${field}\` ${show(before[field])} → ${show(after[field])}`);
}

const show = (value) => (value === undefined ? 'absent' : JSON.stringify(value));
const list = (items) => items.map((item) => `- ${item}`).join('\n');
const keys = (items) => list(items.map((key) => `\`${key}\``));

async function reportProfile(profile, beforeContract, afterContract) {
  const heading = `### ${profile.title}`;
  const after = operationsOf(afterContract, profile);
  if (!after) {
    return `${heading}\n\nThe contract has no \`${EMBED_SESSION_SCHEME}\` security scheme, so the ${profile.title.toLowerCase()} can't be generated.`;
  }
  // A previous contract without the profile counts as one with no operations.
  const before = operationsOf(beforeContract, profile) ?? { operations: new Map(), skipped: [] };

  const added = [...after.operations.keys()].filter((key) => !before.operations.has(key));
  const removed = [...before.operations.keys()].filter((key) => !after.operations.has(key));
  const changed = [...after.operations.entries()]
    .filter(([key]) => before.operations.has(key))
    .map(([key, op]) => [key, changedFacts(before.operations.get(key), op)])
    .filter(([, facts]) => facts.length);

  const sections = [];
  if (added.length) {
    sections.push(
      `#### New operations\n\n${keys(added)}\n\nTheir types and runtime facts are generated.` +
        (profile.methodsDir
          ? ` Each needs a hand-written resource method in \`${profile.methodsDir}/\`.`
          : ''),
    );
  }
  if (removed.length) {
    sections.push(
      `#### Removed operations\n\n${keys(removed)}` +
        (profile.methodsDir
          ? '\n\nRemove their resource methods; the type check fails until then.'
          : ''),
    );
  }
  if (changed.length) {
    sections.push(
      `#### Operations whose runtime facts changed\n\n${list(changed.map(([key, facts]) => `\`${key}\`: ${facts.join('; ')}`))}`,
    );
  }
  if (profile.methodsDir) {
    const referenced = await referencedKeys(profile.methodsDir);
    const unmethoded = [...after.operations.keys()].filter((key) => !referenced.has(key));
    if (unmethoded.length) {
      sections.push(`#### Operations without a resource method\n\n${keys(unmethoded)}`);
    }
  }
  if (after.skipped.length) {
    sections.push(
      `#### Skipped operations\n\nThese ${profile.skippedReason}:\n\n${keys(after.skipped)}`,
    );
  }
  const summary =
    added.length || removed.length || changed.length
      ? `It covers ${after.operations.size} operations (${before.operations.size} before).`
      : `It covers ${after.operations.size} operations. None were added or removed, and their runtime facts are unchanged.`;
  // Runtime facts only: request, response and event types can change without any of the above.
  return [heading, summary, ...sections, profile.types].join('\n\n');
}

async function main() {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    console.error('Usage: node scripts/report-operations.mjs <before.json> <after.json>');
    process.exit(2);
  }
  const before = await loadContract(beforePath);
  const after = await loadContract(afterPath);
  const reports = [];
  for (const profile of PROFILES) reports.push(await reportProfile(profile, before, after));
  console.log(reports.join('\n\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
