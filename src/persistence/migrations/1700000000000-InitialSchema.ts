import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: users, sessions, raw_events (outbox), idempotency_keys.
 * Hand-written so the dedupe/unique constraints are explicit and reviewable.
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() lives in pgcrypto on older PGs; harmless if present.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brand_id" varchar(64) NOT NULL,
        "email" varchar(320) NOT NULL,
        "password_hash" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_brand_email" ON "users" ("brand_id", "email")
    `);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "brand_id" varchar(64) NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        CONSTRAINT "pk_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_sessions_token_hash" ON "sessions" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_sessions_user" ON "sessions" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "raw_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brand_id" varchar(64) NOT NULL,
        "source" varchar(8) NOT NULL,
        "provider" varchar(64) NOT NULL,
        "event_type" varchar(128) NOT NULL,
        "idempotency_key" varchar(255) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'received',
        "correlation_id" varchar(64) NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_raw_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_raw_events_brand_status" ON "raw_events" ("brand_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brand_id" varchar(64) NOT NULL,
        "scope" varchar(64) NOT NULL,
        "key" varchar(255) NOT NULL,
        "request_hash" varchar(128) NOT NULL,
        "response_status" int NOT NULL,
        "response_body" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_idempotency_keys" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_idempotency_brand_scope_key"
        ON "idempotency_keys" ("brand_id", "scope", "key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP TABLE "raw_events"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
