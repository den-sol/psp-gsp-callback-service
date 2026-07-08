import { DataSourceOptions } from 'typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { RawEvent } from './entities/raw-event.entity';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { InitialSchema1700000000000 } from './migrations/1700000000000-InitialSchema';

/** Single source of truth for the Postgres connection (Nest + TypeORM CLI). */
export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'callbacks',
    entities: [User, Session, RawEvent, IdempotencyKey],
    migrations: [InitialSchema1700000000000],
    // Schema changes flow through migrations only, never auto-sync.
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}
