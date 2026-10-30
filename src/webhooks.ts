// Webhook signature verification, following the scheme in the docs' Webhooks page
// (webhooks.mdx). The payload types are generated from the contract's `webhooks`
// (src/generated/events.ts).

import { createHmac, timingSafeEqual } from 'node:crypto';

import { WebhookVerificationError, isRecord } from './errors.js';
import { webhookEvents, type WebhookPayloads } from './generated/events.js';
import type { components } from './generated/schema.js';

/** The header that carries the signature. */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Doctronic-Signature';

/** Every delivery uses this envelope. */
export interface WebhookEnvelope<E extends string, D> {
  /** Stable across every delivery attempt of one event. Use it as your deduplication key. */
  eventId: string;
  /** The event name. Event names are case-sensitive. */
  event: E;
  /** When the event happened, not when this attempt arrived. */
  occurredAt: string;
  data: D;
}

/** A join URL is ready. Replace any URL you stored earlier. */
export type AppointmentWaitingRoomReadyEvent = WebhookPayloads['appointment.waiting_room_ready'];
export type AppointmentWaitingRoomReadyData =
  components['schemas']['AppointmentWaitingRoomReadyData'];

/** A practitioner joined the appointment. */
export type AppointmentPractitionerJoinedEvent = WebhookPayloads['appointment.practitioner_joined'];
export type AppointmentPractitionerJoinedData =
  components['schemas']['AppointmentPractitionerJoinedData'];

/** The appointment call ended. */
export type AppointmentCallEndedEvent = WebhookPayloads['appointment.call_ended'];
export type AppointmentCallEndedData = components['schemas']['AppointmentCallEndedData'];

/** A consultation document is ready to retrieve. */
export type ArtifactReadyEvent = WebhookPayloads['artifact.ready'];
export type ArtifactReadyData = components['schemas']['ArtifactReadyData'];

/** An event this SDK doesn't know yet. Acknowledge it with `2xx`. */
export type UnknownWebhookEvent = WebhookEnvelope<string, unknown>;

/** Every event the contract documents, as a union on `event`. */
export type KnownWebhookEvent = WebhookPayloads[keyof WebhookPayloads];

export type WebhookEvent = KnownWebhookEvent | UnknownWebhookEvent;

const KNOWN_WEBHOOK_EVENTS: ReadonlySet<string> = new Set(webhookEvents);

/** Narrows a delivery to the documented events, so a switch on `event.event` narrows `data`. */
export function isKnownWebhookEvent(event: WebhookEvent): event is KnownWebhookEvent {
  return KNOWN_WEBHOOK_EVENTS.has(event.event);
}

/**
 * Verifies a delivery and returns its parsed envelope.
 *
 * Pass the request body exactly as received. A parsed and re-serialized body has different bytes
 * and fails verification. Throws {@link WebhookVerificationError} when the signature is missing or
 * doesn't match, or the verified body isn't an envelope.
 *
 * @param rawBody The raw request body.
 * @param signatureHeader The `X-Doctronic-Signature` header value.
 * @param secret Your webhook secret.
 */
export function verifyWebhook(
  rawBody: string | Uint8Array | ArrayBuffer,
  signatureHeader: string | null | undefined,
  secret: string,
): WebhookEvent {
  if (typeof secret !== 'string' || !secret) {
    throw new WebhookVerificationError('A webhook secret is required.');
  }
  if (typeof signatureHeader !== 'string' || !signatureHeader) {
    throw new WebhookVerificationError(`Missing ${WEBHOOK_SIGNATURE_HEADER} header.`);
  }
  const body = toBuffer(rawBody);
  const expected = createHmac('sha256', secret).update(body).digest('hex');

  // Compare in constant time. Unequal lengths can't match and reveal nothing about the secret.
  const suppliedBytes = Buffer.from(signatureHeader, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  const valid =
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
  if (!valid) throw new WebhookVerificationError('Invalid Doctronic webhook signature.');

  let envelope: unknown;
  try {
    envelope = JSON.parse(body.toString('utf8'));
  } catch {
    throw new WebhookVerificationError('The webhook body is not valid JSON.');
  }
  if (
    !isRecord(envelope) ||
    typeof envelope.eventId !== 'string' ||
    typeof envelope.event !== 'string' ||
    typeof envelope.occurredAt !== 'string' ||
    !('data' in envelope)
  ) {
    throw new WebhookVerificationError('The webhook body is not a Doctronic event envelope.');
  }
  return envelope as unknown as WebhookEvent;
}

function toBuffer(rawBody: string | Uint8Array | ArrayBuffer): Buffer {
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  if (rawBody instanceof ArrayBuffer) return Buffer.from(rawBody);
  if (rawBody instanceof Uint8Array) {
    return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
  }
  throw new WebhookVerificationError('`rawBody` must be a string, Uint8Array, or ArrayBuffer.');
}
