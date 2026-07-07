import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RawEventSource = 'psp' | 'gsp';
export type RawEventStatus = 'received' | 'processed';

/**
 * Outbox row for an inbound PSP/GSP callback. Callbacks are only ever
 * persisted here (`status: received`) — balances are never mutated inline. A
 * future ledger worker consumes these and flips them to `processed`.
 */
@Entity({ name: 'raw_events' })
@Index('ix_raw_events_brand_status', ['brandId', 'status'])
export class RawEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 64 })
  brandId: string;

  @Column({ type: 'varchar', length: 8 })
  source: RawEventSource;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ name: 'event_type', type: 'varchar', length: 128 })
  eventType: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'received' })
  status: RawEventStatus;

  @Column({ name: 'correlation_id', type: 'varchar', length: 64 })
  correlationId: string;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
