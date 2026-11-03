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
/** The security scheme for embed session tokens, which the browser sends instead. */
export const EMBED_SESSION_SCHEME = 'EmbedSessionToken';
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

// The node a local `$ref` points to, without following it any further.
function lookupRef(contract, ref) {
  const pointer = ref.replace(/^#\//, '').split('/');
  return pointer.reduce(
    (node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')],
    contract,
  );
}

export function resolveRef(contract, value) {
  if (!value || typeof value.$ref !== 'string') return value;
  return resolveRef(contract, lookupRef(contract, value.$ref));
}

/**
 * What each package generates from the contract:
 *
 * - `server`, the SDK in `src/generated/`: operations that take the organization's token, and the
 *   webhooks.
 * - `browser`, `packages/browser/src/generated/`: operations that take an embed session token, and
 *   the public ones that take no credential at all, such as the embed bootstrap. No webhooks: the
 *   browser never receives them.
 *
 * On the operations kept, each profile keeps only the security alternatives with its own scheme.
 */
const PROFILES = {
  server: {
    scheme: ORG_TOKEN_SCHEME,
    public: false,
    webhooks: true,
    // The server SDK's hand-written types may use any component the contract defines, so the
    // ones nothing references stay.
    keepUnreferenced: true,
    trimEmbedOnly: true,
    missingScheme: `The contract has no ${ORG_TOKEN_SCHEME} security scheme.`,
  },
  browser: {
    scheme: EMBED_SESSION_SCHEME,
    public: true,
    webhooks: false,
    keepUnreferenced: false,
    trimEmbedOnly: false,
    missingScheme:
      `The contract has no ${EMBED_SESSION_SCHEME} security scheme, so the browser types can't ` +
      'be generated. Pin a contract that publishes the embed API.',
  },
};
/** The profile names, in the order `npm run generate` writes them. */
export const PROFILE_NAMES = Object.keys(PROFILES);

function profileOf(name) {
  if (!Object.hasOwn(PROFILES, name)) {
    throw new Error(`Unknown profile ${JSON.stringify(name)}: use ${PROFILE_NAMES.join(', ')}.`);
  }
  return PROFILES[name];
}

const securityOf = (contract, operation) => operation.security ?? contract.security ?? [];
const takesScheme = (requirement, scheme) => Object.hasOwn(requirement ?? {}, scheme);
// No requirement names a scheme: anyone can call the operation.
const isPublic = (security) =>
  security.every((requirement) => Object.keys(requirement ?? {}).length === 0);

// Whether the profile generates the operation.
function inProfile(contract, operation, profile) {
  const security = securityOf(contract, operation);
  if (security.some((requirement) => takesScheme(requirement, profile.scheme))) return true;
  return profile.public && isPublic(security);
}

// The extension that lists an operation's security as the server checks it at runtime, next to
// `security`. The SDK keeps only its organization-token alternatives too.
const RUNTIME_SECURITY_EXTENSION = 'x-doctronic-runtime-security';

// What only embed session tokens get on operations that also take the organization's token. The
// contract marks these only in prose, so the rules match what the docs' `hideEmbed`
// (doctronic-developer-docs, scripts/openapi-normalization.mjs) removes before publishing: keep
// the two in step.
const EMBED_ONLY = {
  /** A response whose description says only embed session tokens get it. */
  response: /Sent for embed session tokens only\./,
  /** Request fields, by component, that only embed sessions send. */
  fields: { CreateChatRequest: ['starterPromptIndex'] },
  /** Sentences about embed in the descriptions of operations the SDK keeps. */
  prose: [
    [/,\s+or an embed\s+session token from `POST \/embed\/sessions\/` alone \([^)]*\)\./g, '.'],
    [
      /\s+Embed chats\s+only get Doctronic visit CTAs when their deployment offers Doctronic visits\./g,
      '',
    ],
    [
      /\n+While the embed deployment is paused, [\s\S]*?whose `errorCode` is `error\.embed\.paused`\./g,
      '',
    ],
  ],
};

// The `#/components/...` refs anywhere under `node`.
function componentRefs(node, refs = new Set()) {
  if (Array.isArray(node)) node.forEach((child) => componentRefs(child, refs));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('#/components/')) {
        refs.add(value);
      } else componentRefs(value, refs);
    }
  }
  return refs;
}

