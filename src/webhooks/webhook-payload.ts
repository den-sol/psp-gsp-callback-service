import { BadRequestException } from '@nestjs/common';

/** Payload fields checked (in order) for a human-readable event type. */
const EVENT_TYPE_FIELDS = ['type', 'event_type', 'eventType'] as const;

/**
 * The (deliberately loose) payload contract for PSP/GSP callbacks: any JSON
 * *object* is accepted and persisted verbatim — provider schemas vary and the
 * outbox must not drop fields it doesn't know. The only hard requirements are
 * enforced at ingest: an object shape (here) and a derivable idempotency key
 * (IdempotencyService). The contract test pins this against real-world
 * provider fixtures.
 */
export function parseWebhookPayload(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Payload must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/** Best-effort event type for the raw_events row; never rejects. */
export function extractEventType(payload: Record<string, unknown>): string {
  for (const field of EVENT_TYPE_FIELDS) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 128);
    }
  }
  return 'unknown';
}
