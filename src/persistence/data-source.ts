import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

// Standalone data-source for the TypeORM CLI; loads env itself.
config();

export default new DataSource(buildDataSourceOptions());
