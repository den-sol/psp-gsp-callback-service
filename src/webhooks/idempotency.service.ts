import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { IdempotencyKey } from '../persistence/entities/idempotency-key.entity';

/** Payload fields checked (in order) when no Idempotency-Key header is sent. */
const EVENT_ID_FIELDS = ['id', 'event_id'] as const;

/**
 * Owns the `idempotency_keys` table and the rules for deriving a dedupe key
 * from an inbound callback. The unique `(brandId, scope, key)` constraint does
 * the actual dedupe; this service only inserts/reads rows around it.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
  ) {}

  /**
   * Explicit `Idempotency-Key` header wins; otherwise fall back to the
   * provider's event id in the payload (`id`, then `event_id`). Returns null
   * when no usable key exists — the caller rejects the request.
   */
  deriveKey(
    headerKey: string | undefined,
    payload: Record<string, unknown>,
  ): string | null {
    const header = headerKey?.trim();
    if (header) {
      return header;
    }
    for (const field of EVENT_ID_FIELDS) {
      const value = payload[field];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  }

  /**
   * Key-order-insensitive SHA-256 of the payload, stored alongside the key so
   * a key reused with a *different* payload can be rejected instead of
   * silently replayed.
   */
  hashRequest(payload: Record<string, unknown>): string {
    return createHash('sha256').update(stableStringify(payload)).digest('hex');
  }

  /**
   * Inserts the key row. Runs on the caller's transaction manager so the
   * reservation and the raw-event write commit (or roll back) together.
   * Throws the driver's unique-violation on a duplicate — callers translate.
   */
  async reserve(
    manager: EntityManager,
    row: Pick<
      IdempotencyKey,
      | 'brandId'
      | 'scope'
      | 'key'
      | 'requestHash'
      | 'responseStatus'
      | 'responseBody'
    >,
  ): Promise<void> {
    // Cast: TypeORM's QueryDeepPartialEntity chokes on jsonb columns typed
    // as Record<string, unknown>; the row shape is enforced by the Pick above.
    await manager.insert(
      IdempotencyKey,
      row as QueryDeepPartialEntity<IdempotencyKey>,
    );
  }

  /** Loads the stored row for the dedupe/replay path. Always brand-scoped. */
  findStored(
    brandId: string,
    scope: string,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return this.keys.findOne({ where: { brandId, scope, key } });
  }
}

/** JSON.stringify with recursively sorted object keys, so `{a,b}` === `{b,a}`. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
