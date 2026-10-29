// Reads the Doctronic API contract and works out what the SDK generates from it. Used by
// generate.mjs and by the tests in test/contract.test.ts.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The committed copy of the contract. `npm run generate` reads it unless told otherwise. */
export const PINNED_CONTRACT = resolve(root, 'openapi/doctronic-v1.json');
/** Where the docs site publishes the contract. */
export const PUBLISHED_CONTRACT_URL = 'https://docs.doctronic.ai/openapi/doctronic-v1.json';

/** The security scheme for the organization's API token. The SDK sends it on every request. */
export const ORG_TOKEN_SCHEME = 'HTTPBearer';
/** A response-level extension on `409`: the error codes safe to retry with the same key. */
export const RETRYABLE_CODES_EXTENSION = 'x-doctronic-retryable-codes';

// The methods the client sends. The filter checks every method a path item can have, since
// openapi-typescript generates types for all of them.
const METHODS = ['get', 'put', 'post', 'patch', 'delete'];
const ALL_METHODS = [...METHODS, 'head', 'options', 'trace'];
const USER_ID_HEADER = 'x-doctronic-user-id';

export async function loadContract(source) {
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

export function resolveRef(contract, value) {
  if (!value || typeof value.$ref !== 'string') return value;
  const pointer = value.$ref.replace(/^#\//, '').split('/');
  return resolveRef(
    contract,
    pointer.reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], contract),
  );
}

// The operation's security requirements that include the organization's token.
function orgRequirements(contract, operation) {
  const security = operation.security ?? contract.security ?? [];
  return security.filter((requirement) => Object.hasOwn(requirement ?? {}, ORG_TOKEN_SCHEME));
}

/**
 * The part of the contract the SDK covers: every operation that takes the organization's token.
 * Others, such as browser-only operations that take a session token or no token at all, are left
 * out of the paths. Components stay, because the SDK's own types may use any of them.
 *
 * Returns the trimmed contract and the `METHOD /path` keys it left out. With nothing to leave out,
 * it returns the contract unchanged.
 */
export function sdkContract(contract) {
  if (!Object.hasOwn(contract.components?.securitySchemes ?? {}, ORG_TOKEN_SCHEME)) {
    throw new Error(`The contract has no ${ORG_TOKEN_SCHEME} security scheme.`);
  }
  const paths = {};
  const skipped = [];
  for (const [path, rawItem] of Object.entries(contract.paths ?? {})) {
    const item = resolveRef(contract, rawItem);
    const skip = ALL_METHODS.filter(
      (method) => item[method] && orgRequirements(contract, item[method]).length === 0,
    );
    skipped.push(...skip.map((method) => `${method.toUpperCase()} ${path}`));
    if (skip.length === 0) paths[path] = rawItem;
    else if (ALL_METHODS.some((method) => item[method] && !skip.includes(method))) {
      paths[path] = Object.fromEntries(Object.entries(item).filter(([key]) => !skip.includes(key)));
    }
  }
  return { contract: skipped.length ? { ...contract, paths } : contract, skipped };
}

function errorCodes(contract, response) {
  const media = resolveRef(contract, response)?.content?.['application/json'];
  if (!media) return [];
  const examples = [media.example, ...Object.values(media.examples ?? {}).map((e) => e?.value)];
  return examples.map((example) => example?.code).filter((code) => typeof code === 'string');
}

// The codes a `409` response lists in `x-doctronic-retryable-codes`, or `undefined` without it.
function retryableCodes(contract, key, response) {
  const codes = resolveRef(contract, response)?.[RETRYABLE_CODES_EXTENSION];
  if (codes === undefined) return undefined;
  if (!Array.isArray(codes) || !codes.every((code) => typeof code === 'string' && code)) {
    throw new Error(`${key}: ${RETRYABLE_CODES_EXTENSION} must be an array of error codes.`);
  }
  return codes;
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

/**
 * The runtime facts the client needs about each operation. Types alone can't carry these. Pass
 * the contract from {@link sdkContract}; operations without the organization's token are skipped
 * here too.
 */
export function describeOperations(contract) {
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
      const security = orgRequirements(contract, operation);
      if (security.length === 0) continue;
      const key = `${method.toUpperCase()} ${path}`;
      const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((p) =>
        resolveRef(contract, p),
      );
      const responses = operation.responses ?? {};
      const conflict = responses['409'];
      const retryable = conflict ? retryableCodes(contract, key, conflict) : undefined;
      operations.push({
        key,
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
        conflictCodes: conflict ? errorCodes(contract, conflict) : [],
        // Only when the contract declares it, so an operation without it keeps the same output.
        ...(retryable ? { retryableConflictCodes: retryable } : {}),
        dataRequired: successDataRequired(contract, responses),
      });
    }
  }
  return operations;
}
