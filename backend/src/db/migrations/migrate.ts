import fs from 'fs';
import path from 'path';
import { query, transaction } from '../index';

export interface Migration {
  filename: string;
  up: string;
  down?: string;
}

const MIGRATIONS_DIR = path.join(__dirname, '.');
const MIGRATION_PATTERN = /^\d{3}_.*\.sql$/;

export async function getMigrations(): Promise<Migration[]> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => MIGRATION_PATTERN.test(file))
    .sort();

  const migrations: Migration[] = [];

  for (const file of files) {
    const upPath = path.join(MIGRATIONS_DIR, file);
    const downPath = path.join(MIGRATIONS_DIR, file.replace('.sql', '.down.sql'));
    
    const up = fs.readFileSync(upPath, 'utf8');
    const down = fs.existsSync(downPath) ? fs.readFileSync(downPath, 'utf8') : undefined;
    
    migrations.push({
      filename: file,
      up,
      down
    });
  }

  return migrations;
}

export async function getAppliedMigrations(): Promise<string[]> {
  try {
    const result = await query('SELECT filename FROM migrations ORDER BY applied_at');
    return result.rows.map(row => row.filename);
  } catch (error) {
    // If migrations table doesn't exist, return empty array
    return [];
  }
}

export async function createMigrationsTable(): Promise<void> {
  const migrationTableSql = fs.readFileSync(
    path.join(MIGRATIONS_DIR, '000_migrations_table.sql'),
    'utf8'
  );
  await query(migrationTableSql);
}

export async function applyMigration(migration: Migration): Promise<void> {
  await transaction(async (client) => {
    // Apply the migration
    await client.query(migration.up);
    
    // Record the migration as applied
    await client.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      [migration.filename]
    );
    
    console.log(`Applied migration: ${migration.filename}`);
  });
}

export async function rollbackMigration(migration: Migration): Promise<void> {
  if (!migration.down) {
    throw new Error(`No rollback script found for migration: ${migration.filename}`);
  }

  await transaction(async (client) => {
    // Rollback the migration
    await client.query(migration.down!);
    
    // Remove the migration from applied migrations
    await client.query(
      'DELETE FROM migrations WHERE filename = $1',
      [migration.filename]
    );
    
    console.log(`Rolled back migration: ${migration.filename}`);
  });
}

export async function migrate(): Promise<void> {
  console.log('Starting database migration...');
  
  // Create migrations table if it doesn't exist
  await createMigrationsTable();
  
  const allMigrations = await getMigrations();
  const appliedMigrations = await getAppliedMigrations();
  
  const pendingMigrations = allMigrations.filter(
    migration => !appliedMigrations.includes(migration.filename)
  );
  
  if (pendingMigrations.length === 0) {
    console.log('No pending migrations found.');
    return;
  }
  
  console.log(`Found ${pendingMigrations.length} pending migrations.`);
  
  for (const migration of pendingMigrations) {
    await applyMigration(migration);
  }
  
  console.log('Migration completed successfully.');
}

export async function rollback(steps: number = 1): Promise<void> {
  console.log(`Rolling back ${steps} migration(s)...`);
  
  const allMigrations = await getMigrations();
  const appliedMigrations = await getAppliedMigrations();
  
  const migrationsToRollback = appliedMigrations
    .slice(-steps)
    .reverse()
    .map(filename => allMigrations.find(m => m.filename === filename)!)
    .filter(Boolean);
  
  if (migrationsToRollback.length === 0) {
    console.log('No migrations to rollback.');
    return;
  }
  
  for (const migration of migrationsToRollback) {
    await rollbackMigration(migration);
  }
  
  console.log('Rollback completed successfully.');
}

export async function getMigrationStatus(): Promise<{applied: string[], pending: string[]}> {
  const allMigrations = await getMigrations();
  const appliedMigrations = await getAppliedMigrations();
  
  const applied = appliedMigrations;
  const pending = allMigrations
    .filter(migration => !appliedMigrations.includes(migration.filename))
    .map(migration => migration.filename);
  
  return { applied, pending };
}