// Every component the paths, webhooks, and extensions reach, plus the `roots`, directly or
// through other components.
function reachableComponents(contract, roots = []) {
  const document = Object.fromEntries(
    Object.entries(contract).filter(([key]) => key !== 'components'),
  );
  const reached = new Set();
  const pending = [...componentRefs(document), ...roots];
  while (pending.length) {
    const ref = pending.pop();
    if (reached.has(ref)) continue;
    reached.add(ref);
    // One hop at a time, so a component that is only a `$ref` to another still reaches it.
    pending.push(...componentRefs(lookupRef(contract, ref)));
  }
  return reached;
}

// The ref of every component the contract defines.
function allComponents(contract) {
  return Object.entries(contract.components ?? {}).flatMap(([type, entries]) =>
    Object.keys(entries ?? {}).map((name) => `#/components/${type}/${name}`),
  );
}

// Removes, in place, what only other credentials get from an operation the profile keeps.
// Records each removal in `trimmed` under the operation's key.
function trimOperation(contract, key, operation, trimmed, profile) {
  for (const field of ['security', RUNTIME_SECURITY_EXTENSION]) {
    if (!Array.isArray(operation[field])) continue;
    const kept = operation[field].filter((requirement) => takesScheme(requirement, profile.scheme));
    if (kept.length === operation[field].length) continue;
    operation[field] = kept;
    if (!trimmed.alternatives.includes(key)) trimmed.alternatives.push(key);
  }
  if (!profile.trimEmbedOnly) return;
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (EMBED_ONLY.response.test(resolveRef(contract, response)?.description ?? '')) {
      delete operation.responses[status];
      trimmed.responses.push(`${status} ${key}`);
    }
  }
  if (typeof operation.description === 'string') {
    const description = EMBED_ONLY.prose.reduce(
      (text, [pattern, replacement]) => text.replace(pattern, replacement),
      operation.description,
    );
    if (description !== operation.description) {
      operation.description = description;
      trimmed.descriptions.push(key);
    }
  }
}

/**
 * The part of the contract the SDK covers: every operation that takes the organization's token.
 * Others, such as browser-only operations that take a session token or no token at all, are left
 * out of the paths. So is what only other credentials get on the operations kept: their security
 * alternatives without the organization's token, and the responses, request fields, and prose
 * the contract documents for embed session tokens only. Components that only the parts left out
 * use are left out too; the rest stay, because the SDK's own types may use any of them.
 *
 * Returns the trimmed contract, the `METHOD /path` keys it left out (`skipped`), and the other
 * parts it left out (`trimmed`). With nothing to leave out, it returns the contract unchanged.
 */
export function sdkContract(contract) {
  return profileContract(contract, 'server');
}

/**
 * The part of the contract the browser package covers: every operation that takes an embed
 * session token, and every public one. On the chat operations that also take the organization's
 * token, only the embed session token's alternative stays. The webhooks are left out, and so is
 * every component the operations kept don't reach.
 *
 * Returns the same shape as {@link sdkContract}. Throws when the contract has no embed session
 * token scheme, as the published contract has until the embed API launches.
 */
export function browserContract(contract) {
  return profileContract(contract, 'browser');
}

