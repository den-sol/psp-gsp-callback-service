import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source-options';

/** Owns the DB connection; feature modules import `forFeature()` for their entities. */
@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions })],
})
export class PersistenceModule {}
