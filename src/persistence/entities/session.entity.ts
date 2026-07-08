import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Server-side auth session; stores only the SHA-256 of the bearer token.
 * `brandId` is the authoritative tenant context for the request.
 */
@Entity({ name: 'sessions' })
@Index('uq_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('ix_sessions_user', ['userId'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'brand_id', type: 'varchar', length: 64 })
  brandId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
