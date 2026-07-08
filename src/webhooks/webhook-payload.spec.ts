import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { IdempotencyKey } from '../persistence/entities/idempotency-key.entity';
import { IdempotencyService } from './idempotency.service';
import { extractEventType, parseWebhookPayload } from './webhook-payload';

/**
 * Contract test for the webhook payload schema, pinned against known-good and
 * known-bad provider-shaped fixtures. The contract: any JSON object with a
 * derivable idempotency key ingests (extra fields preserved, never stripped);
 * everything else is rejected before touching storage.
 */
describe('webhook payload contract', () => {
  const idempotency = new IdempotencyService(
    undefined as unknown as Repository<IdempotencyKey>,
  );

  const KNOWN_GOOD: {
    name: string;
    payload: Record<string, unknown>;
    expectedKey: string;
    expectedType: string;
  }[] = [
    {
      name: 'stripe-style PSP event (id + type)',
      payload: {
        id: 'evt_1NirD82eZvKYlo2CIabcdef',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: { object: { amount: 2000, currency: 'usd' } },
        livemode: false,
      },
      expectedKey: 'evt_1NirD82eZvKYlo2CIabcdef',
      expectedType: 'payment_intent.succeeded',
    },
    {
      name: 'adyen-style PSP notification (event_id + eventType)',
      payload: {
        event_id: '8515131751004933',
        eventType: 'AUTHORISATION',
        amount: { value: 1000, currency: 'EUR' },
        pspReference: '8515131751004933',
        success: 'true',
      },
      expectedKey: '8515131751004933',
      expectedType: 'AUTHORISATION',
    },
    {
      name: 'GSP round event (event_id + event_type, numeric fields)',
      payload: {
        event_id: 'rnd-77-settle',
        event_type: 'round.completed',
        round_id: 77,
        bet: 5,
        win: 12.5,
        player: { id: 'p-1', brand: 'brand-a' },
      },
      expectedKey: 'rnd-77-settle',
      expectedType: 'round.completed',
    },
    {
      name: 'numeric event id, no type field',
      payload: { id: 424242, amount: 1 },
      expectedKey: '424242',
      expectedType: 'unknown',
    },
  ];

  const KNOWN_BAD: { name: string; body: unknown }[] = [
    { name: 'null body', body: null },
    { name: 'JSON array', body: [{ id: 'evt-1' }] },
    { name: 'bare string', body: 'id=evt-1' },
    { name: 'bare number', body: 42 },
  ];

  describe('known-good provider payloads ingest', () => {
    it.each(KNOWN_GOOD)('$name', ({ payload, expectedKey, expectedType }) => {
      const parsed = parseWebhookPayload(payload);
      // Persisted verbatim — the contract never strips unknown fields.
      expect(parsed).toBe(payload);
      expect(idempotency.deriveKey(undefined, parsed)).toBe(expectedKey);
      expect(extractEventType(parsed)).toBe(expectedType);
    });
  });

  describe('known-bad payloads are rejected as 400', () => {
    it.each(KNOWN_BAD)('$name', ({ body }) => {
      expect(() => parseWebhookPayload(body)).toThrow(BadRequestException);
    });

    it('object without any event id yields no key (ingest rejects it)', () => {
      const parsed = parseWebhookPayload({ type: 'payment.settled' });
      expect(idempotency.deriveKey(undefined, parsed)).toBeNull();
    });
  });

  it('truncates oversized event types to the column limit (128)', () => {
    const parsed = parseWebhookPayload({ id: 'e1', type: 'x'.repeat(300) });
    expect(extractEventType(parsed)).toHaveLength(128);
  });
});
