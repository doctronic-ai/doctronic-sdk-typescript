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
/** A media-type extension on `text/event-stream`: the schema of each event's JSON `data`. */
export const EVENT_SCHEMA_EXTENSION = 'x-doctronic-event-schema';
/** The envelope fields every webhook delivery carries. `verifyWebhook()` checks each one. */
export const WEBHOOK_ENVELOPE_FIELDS = ['eventId', 'event', 'occurredAt', 'data'];

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

const SCHEMA_REF = /^#\/components\/schemas\/([^/]+)$/;
const JSON_TYPES = ['array', 'boolean', 'null', 'number', 'object', 'string'];

function componentName(ref, where) {
  const match = typeof ref === 'string' ? SCHEMA_REF.exec(ref) : null;
  if (!match) throw new Error(`${where} must be a $ref to #/components/schemas/.`);
  return match[1];
}

function jsonTypeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// The JSON types a value matching `schema` can have, sorted. Enum and const values count as their
// type, so an open enum (`anyOf: [{$ref: <enum>}, {type: string}]`) is a string.
function jsonTypes(contract, schema, where) {
  const types = new Set();
  const visit = (raw) => {
    const node = resolveRef(contract, raw);
    if (!node || typeof node !== 'object') throw new Error(`${where}: the contract has no schema.`);
    if (Object.hasOwn(node, 'const')) types.add(jsonTypeOf(node.const));
    else if (Array.isArray(node.enum)) node.enum.forEach((value) => types.add(jsonTypeOf(value)));
    else if (node.anyOf ?? node.oneOf) (node.anyOf ?? node.oneOf).forEach(visit);
    else if (node.allOf?.length === 1) visit(node.allOf[0]);
    else if (node.type !== undefined) {
      for (const type of [node.type].flat()) types.add(type === 'integer' ? 'number' : type);
      if (node.nullable === true) types.add('null');
    } else if (node.properties) types.add('object');
    else throw new Error(`${where}: the contract doesn't say what JSON type it has.`);
  };
  visit(schema);
  const unknown = [...types].filter((type) => !JSON_TYPES.includes(type));
  if (unknown.length) throw new Error(`${where}: unknown JSON type ${unknown.join(', ')}.`);
  return [...types].sort();
}

// The `text/event-stream` media types of the SDK's operations, with the operation's key.
function eventStreams(contract) {
  const streams = [];
  for (const [path, rawItem] of Object.entries(contract.paths ?? {})) {
    const item = resolveRef(contract, rawItem);
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation || orgRequirements(contract, operation).length === 0) continue;
      for (const response of Object.values(operation.responses ?? {})) {
        const media = resolveRef(contract, response)?.content?.['text/event-stream'];
        if (media) streams.push({ key: `${method.toUpperCase()} ${path}`, media });
      }
    }
  }
  return streams;
}

/**
 * The stream events, from `x-doctronic-event-schema` on each streaming operation's
 * `text/event-stream` response. It must name one union of the events, discriminated on a property
 * with a mapping. For each event: its discriminator value, its component, and the fields it always
 * carries other than the discriminator (its `required`), with the JSON types each can have.
 *
 * Throws when the contract doesn't describe the events, so the SDK is never generated without
 * them.
 */
export function describeStreamEvents(contract) {
  const streams = eventStreams(contract);
  if (streams.length === 0) {
    throw new Error('The contract has no operation that responds with text/event-stream.');
  }
  const refs = new Set();
  for (const { key, media } of streams) {
    const ref = media[EVENT_SCHEMA_EXTENSION]?.$ref;
    if (typeof ref !== 'string') {
      throw new Error(
        `${key}: the text/event-stream response has no ${EVENT_SCHEMA_EXTENSION} $ref, so the ` +
          "stream event types can't be generated. Pin a contract that describes the stream events.",
      );
    }
    refs.add(ref);
  }
  if (refs.size > 1) {
    throw new Error(
      `The streaming operations name different ${EVENT_SCHEMA_EXTENSION} schemas: ` +
        `${[...refs].join(', ')}. The SDK has one stream event union.`,
    );
  }
  const [ref] = refs;
  const name = componentName(ref, EVENT_SCHEMA_EXTENSION);
  const union = resolveRef(contract, { $ref: ref });
  const property = union?.discriminator?.propertyName;
  const mapping = union?.discriminator?.mapping;
  if (!Array.isArray(union?.oneOf) || typeof property !== 'string' || !mapping) {
    throw new Error(`${name} must be a oneOf with a discriminator propertyName and mapping.`);
  }
  const members = union.oneOf.map((member, index) =>
    componentName(member?.$ref, `${name}.oneOf[${index}]`),
  );
  const events = Object.entries(mapping).map(([type, target]) => {
    const component = componentName(target, `${name}.discriminator.mapping.${type}`);
    if (!members.includes(component)) {
      throw new Error(
        `${name}: the discriminator maps ${type} to ${component}, which isn't in oneOf.`,
      );
    }
    const schema = resolveRef(contract, { $ref: target });
    const own = resolveRef(contract, schema?.properties?.[property]);
    const values = Object.hasOwn(own ?? {}, 'const') ? [own.const] : own?.enum;
    if (values?.length !== 1 || values[0] !== type) {
      throw new Error(`${component}.${property} must be the constant ${JSON.stringify(type)}.`);
    }
    const fields = Object.fromEntries(
      (schema.required ?? [])
        .filter((field) => field !== property)
        .map((field) => [
          field,
          jsonTypes(contract, schema.properties?.[field], `${component}.${field}`),
        ]),
    );
    return { type, component, fields };
  });
  const unmapped = members.filter((member) => !events.some((e) => e.component === member));
  if (unmapped.length) {
    throw new Error(`${name}: the discriminator mapping leaves out ${unmapped.join(', ')}.`);
  }
  return { operations: streams.map(({ key }) => key), union: name, property, events };
}

/**
 * The webhooks, from the contract's top-level `webhooks`: for each event name, the component of
 * the `POST` body. Every payload must require the envelope that `verifyWebhook()` checks
 * ({@link WEBHOOK_ENVELOPE_FIELDS}), with `event` the constant event name.
 *
 * Throws when the contract doesn't describe the webhooks, so the SDK is never generated without
 * them.
 */
export function describeWebhooks(contract) {
  const webhooks = contract.webhooks;
  if (!webhooks || typeof webhooks !== 'object' || Object.keys(webhooks).length === 0) {
    throw new Error(
      "The contract has no webhooks, so the webhook payload types can't be generated. Pin a " +
        'contract that describes the webhooks.',
    );
  }
  return Object.entries(webhooks).map(([event, rawItem]) => {
    const where = `webhooks.${event}`;
    const body = resolveRef(contract, resolveRef(contract, rawItem)?.post?.requestBody);
    const raw = body?.content?.['application/json']?.schema;
    const component = componentName(raw?.$ref, `${where}: the POST application/json body`);
    const schema = resolveRef(contract, raw);
    const missing = WEBHOOK_ENVELOPE_FIELDS.filter((field) => !schema?.required?.includes(field));
    if (missing.length) {
      throw new Error(
        `${where}: ${component} doesn't require ${missing.join(', ')}, which verifyWebhook() ` +
          'requires of every delivery.',
      );
    }
    if (resolveRef(contract, schema.properties?.event)?.const !== event) {
      throw new Error(`${component}.event must be the constant ${JSON.stringify(event)}.`);
    }
    return { event, component };
  });
}
