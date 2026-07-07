import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

// Standalone data-source used by the TypeORM CLI (migration:run / :generate /
// :revert). Nest loads env via ConfigModule; the CLI loads it here.
config();

export default new DataSource(buildDataSourceOptions());
