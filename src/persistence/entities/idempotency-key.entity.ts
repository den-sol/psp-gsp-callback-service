import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Dedupe backbone. The unique constraint on `(brandId, scope, key)` is what
 * makes duplicate callbacks safe: a second insert with the same key conflicts,
 * and we replay the stored response instead of re-persisting.
 */
@Entity({ name: 'idempotency_keys' })
@Index('uq_idempotency_brand_scope_key', ['brandId', 'scope', 'key'], {
  unique: true,
})
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 64 })
  brandId: string;

  @Column({ type: 'varchar', length: 64 })
  scope: string;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 128 })
  requestHash: string;

  @Column({ name: 'response_status', type: 'int' })
  responseStatus: number;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
