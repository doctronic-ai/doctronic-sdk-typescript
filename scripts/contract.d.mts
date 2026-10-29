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

export const PINNED_CONTRACT: string;
export const PUBLISHED_CONTRACT_URL: string;
export const ORG_TOKEN_SCHEME: string;
export const RETRYABLE_CODES_EXTENSION: string;

export function loadContract(source: string): Promise<Contract>;
export function resolveRef(contract: Contract, value: unknown): unknown;
export function sdkContract(contract: Contract): { contract: Contract; skipped: string[] };
export function describeOperations(contract: Contract): OperationDescription[];
