#!/usr/bin/env node
// Regenerates the generated code of both packages from the Doctronic API contract: the server
// SDK's src/generated/ and the browser package's packages/browser/src/generated/.
//
//   npm run generate                              # both, from the pinned openapi/doctronic-v1.json
//   npm run generate -- --contract <path|url>     # any copy of the contract
//   npm run generate -- --profile server          # one package: server, browser, or all (default)
//
// Output depends only on the contract's content, never on where it was read from, so CI can
// regenerate from the pinned copy and diff against the committed files.
//
// The server profile generates only operations that take the organization's API token. Others,
// such as browser-only operations, are listed and skipped. So is what only other credentials get
// on the operations kept, such as embed session tokens' responses and request fields, and the
// components only skipped parts use.
//
// The browser profile generates the operations that take an embed session token, and the public
// ones that take no credential, with only the embed session token's security alternative, and
// only the components they reach. It has no webhooks.
//
// The stream events (`x-doctronic-event-schema`) are required, and so are the webhooks
// (`webhooks`) for the server profile and the embed session token scheme for the browser one: a
// contract without them fails the run and writes nothing, for either package, rather than drop
// their types.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import openapiTS, { astToString } from 'openapi-typescript';

import {
  browserContract,
  describeOperations,
  describeStreamEvents,
  describeWebhooks,
  EVENT_SCHEMA_EXTENSION,
  loadContract,
  PINNED_CONTRACT,
  PROFILE_NAMES,
  sdkContract,
} from './contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// What each profile writes, and how it describes the operations it covers.
const OUTPUTS = {
  server: {
    outDir: resolve(root, 'src/generated'),
    select: sdkContract,
    skippedReason: "don't take the organization's API token",
    credentialField: `  /** The operation's security requires \`X-Doctronic-User-ID\`. */
  readonly userScoped: boolean;`,
  },
  browser: {
    outDir: resolve(root, 'packages/browser/src/generated'),
    select: browserContract,
    skippedReason: 'need a credential other than an embed session token',
    credentialField: `  /** The operation takes the embed session token. Without it, the operation is public. */
  readonly sessionToken: boolean;`,
  },
};

const BANNER = `/**
 * Generated from the Doctronic API contract by \`npm run generate\`. Do not edit by hand.
 */
`;

function renderOperations(operations, credentialField) {
  const entries = operations.map((op) => {
    const { key, ...spec } = op;
    const fields = Object.entries(spec)
      .map(([name, value]) => `    ${name}: ${JSON.stringify(value)},`)
      .join('\n');
    return `  ${JSON.stringify(key)}: {\n${fields}\n  },`;
  });
  return `${BANNER}
export interface OperationSpec {
  /** HTTP method. */
  readonly method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  /** Path template relative to the base URL. */
  readonly path: string;
  /** The operation declares an \`Idempotency-Key\` header. */
  readonly idempotent: boolean;
${credentialField}
  /** The operation responds with \`text/event-stream\`. */
  readonly stream: boolean;
  /** Every response status the contract documents for the operation. */
  readonly statuses: readonly number[];
  /** Error codes the contract documents for the operation's \`409\` response. */
  readonly conflictCodes: readonly string[];
  /**
   * The \`409\` codes the contract marks safe to retry with the same idempotency key
   * (\`x-doctronic-retryable-codes\`). Absent when the contract doesn't say.
   */
  readonly retryableConflictCodes?: readonly string[];
  /** The success envelope's schema requires \`data\`. */
  readonly dataRequired: boolean;
}

export const operations = {
${entries.join('\n')}
} as const satisfies Record<string, OperationSpec>;

export type OperationKey = keyof typeof operations;
`;
}

const schemaType = (component) => `components["schemas"][${JSON.stringify(component)}]`;

