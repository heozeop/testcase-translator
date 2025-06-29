import { MikroOrmModuleOptions } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { Migrator } from '@mikro-orm/migrations';
import * as entities from './entities';

const config: MikroOrmModuleOptions = {
  driver: PostgreSqlDriver,
  metadataProvider: TsMorphMetadataProvider,
  
  // Database connection
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  dbName: process.env.DB_NAME || 'testcase_translator',
  
  // Entities configuration
  entities: [entities.Project, entities.TestCase, entities.GeneratedCode, entities.GeneratedCodeFile, entities.ExplorationSession, entities.ExplorationResult, entities.ExecutionResult],
  entitiesTs: ['./src/entities/**/*.entity.ts'],
  
  // Development settings
  debug: process.env.NODE_ENV !== 'production',
  allowGlobalContext: true,
  
  // Migrations
  extensions: [Migrator],
  migrations: {
    path: './src/migrations',
    pathTs: './src/migrations',
    glob: '!(*.d).{js,ts}',
    transactional: true,
    disableForeignKeys: false,
    allOrNothing: true,
    dropTables: false,
    safe: true,
    snapshot: true,
    emit: 'ts',
  },
  
  // Connection pool
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
    propagateCreateError: false,
  },
  
  // Schema options
  driverOptions: {
    connection: {
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    },
  },
};

export default config;