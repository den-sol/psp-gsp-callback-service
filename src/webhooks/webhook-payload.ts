import { BadRequestException } from '@nestjs/common';

/** Payload fields checked (in order) for a human-readable event type. */
const EVENT_TYPE_FIELDS = ['type', 'event_type', 'eventType'] as const;

/**
 * Deliberately loose contract: any JSON object is persisted verbatim (provider
 * schemas vary; the outbox must not drop unknown fields). The only hard
 * requirements are an object shape and a derivable idempotency key.
 */
export function parseWebhookPayload(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Payload must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/** Best-effort event type; never rejects. */
export function extractEventType(payload: Record<string, unknown>): string {
  for (const field of EVENT_TYPE_FIELDS) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, 128);
    }
  }
  return 'unknown';
}