function profileContract(contract, name) {
  const profile = profileOf(name);
  if (!Object.hasOwn(contract.components?.securitySchemes ?? {}, profile.scheme)) {
    throw new Error(profile.missingScheme);
  }
  const next = structuredClone(contract);
  const paths = {};
  const skipped = [];
  const trimmed = {
    alternatives: [],
    responses: [],
    fields: [],
    descriptions: [],
    webhooks: [],
    components: [],
  };
  for (const [path, rawItem] of Object.entries(next.paths ?? {})) {
    const item = resolveRef(next, rawItem);
    const present = ALL_METHODS.filter((method) => item[method]);
    const skip = present.filter((method) => !inProfile(next, item[method], profile));
    skipped.push(...skip.map((method) => `${method.toUpperCase()} ${path}`));
    for (const method of present.filter((method) => !skip.includes(method))) {
      trimOperation(next, `${method.toUpperCase()} ${path}`, item[method], trimmed, profile);
    }
    if (skip.length === 0) paths[path] = rawItem;
    else if (present.length > skip.length) {
      paths[path] = Object.fromEntries(Object.entries(item).filter(([key]) => !skip.includes(key)));
    }
  }
  next.paths = paths;

  if (!profile.webhooks && next.webhooks) {
    trimmed.webhooks.push(...Object.keys(next.webhooks));
    delete next.webhooks;
  }

  for (const [component, fields] of Object.entries(
    profile.trimEmbedOnly ? EMBED_ONLY.fields : {},
  )) {
    const schema = next.components?.schemas?.[component];
    for (const field of fields) {
      if (!Object.hasOwn(schema?.properties ?? {}, field)) continue;
      delete schema.properties[field];
      if (Array.isArray(schema.required)) {
        schema.required = schema.required.filter((name) => name !== field);
      }
      trimmed.fields.push(`${component}.${field}`);
    }
  }

  // The server profile keeps a component that nothing referenced before, and every component it
  // references. The browser profile keeps only what its operations reach, and the security
  // schemes they name.
  const reachableBefore = reachableComponents(contract);
  const unreferenced = allComponents(contract).filter((ref) => !reachableBefore.has(ref));
  const reachable = reachableComponents(next, profile.keepUnreferenced ? unreferenced : []);
  const schemes = new Set(
    Object.values(next.paths).flatMap((rawItem) => {
      const item = resolveRef(next, rawItem);
      return ALL_METHODS.flatMap((method) =>
        item[method] ? securityOf(next, item[method]).flatMap(Object.keys) : [],
      );
    }),
  );
  for (const ref of profile.keepUnreferenced ? reachableBefore : allComponents(contract)) {
    const [, , type, name] = ref.split('/');
    if (reachable.has(ref) || (type === 'securitySchemes' && schemes.has(name))) continue;
    delete next.components[type][name];
    trimmed.components.push(ref);
  }

  const changed = skipped.length || Object.values(trimmed).some((parts) => parts.length);
  return { contract: changed ? next : contract, skipped, trimmed };
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
 * the contract from {@link sdkContract} or {@link browserContract}, with the same profile;
 * operations outside the profile are skipped here too.
 *
 * The server profile says which operations need `X-Doctronic-User-ID` (`userScoped`); the
 * browser never sends it, so its profile says which ones take the embed session token
 * (`sessionToken`) rather than no credential.
 */
export function describeOperations(contract, profileName = 'server') {
  const profile = profileOf(profileName);
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
      if (!inProfile(contract, operation, profile)) continue;
      const security = securityOf(contract, operation).filter((requirement) =>
        takesScheme(requirement, profile.scheme),
      );
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
        ...(profile === PROFILES.server
          ? {
              userScoped: security.some((requirement) =>
                Object.keys(requirement).some((scheme) => userIdSchemes.has(scheme)),
              ),
            }
          : { sessionToken: security.length > 0 }),
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

// The `text/event-stream` media types of the profile's operations, with the operation's key.
function eventStreams(contract, profile) {
  const streams = [];
  for (const [path, rawItem] of Object.entries(contract.paths ?? {})) {
    const item = resolveRef(contract, rawItem);
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation || !inProfile(contract, operation, profile)) continue;
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
 * carries other than the discriminator (its `required`), with the JSON types each can have. Pass
 * the profile's contract and the profile's name, as for {@link describeOperations}.
 *
 * Throws when the contract doesn't describe the events, so neither package is generated without
 * them.
 */
export function describeStreamEvents(contract, profileName = 'server') {
  const streams = eventStreams(contract, profileOf(profileName));
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
 * them. Only the server profile has webhooks.
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
