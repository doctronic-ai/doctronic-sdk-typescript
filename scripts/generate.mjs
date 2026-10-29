#!/usr/bin/env node
// Regenerates src/generated/ from the Doctronic API contract.
//
//   npm run generate                              # the published contract
//   npm run generate -- --contract <path|url>     # any copy of the contract
//
// Output depends only on the contract's content, never on where it was read from, so CI can
// regenerate from the published contract and diff against the committed files.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import openapiTS, { astToString } from 'openapi-typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONTRACT = 'https://docs.doctronic.ai/openapi/doctronic-v1.json';
const OUT_DIR = resolve(root, 'src/generated');
const METHODS = ['get', 'put', 'post', 'patch', 'delete'];
const USER_ID_HEADER = 'x-doctronic-user-id';

const BANNER = `/**
 * Generated from the Doctronic API contract by \`npm run generate\`. Do not edit by hand.
 */
`;

async function loadContract(source) {
  const text = /^https?:\/\//.test(source)
    ? await fetch(source).then((response) => {
        if (!response.ok) throw new Error(`GET ${source}: HTTP ${response.status}`);
        return response.text();
      })
    : await readFile(resolve(source), 'utf8');
  const contract = JSON.parse(text);
  if (typeof contract.openapi !== 'string' || !contract.openapi.startsWith('3.')) {
    throw new Error(`${source} is not an OpenAPI 3 document`);
  }
  return contract;
}

function resolveRef(contract, value) {
  if (!value || typeof value.$ref !== 'string') return value;
  const pointer = value.$ref.replace(/^#\//, '').split('/');
  return resolveRef(
    contract,
    pointer.reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], contract),
  );
}

function errorCodes(contract, response) {
  const media = resolveRef(contract, response)?.content?.['application/json'];
  if (!media) return [];
  const examples = [media.example, ...Object.values(media.examples ?? {}).map((e) => e?.value)];
  return examples.map((example) => example?.code).filter((code) => typeof code === 'string');
}

// Whether the success envelope's schema requires `data`. `202` means "not ready" and is skipped.
function successDataRequired(contract, responses) {
  const status = Object.keys(responses)
    .filter((code) => /^2\d\d$/.test(code) && code !== '202')
    .sort()[0];
  if (!status) return false;
  const schema = resolveRef(
    contract,
    resolveRef(contract, responses[status])?.content?.['application/json']?.schema,
  );
  return Array.isArray(schema?.required) && schema.required.includes('data');
}

// The runtime facts the client needs about each operation. Types alone can't carry these.
function describeOperations(contract) {
  const userIdSchemes = new Set(
    Object.entries(contract.components?.securitySchemes ?? {})
      .filter(([, scheme]) => {
        const resolved = resolveRef(contract, scheme);
        return resolved.in === 'header' && resolved.name.toLowerCase() === USER_ID_HEADER;
      })
      .map(([name]) => name),
  );

  const operations = [];
  for (const [path, rawItem] of Object.entries(contract.paths ?? {})) {
    const item = resolveRef(contract, rawItem);
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((p) =>
        resolveRef(contract, p),
      );
      const security = operation.security ?? contract.security ?? [];
      const responses = operation.responses ?? {};
      operations.push({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        idempotent: parameters.some(
          (p) => p.in === 'header' && p.name.toLowerCase() === 'idempotency-key',
        ),
        userScoped: security.some((requirement) =>
          Object.keys(requirement).some((name) => userIdSchemes.has(name)),
        ),
        stream: Object.values(responses).some(
          (response) => resolveRef(contract, response)?.content?.['text/event-stream'],
        ),
        statuses: Object.keys(responses)
          .filter((status) => /^\d{3}$/.test(status))
          .map(Number),
        conflictCodes: responses['409'] ? errorCodes(contract, responses['409']) : [],
        dataRequired: successDataRequired(contract, responses),
      });
    }
  }
  return operations;
}

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
  /** The success envelope's schema requires \`data\`. */
  readonly dataRequired: boolean;
}

export const operations = {
${entries.join('\n')}
} as const satisfies Record<string, OperationSpec>;

export type OperationKey = keyof typeof operations;
`;
}

async function main() {
  const { values } = parseArgs({ options: { contract: { type: 'string' } } });
  const source = values.contract ?? DEFAULT_CONTRACT;
  const contract = await loadContract(source);

  const ast = await openapiTS(contract, { defaultNonNullable: false, silent: true });
  const operations = describeOperations(contract);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, 'schema.ts'), `${BANNER}\n${astToString(ast)}`);
  await writeFile(resolve(OUT_DIR, 'operations.ts'), renderOperations(operations));

  const idempotent = operations.filter((op) => op.idempotent).length;
  console.log(
    `Generated src/generated/ from ${source}: ${operations.length} operations, ${idempotent} idempotent.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
