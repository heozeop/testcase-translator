import { Options } from '@mikro-orm/core';
import { MySqlDriver } from '@mikro-orm/mysql';

const config: Options = {
  driver: MySqlDriver,
  
  // Database connection
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  dbName: process.env.DB_NAME || 'testcase_translator',
  
  // Entities configuration
  entities: ['dist/entities'],
  entitiesTs: ['src/entities'],
  
  // Development settings
  debug: process.env.NODE_ENV !== 'production',
  allowGlobalContext: true,
  
  // Auto-create schema in development
  schemaGenerator: {
    disableForeignKeys: false,
    createForeignKeyConstraints: true,
  },
  
  // Connection pool
  pool: {
    min: 2,
    max: 10,
  },
  
  // Schema options
  charset: 'utf8mb4',
};

export default config;