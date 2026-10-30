#!/usr/bin/env node
// Regenerates src/generated/ from the Doctronic API contract.
//
//   npm run generate                              # the pinned copy, openapi/doctronic-v1.json
//   npm run generate -- --contract <path|url>     # any copy of the contract
//
// Output depends only on the contract's content, never on where it was read from, so CI can
// regenerate from the pinned copy and diff against the committed files.
//
// Only operations that take the organization's API token are generated. Others, such as
// browser-only operations, are listed and skipped.
//
// The stream events (`x-doctronic-event-schema`) and the webhooks (`webhooks`) are required: a
// contract without them fails the run and writes nothing, rather than drop their types.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import openapiTS, { astToString } from 'openapi-typescript';

import {
  describeOperations,
  describeStreamEvents,
  describeWebhooks,
  EVENT_SCHEMA_EXTENSION,
  loadContract,
  PINNED_CONTRACT,
  sdkContract,
} from './contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(root, 'src/generated');

const BANNER = `/**
 * Generated from the Doctronic API contract by \`npm run generate\`. Do not edit by hand.
 */
`;

function renderOperations(operations) {
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
  /** The operation's security requires \`X-Doctronic-User-ID\`. */
  readonly userScoped: boolean;
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
  const payloads = webhooks
    .map(({ event, component }) => `  ${JSON.stringify(event)}: ${schemaType(component)};`)
    .join('\n');
  const names = webhooks.map(({ event }) => `  ${JSON.stringify(event)},`).join('\n');
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

async function main() {
  const { values } = parseArgs({ options: { contract: { type: 'string' } } });
  const source = values.contract ?? relative(process.cwd(), PINNED_CONTRACT);
  const { contract, skipped } = sdkContract(await loadContract(source));

  // Read everything first, so a contract that lacks a part writes nothing.
  const operations = describeOperations(contract);
  const stream = describeStreamEvents(contract);
  const webhooks = describeWebhooks(contract);
  const ast = await openapiTS(contract, { defaultNonNullable: false, silent: true });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'schema.ts'), `${BANNER}\n${astToString(ast)}`);
  await writeFile(resolve(OUT_DIR, 'operations.ts'), renderOperations(operations));
  await writeFile(resolve(OUT_DIR, 'events.ts'), renderEvents(stream, webhooks));

  const idempotent = operations.filter((op) => op.idempotent).length;
  console.log(
    `Generated src/generated/ from ${source}: ${operations.length} operations, ${idempotent} idempotent, ` +
      `${stream.events.length} stream events, ${webhooks.length} webhooks.`,
  );
  if (skipped.length) {
    console.log(
      `Skipped ${skipped.length} that don't take the organization's API token: ${skipped.join(', ')}.`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
