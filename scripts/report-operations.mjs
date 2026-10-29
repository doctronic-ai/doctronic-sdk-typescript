#!/usr/bin/env node
// Reports, in Markdown, how the SDK's operations change between two copies of the contract. The
// regenerate and contract-drift workflows put it in a pull request or a job summary.
//
//   node scripts/report-operations.mjs <before.json> <after.json>
//
// A new operation gets types and runtime facts from `npm run generate`, but no method until
// someone writes one in src/. The report lists every generated operation that no resource method
// calls yet.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeOperations, loadContract, sdkContract } from './contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function operationsOf(contract) {
  const { contract: covered, skipped } = sdkContract(contract);
  return { operations: new Map(describeOperations(covered).map((op) => [op.key, op])), skipped };
}

// Operation keys that the hand-written code in src/ mentions, like 'POST /users/'.
async function referencedKeys() {
  const keys = new Set();
  const src = join(root, 'src');
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

async function main() {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    console.error('Usage: node scripts/report-operations.mjs <before.json> <after.json>');
    process.exit(2);
  }
  const before = operationsOf(await loadContract(beforePath));
  const after = operationsOf(await loadContract(afterPath));
  const referenced = await referencedKeys();

  const added = [...after.operations.keys()].filter((key) => !before.operations.has(key));
  const removed = [...before.operations.keys()].filter((key) => !after.operations.has(key));
  const changed = [...after.operations.entries()]
    .filter(([key]) => before.operations.has(key))
    .map(([key, op]) => [key, changedFacts(before.operations.get(key), op)])
    .filter(([, facts]) => facts.length);
  const unmethoded = [...after.operations.keys()].filter((key) => !referenced.has(key));

  const sections = [];
  if (added.length) {
    sections.push(
      `### New operations\n\n${list(added.map((key) => `\`${key}\``))}\n\n` +
        'Their types and runtime facts are generated. Each needs a hand-written resource method in `src/`.',
    );
  }
  if (removed.length) {
    sections.push(
      `### Removed operations\n\n${list(removed.map((key) => `\`${key}\``))}\n\n` +
        'Remove their resource methods; the type check fails until then.',
    );
  }
  if (changed.length) {
    sections.push(
      `### Operations whose runtime facts changed\n\n${list(changed.map(([key, facts]) => `\`${key}\`: ${facts.join('; ')}`))}`,
    );
  }
  if (unmethoded.length) {
    sections.push(
      `### Operations without a resource method\n\n${list(unmethoded.map((key) => `\`${key}\``))}`,
    );
  }
  if (after.skipped.length) {
    sections.push(
      `### Skipped operations\n\nThese don't take the organization's API token, so the SDK doesn't generate them:\n\n${list(after.skipped.map((key) => `\`${key}\``))}`,
    );
  }
  const summary =
    added.length || removed.length || changed.length
      ? `The SDK covers ${after.operations.size} operations (${before.operations.size} before).`
      : `The SDK covers ${after.operations.size} operations. None were added or removed, and their runtime facts are unchanged.`;
  // Runtime facts only: request and response types can change without any of the above. The
  // diff of src/generated/schema.ts shows those.
  const types =
    'Request and response types can change too; review `src/generated/schema.ts` in the diff.';
  console.log([summary, ...sections, types].join('\n\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
