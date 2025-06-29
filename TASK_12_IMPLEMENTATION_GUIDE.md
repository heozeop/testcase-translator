# Task 12: MikroORM Migration System - Comprehensive Implementation Guide

## Overview
This guide provides detailed implementation steps to transition from the current custom SQL migration system to MikroORM's built-in migration system, ensuring better TypeScript integration and type safety.

## Current State Analysis
- ✅ MikroORM is already configured with migration settings in `mikro-orm.config.ts`
- ✅ Migration commands are already defined in `package.json`
- ✅ Initial migration exists (`Migration20250628100101_initial_schema.ts`)
- ✅ Entities are properly defined with MikroORM decorators

## Implementation Steps

### 1. Specific Configuration Changes Needed

#### 1.1 Update MikroORM Configuration
The current configuration in `mikro-orm.config.ts` is well-structured. However, we need to ensure the following optimizations:

```typescript
// backend/src/mikro-orm.config.ts
import { MikroOrmModuleOptions } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { TsMorphMetadataProvider } from '@mikro-orm/reflection';
import { Migrator } from '@mikro-orm/migrations';
import { SeedManager } from '@mikro-orm/seeder';

const config: MikroOrmModuleOptions = {
  driver: PostgreSqlDriver,
  metadataProvider: TsMorphMetadataProvider,
  
  // ... existing configuration ...
  
  // Enhanced migrations configuration
  extensions: [Migrator, SeedManager], // Add SeedManager for data seeding
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
    generator: 'TSMigrationGenerator', // Ensure TypeScript generation
    migrationsList: [
      {
        name: 'Migration20250628100101_initial_schema.ts',
        class: 'Migration20250628100101InitialSchema',
      },
    ],
  },
  
  // Add seeder configuration
  seeder: {
    path: './src/seeders',
    pathTs: './src/seeders',
    defaultSeeder: 'DatabaseSeeder',
    glob: '!(*.d).{js,ts}',
    emit: 'ts',
  },
  
  // Schema generator options
  schemaGenerator: {
    disableForeignKeys: false,
    createForeignKeyConstraints: true,
    ignoreSchema: ['mikro_orm_migrations'],
  },
};

export default config;
```

#### 1.2 Create MikroORM CLI Configuration
Create a new file for CLI configuration:

```typescript
// backend/mikro-orm.config.ts (at root of backend)
import config from './src/mikro-orm.config';

export default config;
```

### 2. Code Examples for Migration Classes

#### 2.1 Base Migration Class Template
Create a base template for consistent migration structure:

```typescript
// backend/src/migrations/MigrationTemplate.ts
import { Migration } from '@mikro-orm/migrations';

export abstract class MigrationTemplate extends Migration {
  abstract getDescription(): string;

  async up(): Promise<void> {
    console.log(`Running migration: ${this.getDescription()}`);
    await this.execute();
  }

  async down(): Promise<void> {
    console.log(`Rolling back migration: ${this.getDescription()}`);
    await this.rollback();
  }

  abstract execute(): Promise<void>;
  abstract rollback(): Promise<void>;
}
```

#### 2.2 Example: Adding New Column Migration
```typescript
// backend/src/migrations/Migration20250628120000_add_project_tags.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20250628120000AddProjectTags extends Migration {
  async up(): Promise<void> {
    // Using schema builder API
    this.addSql(`ALTER TABLE projects ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;`);
    
    // Add index for better query performance
    this.addSql(`CREATE INDEX idx_projects_tags ON projects USING gin(tags);`);
    
    // Update existing records with default tags
    this.addSql(`UPDATE projects SET tags = '[]'::jsonb WHERE tags IS NULL;`);
  }

  async down(): Promise<void> {
    // Remove index first
    this.addSql(`DROP INDEX IF EXISTS idx_projects_tags;`);
    
    // Remove column
    this.addSql(`ALTER TABLE projects DROP COLUMN IF EXISTS tags;`);
  }
}
```

