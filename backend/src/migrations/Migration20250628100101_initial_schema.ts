import { Migration } from '@mikro-orm/migrations';

export class Migration20250628100101InitialSchema extends Migration {

  async up(): Promise<void> {
    // Create projects table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        target_url VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create test_cases table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS test_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        test_data JSONB,
        expected_result TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create generated_code table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS generated_code (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500),
        content TEXT NOT NULL,
        language VARCHAR(50) DEFAULT 'javascript',
        framework VARCHAR(50) DEFAULT 'cypress',
        status VARCHAR(50) DEFAULT 'generated',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create generated_code_files table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS generated_code_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        generated_code_id UUID NOT NULL REFERENCES generated_code(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500),
        content TEXT NOT NULL,
        file_type VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create exploration_sessions table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS exploration_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'active',
        start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMPTZ,
        configuration JSONB,
        results JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create exploration_results table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS exploration_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES exploration_sessions(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL,
        elements JSONB,
        screenshots JSONB,
        interactions JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create execution_results table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS execution_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        result JSONB,
        error_message TEXT,
        execution_time INTEGER,
        screenshots JSONB,
        logs JSONB,
        executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better performance
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_test_cases_project_id ON test_cases(project_id);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_generated_code_project_id ON generated_code(project_id);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_generated_code_files_generated_code_id ON generated_code_files(generated_code_id);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_exploration_sessions_project_id ON exploration_sessions(project_id);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_exploration_results_session_id ON exploration_results(session_id);`);
    this.addSql(`CREATE INDEX IF NOT EXISTS idx_execution_results_test_case_id ON execution_results(test_case_id);`);

    // Create updated_at trigger function
    this.addSql(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at columns
    const tables = ['projects', 'test_cases', 'generated_code', 'generated_code_files', 'exploration_sessions', 'exploration_results', 'execution_results'];
    for (const table of tables) {
      this.addSql(`
        CREATE TRIGGER update_${table}_updated_at 
        BEFORE UPDATE ON ${table} 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
      `);
    }
  }

  async down(): Promise<void> {
    // Drop tables in reverse order (due to foreign key constraints)
    this.addSql(`DROP TABLE IF EXISTS execution_results CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS exploration_results CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS exploration_sessions CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS generated_code_files CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS generated_code CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS test_cases CASCADE;`);
    this.addSql(`DROP TABLE IF EXISTS projects CASCADE;`);
    
    // Drop the trigger function
    this.addSql(`DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;`);
  }
}