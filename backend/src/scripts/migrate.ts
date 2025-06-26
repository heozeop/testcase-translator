#!/usr/bin/env ts-node

import { migrate, rollback, getMigrationStatus } from '../db/migrations/migrate';
import { closePool } from '../db';

async function main() {
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'up':
      case 'migrate':
        await migrate();
        break;
      
      case 'down':
      case 'rollback':
        const steps = parseInt(process.argv[3] || '1', 10);
        await rollback(steps);
        break;
      
      case 'status':
        const status = await getMigrationStatus();
        console.log('Applied migrations:');
        status.applied.forEach(migration => console.log(`  ✓ ${migration}`));
        console.log('\nPending migrations:');
        status.pending.forEach(migration => console.log(`  ○ ${migration}`));
        break;
      
      default:
        console.log('Usage:');
        console.log('  npm run migrate up     - Apply pending migrations');
        console.log('  npm run migrate down [steps]  - Rollback migrations');
        console.log('  npm run migrate status - Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();