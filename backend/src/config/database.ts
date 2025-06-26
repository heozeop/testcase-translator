import dotenv from 'dotenv';

dotenv.config();

export const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'testcase_translator',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  connectionString: process.env.DATABASE_URL,
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
  },
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

export function getDatabaseUrl(): string {
  if (databaseConfig.connectionString) {
    return databaseConfig.connectionString;
  }
  
  const { user, password, host, port, database } = databaseConfig;
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}