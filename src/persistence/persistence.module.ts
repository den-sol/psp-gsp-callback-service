import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source-options';

/**
 * Owns all DB access. Feature modules import `TypeOrmModule.forFeature([...])`
 * for their entities; nothing else opens a connection.
 */
@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: buildDataSourceOptions })],
})
export class PersistenceModule {}