// `webhooks` is undefined for the browser profile, which has none.
function renderEvents(stream, webhooks) {
  const streamTypes = stream.events
    .map(({ type, component }) => `  ${JSON.stringify(type)}: ${schemaType(component)};`)
    .join('\n');
  const fields = stream.events
    .map(({ type, fields: required }) => {
      const entries = Object.entries(required).map(
        ([field, types]) => `${JSON.stringify(field)}: ${JSON.stringify(types)}`,
      );
      return `  ${JSON.stringify(type)}: ${entries.length ? `{ ${entries.join(', ')} }` : '{}'},`;
    })
    .join('\n');
  const streamOperations = stream.operations.map((key) => `\`${key}\``).join(', ');
  return `${BANNER}
import type { components } from './schema.js';

/** The JSON types a field can have on the wire. */
export type JsonType = 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string';

/**
 * Each event that ${streamOperations} sends, by \`${stream.property}\`: the \`${stream.union}\` union that
 * the stream's \`${EVENT_SCHEMA_EXTENSION}\` names.
 */
export interface StreamEvents {
${streamTypes}
}

/**
 * The fields each stream event always carries, other than \`${stream.property}\`, with the JSON types
 * each can have: the event schema's \`required\`.
 */
export const streamEventFields = {
${fields}
} as const satisfies {
  readonly [T in keyof StreamEvents]: Readonly<Record<string, readonly JsonType[]>>;
};
${webhooks ? renderWebhooks(webhooks) : ''}`;
}

function renderWebhooks(webhooks) {
  const payloads = webhooks
    .map(({ event, component }) => `  ${JSON.stringify(event)}: ${schemaType(component)};`)
    .join('\n');
  const names = webhooks.map(({ event }) => `  ${JSON.stringify(event)},`).join('\n');
  return `
/** Each webhook's payload, by event name: the contract's \`webhooks\`. */
export interface WebhookPayloads {
${payloads}
}

/** The webhook event names the contract documents. */
export const webhookEvents = [
${names}
] as const satisfies readonly (keyof WebhookPayloads)[];
`;
}

// Reads everything one profile generates, without writing anything.
async function prepare(name, full) {
  const { select, outDir } = OUTPUTS[name];
  const { contract, skipped, trimmed } = select(full);
  const operations = describeOperations(contract, name);
  const stream = describeStreamEvents(contract, name);
  const webhooks = name === 'server' ? describeWebhooks(contract) : undefined;
  const ast = await openapiTS(contract, { defaultNonNullable: false, silent: true });
  return { name, outDir, skipped, trimmed, operations, stream, webhooks, ast };
}

async function write({ name, outDir, operations, stream, webhooks, ast }) {
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'schema.ts'), `${BANNER}\n${astToString(ast)}`);
  await writeFile(
    resolve(outDir, 'operations.ts'),
    renderOperations(operations, OUTPUTS[name].credentialField),
  );
  await writeFile(resolve(outDir, 'events.ts'), renderEvents(stream, webhooks));
}

function report({ name, outDir, skipped, trimmed, operations, stream, webhooks }, source) {
  const idempotent = operations.filter((op) => op.idempotent).length;
  const counts = [
    `${operations.length} operations`,
    `${idempotent} idempotent`,
    `${stream.events.length} stream events`,
    ...(webhooks ? [`${webhooks.length} webhooks`] : []),
  ];
  console.log(`Generated ${relative(root, outDir)}/ from ${source}: ${counts.join(', ')}.`);
  if (skipped.length) {
    console.log(
      `Skipped ${skipped.length} that ${OUTPUTS[name].skippedReason}: ${skipped.join(', ')}.`,
    );
  }
  const left = [
    ['security alternatives on', trimmed.alternatives.length, 'operation'],
    ['', trimmed.responses.length, 'response'],
    ['', trimmed.fields.length, 'request field'],
    ['prose in', trimmed.descriptions.length, 'description'],
    ['', trimmed.webhooks.length, 'webhook'],
    ['', trimmed.components.length, 'component'],
  ]
    .filter(([, count]) => count > 0)
    .map(
      ([lead, count, noun]) => `${lead ? `${lead} ` : ''}${count} ${noun}${count === 1 ? '' : 's'}`,
    );
  if (left.length) {
    console.log(
      `Left out what only other credentials or skipped operations use: ${left.join(', ')}.`,
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: { contract: { type: 'string' }, profile: { type: 'string', default: 'all' } },
  });
  const profiles = values.profile === 'all' ? PROFILE_NAMES : [values.profile];
  if (!profiles.every((name) => Object.hasOwn(OUTPUTS, name))) {
    throw new Error(`--profile must be one of ${[...PROFILE_NAMES, 'all'].join(', ')}.`);
  }
  const source = values.contract ?? relative(process.cwd(), PINNED_CONTRACT);
  const contract = await loadContract(source);

  // Read everything for every profile first, so a contract that lacks a part writes nothing.
  const prepared = [];
  for (const name of profiles) prepared.push(await prepare(name, contract));
  for (const output of prepared) await write(output);
  for (const output of prepared) report(output, source);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
