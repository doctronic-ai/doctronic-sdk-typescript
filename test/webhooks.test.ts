import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { WebhookVerificationError, isKnownWebhookEvent, verifyWebhook } from '../src/index.js';

const SECRET = 'whsec_test_not_a_real_secret';

// The sample delivery from the docs' "Test your receiver" section.
const BODY =
  '{"eventId":"0f8fad5b-d9cb-469f-a165-70867728950e","event":"appointment.call_ended","occurredAt":"2026-08-25T19:05:00Z","data":{"appointmentId":"dc_01K1EXAMPLE00000000000000","userId":"mem_01K6JGGM2G2DB4Y9KB9H9MJJ6Q"}}';

function sign(body: string | Buffer, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyWebhook', () => {
  it('returns the typed envelope for a valid signature', () => {
    const event = verifyWebhook(BODY, sign(BODY), SECRET);
    expect(event).toEqual({
      eventId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      event: 'appointment.call_ended',
      occurredAt: '2026-08-25T19:05:00Z',
      data: {
        appointmentId: 'dc_01K1EXAMPLE00000000000000',
        userId: 'mem_01K6JGGM2G2DB4Y9KB9H9MJJ6Q',
      },
    });
    expect(isKnownWebhookEvent(event)).toBe(true);
  });

  it('accepts the raw body as a Buffer, Uint8Array view, or ArrayBuffer', () => {
    const bytes = Buffer.from(BODY, 'utf8');
    const padded = new Uint8Array(bytes.length + 8);
    padded.set(bytes, 4);
    const view = padded.subarray(4, 4 + bytes.length);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    for (const body of [bytes, view, arrayBuffer]) {
      expect(verifyWebhook(body, sign(BODY), SECRET).eventId).toBe(
        '0f8fad5b-d9cb-469f-a165-70867728950e',
      );
    }
  });

  it('rejects a tampered body', () => {
    const tampered = BODY.replace('call_ended', 'practitioner_joined');
    expect(() => verifyWebhook(tampered, sign(BODY), SECRET)).toThrow(WebhookVerificationError);
  });

  it('rejects a re-serialized body', () => {
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(() => verifyWebhook(reserialized, sign(BODY), SECRET)).toThrow(WebhookVerificationError);
  });

  it('rejects the wrong secret', () => {
    expect(() => verifyWebhook(BODY, sign(BODY, 'another-secret'), SECRET)).toThrow(
      WebhookVerificationError,
    );
  });

  it('rejects a missing, truncated, or uppercase signature', () => {
    const signature = sign(BODY);
    for (const header of [undefined, null, '', signature.slice(0, -2), signature.toUpperCase()]) {
      expect(() => verifyWebhook(BODY, header, SECRET)).toThrow(WebhookVerificationError);
    }
  });

  it('requires a secret', () => {
    expect(() => verifyWebhook(BODY, sign(BODY, ''), '')).toThrow(/secret is required/);
  });

  it('passes unknown events through for a 2xx acknowledgement', () => {
    const body =
      '{"eventId":"e1","event":"appointment.rescheduled","occurredAt":"2026-08-25T19:05:00Z","data":{"x":1}}';
    const event = verifyWebhook(body, sign(body), SECRET);
    expect(event.event).toBe('appointment.rescheduled');
    expect(isKnownWebhookEvent(event)).toBe(false);
  });

  it('types each documented event', () => {
    const body =
      '{"eventId":"e2","event":"artifact.ready","occurredAt":"2026-08-25T19:05:00Z","data":{"artifactId":"art_1","artifactType":"soap_note","chatId":"chat_1","userId":null}}';
    const event = verifyWebhook(body, sign(body), SECRET);
    if (!isKnownWebhookEvent(event)) throw new Error('expected a known event');
    switch (event.event) {
      case 'artifact.ready':
        expect(event.data.artifactType).toBe('soap_note');
        expect(event.data.userId).toBeNull();
        break;
      default:
        throw new Error(`unexpected ${event.event}`);
    }
  });

  it('rejects a signed body that is not an envelope', () => {
    for (const body of ['[]', '{"event":"x"}', 'not json']) {
      expect(() => verifyWebhook(body, sign(body), SECRET)).toThrow(WebhookVerificationError);
    }
  });
});