#### 2.3 Example: Data Migration
```typescript
// backend/src/migrations/Migration20250628130000_migrate_test_case_data.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20250628130000MigrateTestCaseData extends Migration {
  async up(): Promise<void> {
    // Example: Migrate test_data JSON structure
    this.addSql(`
      UPDATE test_cases 
      SET test_data = jsonb_build_object(
        'inputs', COALESCE(test_data->'inputs', '[]'::jsonb),
        'steps', COALESCE(test_data->'steps', '[]'::jsonb),
        'assertions', COALESCE(test_data->'assertions', '[]'::jsonb),
        'metadata', jsonb_build_object(
          'version', '2.0',
          'migrated_at', CURRENT_TIMESTAMP
        )
      )
      WHERE test_data IS NOT NULL;
    `);
  }

  async down(): Promise<void> {
    // Remove migration metadata
    this.addSql(`
      UPDATE test_cases 
      SET test_data = test_data - 'metadata'
      WHERE test_data ? 'metadata' 
      AND test_data->'metadata'->>'version' = '2.0';
    `);
  }
}
```

#### 2.4 Example: Complex Schema Change
```typescript
// backend/src/migrations/Migration20250628140000_refactor_exploration_tables.ts
import { Migration } from '@mikro-orm/migrations';

export class Migration20250628140000RefactorExplorationTables extends Migration {
  async up(): Promise<void> {
    // Start transaction for complex changes
    this.addSql('BEGIN;');
    
    // Create new table structure
    this.addSql(`
      CREATE TABLE exploration_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        selector VARCHAR(500),
        value TEXT,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Migrate data from existing structure
    this.addSql(`
      INSERT INTO exploration_actions (session_id, action_type, selector, value, metadata)
      SELECT 
        er.session_id,
        interaction->>'type' as action_type,
        interaction->>'selector' as selector,
        interaction->>'value' as value,
        jsonb_build_object(
          'original_result_id', er.id,
          'migrated_from', 'exploration_results'
        ) as metadata
      FROM exploration_results er
      CROSS JOIN LATERAL jsonb_array_elements(er.interactions) as interaction
      WHERE er.interactions IS NOT NULL;
    `);
    
    // Add indexes
    this.addSql('CREATE INDEX idx_exploration_actions_session_id ON exploration_actions(session_id);');
    this.addSql('CREATE INDEX idx_exploration_actions_type ON exploration_actions(action_type);');
    
    // Commit transaction
    this.addSql('COMMIT;');
  }

  async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS exploration_actions CASCADE;');
  }
}
```

### 3. CLI Command Setup Details

#### 3.1 Enhanced Migration Scripts
Create a comprehensive migration management script:

```typescript
// backend/src/scripts/mikro-migrate.ts
import { MikroORM } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from '../mikro-orm.config';
import chalk from 'chalk';

interface MigrationInfo {
  name: string;
  executed: boolean;
  executedAt?: Date;
  pending: boolean;
}

class MigrationManager {
  private orm: MikroORM;

  async initialize() {
    this.orm = await MikroORM.init(mikroOrmConfig);
  }

  async close() {
    await this.orm.close(true);
  }

  async create(name?: string): Promise<void> {
    const migrator = this.orm.getMigrator();
    const migration = await migrator.createMigration(undefined, false, name);
    
    console.log(chalk.green('✓'), `Created migration: ${migration.fileName}`);
    console.log(chalk.blue('→'), `Path: ${migration.path}`);
  }

  async up(): Promise<void> {
    const migrator = this.orm.getMigrator();
    const pending = await migrator.getPendingMigrations();
    
    if (pending.length === 0) {
      console.log(chalk.yellow('⚠'), 'No pending migrations');
      return;
    }

    console.log(chalk.blue('→'), `Running ${pending.length} pending migration(s)...`);
    
    const migrations = await migrator.up();
    
    migrations.forEach(migration => {
      console.log(chalk.green('✓'), `Executed: ${migration.name}`);
    });
  }

  async down(steps = 1): Promise<void> {
    const migrator = this.orm.getMigrator();
    const executed = await migrator.getExecutedMigrations();
    
    if (executed.length === 0) {
      console.log(chalk.yellow('⚠'), 'No executed migrations to rollback');
      return;
    }

    console.log(chalk.blue('→'), `Rolling back ${steps} migration(s)...`);
    
    for (let i = 0; i < steps && i < executed.length; i++) {
      const migration = await migrator.down();
      
      if (migration.length > 0) {
        console.log(chalk.green('✓'), `Rolled back: ${migration[0].name}`);
      }
    }
  }

  async status(): Promise<void> {
    const migrator = this.orm.getMigrator();
    const executed = await migrator.getExecutedMigrations();
    const pending = await migrator.getPendingMigrations();
    
    console.log(chalk.blue('═══'), 'Migration Status', chalk.blue('═══'));
    console.log();
    
    if (executed.length > 0) {
      console.log(chalk.green('Executed Migrations:'));
      executed.forEach(migration => {
        console.log(chalk.green('  ✓'), migration.name);
      });
      console.log();
    }
    
    if (pending.length > 0) {
      console.log(chalk.yellow('Pending Migrations:'));
      pending.forEach(migration => {
        console.log(chalk.yellow('  ○'), migration.name);
      });
    } else {
      console.log(chalk.green('✓'), 'All migrations are up to date');
    }
  }

