// Types for contract.mjs, so the tests can import it.

export type Contract = Record<string, unknown>;

export interface OperationDescription {
  key: string;
  method: string;
  path: string;
  idempotent: boolean;
  userScoped: boolean;
  stream: boolean;
  statuses: number[];
  conflictCodes: string[];
  retryableConflictCodes?: string[];
  dataRequired: boolean;
}

export type JsonType = 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string';

export interface StreamEventsDescription {
  /** The streaming operations' keys, like `POST /chats/{chatId}/stream/`. */
  operations: string[];
  /** The union component that `x-doctronic-event-schema` names. */
  union: string;
  /** The discriminator property. */
  property: string;
  events: { type: string; component: string; fields: Record<string, JsonType[]> }[];
}

export interface WebhookDescription {
  event: string;
  component: string;
}

export const PINNED_CONTRACT: string;
export const PUBLISHED_CONTRACT_URL: string;
export const ORG_TOKEN_SCHEME: string;
export const RETRYABLE_CODES_EXTENSION: string;
export const EVENT_SCHEMA_EXTENSION: string;
export const WEBHOOK_ENVELOPE_FIELDS: string[];

export function loadContract(source: string): Promise<Contract>;
export function resolveRef(contract: Contract, value: unknown): unknown;
/** What {@link sdkContract} left out of the operations it kept. */
export interface TrimmedParts {
  /** Keys of the operations whose security alternatives without the org token were dropped. */
  alternatives: string[];
  /** `STATUS METHOD /path` of each embed-only response. */
  responses: string[];
  /** `Component.field` of each embed-only request field. */
  fields: string[];
  /** Keys of the operations whose description lost embed-only prose. */
  descriptions: string[];
  /** Refs of the components only the parts left out used. */
  components: string[];
}

export function sdkContract(contract: Contract): {
  contract: Contract;
  skipped: string[];
  trimmed: TrimmedParts;
};
export function describeOperations(contract: Contract): OperationDescription[];
export function describeStreamEvents(contract: Contract): StreamEventsDescription;
export function describeWebhooks(contract: Contract): WebhookDescription[];
