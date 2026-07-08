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
import { extractEventType, parseWebhookPayload } from './webhook-payload';

export interface IngestCommand {
  brandId: string;
  source: RawEventSource;
  provider: string;
  payload: unknown;
  /** `Idempotency-Key` header value, if sent. */
  headerKey?: string;
}

export interface IngestResult {
  status: number;
  body: { eventId: string; deduplicated: boolean };
}

/**
 * Outbox writer shared by the PSP/GSP adapters: persists callbacks to
 * `raw_events` and dedupes by reserving the key in the same transaction.
 * Balances are never touched here.
 */
@Injectable()
export class EventIngestService {
  private readonly logger = new Logger(EventIngestService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly idempotency: IdempotencyService,
  ) {}

  async ingest(cmd: IngestCommand): Promise<IngestResult> {
    const payload = parseWebhookPayload(cmd.payload);

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

    // Per source+provider, so different providers can emit colliding event ids.
    const scope = `webhook:${cmd.source}:${cmd.provider}`;
    const requestHash = this.idempotency.hashRequest(payload);
    const eventId = randomUUID();
    const body = { eventId, deduplicated: false };

    try {
      await this.dataSource.transaction(async (manager) => {
        // Reserve the key first so a duplicate fails before any other write.
        await this.idempotency.reserve(manager, {
          brandId: cmd.brandId,
          scope,
          key,
          requestHash,
          responseStatus: HttpStatus.ACCEPTED,
          responseBody: body,
        });
        // Cast: QueryDeepPartialEntity mishandles jsonb Record columns.
        await manager.insert(RawEvent, {
          id: eventId,
          brandId: cmd.brandId,
          source: cmd.source,
          provider: cmd.provider,
          eventType: extractEventType(payload),
          idempotencyKey: key,
          payload,
          status: 'received',
          correlationId: getCorrelationId() ?? 'unknown',
        } as QueryDeepPartialEntity<RawEvent>);
        // TODO: ledger — outbox consumer hooks in here; adapters never mutate balances.
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

  /** Replays the stored response; a different payload under the same key is a 409. */
  private async replayStored(
    brandId: string,
    scope: string,
    key: string,
    requestHash: string,
  ): Promise<IngestResult> {
    const stored = await this.idempotency.findStored(brandId, scope, key);
    if (!stored) {
      // Collision but no visible row: the competing tx rolled back; retry.
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
}
