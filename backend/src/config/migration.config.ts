import { Options } from '@mikro-orm/core';
import { MySqlDriver } from '@mikro-orm/mysql';
import { Migrator } from '@mikro-orm/migrations';

const migrationConfig: Options = {
  driver: MySqlDriver,

  // Database connection
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  dbName: process.env.DB_NAME || 'testcase_translator',

  // Entities configuration
  entities: ['./dist/models/**/*.entity.js'],
  entitiesTs: ['./src/models/**/*.entity.ts'],

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

  // Smaller connection pool for migrations
  pool: {
    min: 1,
    max: 2,
    acquireTimeoutMillis: 20000,
    createTimeoutMillis: 10000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
    propagateCreateError: false,
  },

  // Schema options
  charset: 'utf8mb4',
  driverOptions: {
    connection: {
      timezone: '+00:00',
    },
  },
};

export default migrationConfig;