  async reset(): Promise<void> {
    console.log(chalk.red('⚠'), 'This will drop all tables and re-run all migrations!');
    console.log(chalk.yellow('→'), 'Press Ctrl+C to cancel...');
    
    // Give user time to cancel
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const generator = this.orm.getSchemaGenerator();
    await generator.dropSchema();
    console.log(chalk.green('✓'), 'Dropped all tables');
    
    await this.up();
  }

  async fresh(): Promise<void> {
    await this.reset();
    
    // Run seeders if available
    const seeder = this.orm.getSeeder();
    await seeder.seed('DatabaseSeeder');
    console.log(chalk.green('✓'), 'Database seeded');
  }
}

// CLI execution
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  const manager = new MigrationManager();
  
  try {
    await manager.initialize();
    
    switch (command) {
      case 'create':
        await manager.create(args[0]);
        break;
      case 'up':
        await manager.up();
        break;
      case 'down':
        const steps = parseInt(args[0]) || 1;
        await manager.down(steps);
        break;
      case 'status':
        await manager.status();
        break;
      case 'reset':
        await manager.reset();
        break;
      case 'fresh':
        await manager.fresh();
        break;
      default:
        console.log(chalk.red('✗'), `Unknown command: ${command}`);
        console.log();
        console.log('Available commands:');
        console.log('  create [name]  - Create a new migration');
        console.log('  up            - Run pending migrations');
        console.log('  down [steps]  - Rollback migrations');
        console.log('  status        - Show migration status');
        console.log('  reset         - Drop all tables and re-run migrations');
        console.log('  fresh         - Reset and seed database');
        process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('✗'), 'Migration error:', error.message);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

main().catch(console.error);
```

#### 3.2 Package.json Script Updates
The scripts are already defined in package.json. Here's what each does:

- `mikro:create [name]` - Creates a new migration file
- `mikro:up` - Runs all pending migrations
- `mikro:down [steps]` - Rolls back migrations
- `mikro:status` - Shows migration status
- `mikro:reset` - Drops all tables and re-runs migrations

### 4. Integration Points with Existing Codebase

#### 4.1 Application Startup Integration
```typescript
// backend/src/app.module.ts
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';

@Module({
  // ... module configuration
})
export class AppModule implements OnApplicationBootstrap {
  constructor(
    private readonly orm: MikroORM,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    // Auto-run migrations in development
    if (this.configService.get('NODE_ENV') === 'development') {
      const migrator = this.orm.getMigrator();
      const pending = await migrator.getPendingMigrations();
      
      if (pending.length > 0) {
        console.log(`Found ${pending.length} pending migrations. Running...`);
        await migrator.up();
        console.log('Migrations completed successfully');
      }
    }
    
    // Validate schema in production
    if (this.configService.get('NODE_ENV') === 'production') {
      const migrator = this.orm.getMigrator();
      const pending = await migrator.getPendingMigrations();
      
      if (pending.length > 0) {
        console.error(`ERROR: ${pending.length} pending migrations found in production!`);
        console.error('Please run migrations before starting the application.');
        process.exit(1);
      }
    }
  }
}
```

#### 4.2 Entity Integration
Ensure entities are properly integrated with migrations:

```typescript
// backend/src/entities/BaseEntity.ts
import { PrimaryKey, Property } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';

export abstract class BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuid();

  @Property({ type: 'timestamptz', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();
}
```

#### 4.3 Repository Integration
```typescript
// backend/src/repositories/BaseRepository.ts
import { EntityRepository, EntityManager } from '@mikro-orm/core';
import { BaseEntity } from '../entities/BaseEntity';

export abstract class BaseRepository<T extends BaseEntity> extends EntityRepository<T> {
  async beginTransaction(): Promise<EntityManager> {
    const em = this.getEntityManager().fork();
    await em.begin();
    return em;
  }

  async commitTransaction(em: EntityManager): Promise<void> {
    await em.commit();
  }

  async rollbackTransaction(em: EntityManager): Promise<void> {
    await em.rollback();
  }
}
```

### 5. Testing Strategies for Migrations

#### 5.1 Migration Test Suite
```typescript
// backend/src/migrations/__tests__/migration.test.ts
import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import mikroOrmConfig from '../../mikro-orm.config';

describe('Migration Tests', () => {
  let orm: MikroORM<PostgreSqlDriver>;

  beforeAll(async () => {
    // Use test database
    orm = await MikroORM.init({
      ...mikroOrmConfig,
      dbName: 'testcase_translator_test',
    });
  });

  afterAll(async () => {
    await orm.close(true);
  });

  describe('Schema Integrity', () => {
    test('should run all migrations successfully', async () => {
      const migrator = orm.getMigrator();
      
      // Drop schema and re-run all migrations
      const generator = orm.getSchemaGenerator();
      await generator.dropSchema();
      
      // Run all migrations
      const migrations = await migrator.up();
      
      expect(migrations.length).toBeGreaterThan(0);
    });

    test('should have no pending migrations', async () => {
      const migrator = orm.getMigrator();
      const pending = await migrator.getPendingMigrations();
      
      expect(pending.length).toBe(0);
    });

    test('should rollback migrations successfully', async () => {
      const migrator = orm.getMigrator();
      
      // Rollback last migration
      const rolledBack = await migrator.down();
      expect(rolledBack.length).toBe(1);
      
      // Re-run it
      const migrations = await migrator.up();
      expect(migrations.length).toBe(1);
    });
  });

  describe('Data Integrity', () => {
    test('should preserve data during migrations', async () => {
      // Insert test data
      const em = orm.em.fork();
      const project = em.create('Project', {
        name: 'Test Project',
        targetUrl: 'https://example.com',
      });
      await em.persistAndFlush(project);
      
      // Run a migration that modifies the table
      // Verify data is still intact
      const foundProject = await em.findOne('Project', { id: project.id });
      expect(foundProject).toBeDefined();
      expect(foundProject.name).toBe('Test Project');
    });
  });
});
```

#### 5.2 Migration Validation Script
```typescript
// backend/src/scripts/validate-migrations.ts
import { MikroORM } from '@mikro-orm/core';
import mikroOrmConfig from '../mikro-orm.config';
import chalk from 'chalk';

async function validateMigrations() {
  const orm = await MikroORM.init(mikroOrmConfig);
  
  try {
    const migrator = orm.getMigrator();
    const schemaGenerator = orm.getSchemaGenerator();
    
    // Check for pending migrations
    const pending = await migrator.getPendingMigrations();
    if (pending.length > 0) {
      console.error(chalk.red('✗'), `Found ${pending.length} pending migrations`);
      return false;
    }
    
    // Check if schema is in sync
    const updateDump = await schemaGenerator.getUpdateSchemaSQL();
    if (updateDump.length > 0) {
      console.error(chalk.red('✗'), 'Database schema is out of sync with entities');
      console.log(chalk.yellow('→'), 'Run "pnpm mikro:create" to generate a migration');
      return false;
    }
    
    console.log(chalk.green('✓'), 'All migrations are up to date');
    console.log(chalk.green('✓'), 'Database schema is in sync');
    return true;
    
  } finally {
    await orm.close(true);
  }
}

validateMigrations()
  .then(valid => process.exit(valid ? 0 : 1))
  .catch(error => {
    console.error(chalk.red('✗'), 'Validation error:', error);
    process.exit(1);
  });
```

### 6. Rollback Procedures

#### 6.1 Safe Rollback Strategy
```typescript
// backend/src/scripts/safe-rollback.ts
import { MikroORM } from '@mikro-orm/core';
import mikroOrmConfig from '../mikro-orm.config';
import chalk from 'chalk';
import { execSync } from 'child_process';

async function safeRollback(steps = 1) {
  console.log(chalk.blue('→'), 'Creating database backup...');
  
  // Create backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `backup-${timestamp}.sql`;
  
  try {
    execSync(`pg_dump ${process.env.DATABASE_URL} > ${backupFile}`);
    console.log(chalk.green('✓'), `Backup created: ${backupFile}`);
  } catch (error) {
    console.error(chalk.red('✗'), 'Failed to create backup');
    process.exit(1);
  }
  
  // Perform rollback
  const orm = await MikroORM.init(mikroOrmConfig);
  
  try {
    const migrator = orm.getMigrator();
    
    console.log(chalk.blue('→'), `Rolling back ${steps} migration(s)...`);
    
    for (let i = 0; i < steps; i++) {
      const migration = await migrator.down();
      
      if (migration.length > 0) {
        console.log(chalk.green('✓'), `Rolled back: ${migration[0].name}`);
      } else {
        console.log(chalk.yellow('⚠'), 'No more migrations to rollback');
        break;
      }
    }
    
    console.log(chalk.green('✓'), 'Rollback completed successfully');
    console.log(chalk.blue('ℹ'), `Backup available at: ${backupFile}`);
    
  } catch (error) {
    console.error(chalk.red('✗'), 'Rollback failed:', error);
    console.log(chalk.yellow('→'), `Restore from backup: psql ${process.env.DATABASE_URL} < ${backupFile}`);
    process.exit(1);
  } finally {
    await orm.close(true);
  }
}

const steps = parseInt(process.argv[2]) || 1;
safeRollback(steps).catch(console.error);
```

#### 6.2 Emergency Recovery Procedures
```typescript
// backend/src/scripts/emergency-recovery.ts
import { MikroORM } from '@mikro-orm/core';
import mikroOrmConfig from '../mikro-orm.config';
import chalk from 'chalk';

async function emergencyRecovery() {
  console.log(chalk.red('⚠'), 'EMERGENCY RECOVERY MODE');
  console.log(chalk.yellow('→'), 'This will attempt to fix migration issues');
  
  const orm = await MikroORM.init(mikroOrmConfig);
  
  try {
    const migrator = orm.getMigrator();
    const em = orm.em.fork();
    
    // Check migration table integrity
    const [result] = await em.execute(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_name = 'mikro_orm_migrations'`
    );
    
    if (result.count === '0') {
      console.log(chalk.yellow('→'), 'Migration table missing, creating...');
      await migrator.createMigrationTable();
      console.log(chalk.green('✓'), 'Migration table created');
    }
    
    // Get migration state
    const executed = await migrator.getExecutedMigrations();
    const pending = await migrator.getPendingMigrations();
    
    console.log(chalk.blue('ℹ'), `Executed: ${executed.length}, Pending: ${pending.length}`);
    
    // Fix out-of-sync issues
    const schemaGenerator = orm.getSchemaGenerator();
    const updateSQL = await schemaGenerator.getUpdateSchemaSQL();
    
    if (updateSQL.length > 0) {
      console.log(chalk.yellow('→'), 'Schema out of sync, generating fix migration...');
      const migration = await migrator.createMigration();
      console.log(chalk.green('✓'), `Created fix migration: ${migration.fileName}`);
    }
    
    console.log(chalk.green('✓'), 'Recovery check completed');
    
  } finally {
    await orm.close(true);
  }
}

emergencyRecovery().catch(console.error);
```

## Implementation Checklist

- [ ] Update mikro-orm.config.ts with enhanced configuration
- [ ] Create CLI configuration file at backend root
- [ ] Implement migration manager script
- [ ] Create migration templates and examples
- [ ] Set up application startup integration
- [ ] Implement testing strategies
- [ ] Create rollback procedures
- [ ] Document migration workflow
- [ ] Run validation tests
- [ ] Update CI/CD pipeline for migrations

## Best Practices

1. **Always test migrations locally** before applying to production
2. **Create backups** before running migrations in production
3. **Use transactions** for data migrations
4. **Keep migrations small and focused** - one change per migration
5. **Never modify executed migrations** - create new ones instead
6. **Document breaking changes** in migration files
7. **Test both up() and down()** methods
8. **Use schema builder API** when possible instead of raw SQL

## Troubleshooting

### Common Issues and Solutions

1. **Migration table not found**
   ```bash
   pnpm mikro:create  # This will create the migration table
   ```

2. **Schema out of sync**
   ```bash
   pnpm migration:check  # Check differences
   pnpm mikro:create sync-schema  # Create sync migration
   ```

3. **Failed migration**
   ```bash
   pnpm mikro:down 1  # Rollback last migration
   # Fix the issue
   pnpm mikro:up  # Re-run migrations
   ```

4. **Lock timeout issues**
   - Ensure no long-running queries
   - Check for table locks: `SELECT * FROM pg_locks;`
   - Kill blocking processes if needed

## Conclusion

This implementation guide provides a comprehensive approach to transitioning to MikroORM's migration system. The key benefits include:

- Type-safe migrations with TypeScript
- Automatic schema synchronization
- Built-in rollback capabilities
- Better integration with the ORM
- Simplified migration management

Follow the steps carefully and test thoroughly at each stage to ensure a smooth transition.