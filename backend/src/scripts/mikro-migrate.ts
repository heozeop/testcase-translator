#!/usr/bin/env ts-node

import { MikroORM } from '@mikro-orm/core';
import config from '../config/migration.config';

async function main() {
  const command = process.argv[2];
  
  let orm: MikroORM | undefined;
  
  try {
    // Initialize MikroORM
    orm = await MikroORM.init(config);
    const migrator = orm.getMigrator();
    
    switch (command) {
      case 'up':
      case 'migrate':
        console.log('Running pending migrations...');
        const migrations = await migrator.up();
        if (migrations.length === 0) {
          console.log('No pending migrations found.');
        } else {
          console.log(`Applied ${migrations.length} migration(s):`);
          migrations.forEach(migration => console.log(`  ✓ ${migration.name}`));
        }
        break;
      
      case 'down':
      case 'rollback':
        const steps = parseInt(process.argv[3] || '1', 10);
        console.log(`Rolling back ${steps} migration(s)...`);
        const rolledBack = await migrator.down({ to: 0 }); // Rollback all or specific number
        console.log(`Rolled back ${rolledBack.length} migration(s):`);
        rolledBack.forEach(migration => console.log(`  ✓ ${migration.name}`));
        break;
      
      case 'list':
      case 'status':
        const executed = await migrator.getExecutedMigrations();
        const pending = await migrator.getPendingMigrations();
        
        console.log('Migration Status:');
        console.log('\nApplied migrations:');
        if (executed.length === 0) {
          console.log('  (none)');
        } else {
          executed.forEach(migration => console.log(`  ✓ ${migration.name}`));
        }
        
        console.log('\nPending migrations:');
        if (pending.length === 0) {
          console.log('  (none)');
        } else {
          pending.forEach(migration => console.log(`  ○ ${migration.name}`));
        }
        break;
      
      case 'create':
        const migrationName = process.argv[3];
        if (!migrationName) {
          console.error('Migration name is required. Usage: npm run mikro:create <name>');
          process.exit(1);
        }
        console.log(`Creating migration: ${migrationName}`);
        const createdMigration = await migrator.createMigration(undefined, false, false);
        console.log(`Created migration: ${createdMigration.fileName}`);
        break;
      
      case 'reset':
        console.log('Resetting database (dropping all tables)...');
        await migrator.down({ to: 0 });
        console.log('Database reset complete.');
        break;
      
      default:
        console.log('Usage:');
        console.log('  npm run mikro:migrate up       - Apply pending migrations');
        console.log('  npm run mikro:migrate down [n] - Rollback n migrations (default: 1)');
        console.log('  npm run mikro:migrate status   - Show migration status');
        console.log('  npm run mikro:migrate create <name> - Create new migration');
        console.log('  npm run mikro:migrate reset    - Reset database (rollback all)');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    if (orm) {
      await orm.close();
    }
  }
}

main();