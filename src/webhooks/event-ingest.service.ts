import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { getCorrelationId } from '../common/correlation.context';
import {
  RawEvent,
  RawEventSource,
} from '../persistence/entities/raw-event.entity';
import { isUniqueViolation } from '../persistence/pg-errors';
import { IdempotencyService } from './idempotency.service';

export interface IngestCommand {
  brandId: string;
  source: RawEventSource;
  provider: string;
  /** Raw request body — validated here to be a JSON object. */
  payload: unknown;
  /** Optional `Idempotency-Key` header value. */
  headerKey?: string;
}

export interface IngestResult {
  status: number;
  body: { eventId: string; deduplicated: boolean };
}

/** Payload fields checked (in order) for a human-readable event type. */
const EVENT_TYPE_FIELDS = ['type', 'event_type', 'eventType'] as const;

/**
 * The outbox writer shared by the PSP and GSP adapters. A callback is only
 * ever persisted to `raw_events` — balances are never touched here. Dedupe is
 * enforced by reserving `(brandId, scope, key)` in `idempotency_keys` inside
 * the same transaction as the raw-event insert: a duplicate hits the unique
 * constraint, rolls everything back, and replays the stored response.
 */
@Injectable()
export class EventIngestService {
  private readonly logger = new Logger(EventIngestService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly idempotency: IdempotencyService,
  ) {}

  async ingest(cmd: IngestCommand): Promise<IngestResult> {
    const payload = this.assertJsonObject(cmd.payload);

    const key = this.idempotency.deriveKey(cmd.headerKey, payload);
    if (!key) {
      throw new BadRequestException(
        'Cannot derive an idempotency key: send an Idempotency-Key header ' +
          'or include an "id" / "event_id" field in the payload',
      );
    }
    if (key.length > 255) {
      throw new BadRequestException(
        'Idempotency key must be at most 255 characters',
      );
    }

    // Scoped per source+provider so e.g. psp/stripe and gsp/evolution can
    // both emit event id "evt-1" for the same brand without colliding.
    const scope = `webhook:${cmd.source}:${cmd.provider}`;
    const requestHash = this.idempotency.hashRequest(payload);
    const eventId = randomUUID();
    const body = { eventId, deduplicated: false };

    try {
      await this.dataSource.transaction(async (manager) => {
        // Reserve the key first: a duplicate fails here, before any other
        // write, and the whole transaction rolls back.
        await this.idempotency.reserve(manager, {
          brandId: cmd.brandId,
          scope,
          key,
          requestHash,
          responseStatus: HttpStatus.ACCEPTED,
          responseBody: body,
        });
        // Cast: same jsonb-vs-QueryDeepPartialEntity friction as in reserve().
        await manager.insert(RawEvent, {
          id: eventId,
          brandId: cmd.brandId,
          source: cmd.source,
          provider: cmd.provider,
          eventType: this.extractEventType(payload),
          idempotencyKey: key,
          payload,
          status: 'received',
          correlationId: getCorrelationId() ?? 'unknown',
        } as QueryDeepPartialEntity<RawEvent>);
        // TODO: ledger — hand the raw event to the ledger pipeline from here
        // (outbox consumer). Adapters must never mutate balances directly.
      });
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
      return this.replayStored(cmd.brandId, scope, key, requestHash);
    }

    this.logger.log(
      `Persisted ${cmd.source}/${cmd.provider} event ${eventId} for brand ${cmd.brandId}`,
    );
    return { status: HttpStatus.ACCEPTED, body };
  }

  /**
   * Dedupe path: the key already exists for this brand+scope. Replay the
   * stored response — unless the payload differs, which is a client bug and
   * gets a 409 rather than a silently-wrong replay.
   */
  private async replayStored(
    brandId: string,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<IngestResult> {
    const stored = await this.idempotency.findStored(brandId, scope, key);
    if (!stored) {
      // Unique violation without a visible row — the competing transaction
      // must have rolled back after we collided. Ask the caller to retry.
      throw new ConflictException(
        'Duplicate callback is being processed, retry shortly',
      );
    }
    if (stored.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different payload',
      );
    }
    const { eventId } = stored.responseBody as { eventId: string };
    this.logger.log(
      `Deduplicated ${scope} key "${key}" for brand ${brandId} (event ${eventId})`,
    );
    return { status: HttpStatus.OK, body: { eventId, deduplicated: true } };
  }

  private assertJsonObject(payload: unknown): Record<string, unknown> {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new BadRequestException('Payload must be a JSON object');
    }
    return payload as Record<string, unknown>;
  }

  private extractEventType(payload: Record<string, unknown>): string {
    for (const field of EVENT_TYPE_FIELDS) {
      const value = payload[field];
      if (typeof value === 'string' && value.trim()) {
        return value.trim().slice(0, 128);
      }
    }
    return 'unknown';
  }
}
