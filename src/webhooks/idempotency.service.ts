import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { IdempotencyKey } from '../persistence/entities/idempotency-key.entity';

/** Payload fields checked (in order) when no Idempotency-Key header is sent. */
const EVENT_ID_FIELDS = ['id', 'event_id'] as const;

/**
 * Owns `idempotency_keys` and the dedupe-key rules; the unique
 * `(brandId, scope, key)` constraint does the actual dedupe.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
  ) {}

  /** Header wins, else the provider event id (`id`, then `event_id`); null → caller rejects. */
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

  /** Key-order-insensitive hash, so key reuse with a different payload can be rejected. */
  hashRequest(payload: Record<string, unknown>): string {
    return createHash('sha256').update(stableStringify(payload)).digest('hex');
  }

  /**
   * Runs on the caller's transaction so reservation and raw-event write
   * commit or roll back together. Throws a unique-violation on duplicates.
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
    // Cast: QueryDeepPartialEntity mishandles jsonb Record columns.
    await manager.insert(
      IdempotencyKey,
      row as QueryDeepPartialEntity<IdempotencyKey>,
    );
  }

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
