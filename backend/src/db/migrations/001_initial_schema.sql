-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create projects table
CREATE TABLE projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    target_url TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on projects
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX idx_projects_name ON projects(name);

-- Create test_cases table
CREATE TABLE test_cases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scenario_name VARCHAR(255) NOT NULL,
    test_data JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Create indexes on test_cases
CREATE INDEX idx_test_cases_project_id ON test_cases(project_id);
CREATE INDEX idx_test_cases_status ON test_cases(status);
CREATE INDEX idx_test_cases_created_at ON test_cases(created_at DESC);

-- Create generated_code table
CREATE TABLE generated_code (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    cypress_script TEXT NOT NULL,
    file_path VARCHAR(500),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on generated_code
CREATE INDEX idx_generated_code_test_case_id ON generated_code(test_case_id);
CREATE INDEX idx_generated_code_created_at ON generated_code(created_at DESC);

-- Create execution_results table
CREATE TABLE execution_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
    generated_code_id UUID REFERENCES generated_code(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL,
    logs TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_execution_status CHECK (status IN ('success', 'failed', 'error', 'timeout', 'skipped'))
);

-- Create indexes on execution_results
CREATE INDEX idx_execution_results_test_case_id ON execution_results(test_case_id);
CREATE INDEX idx_execution_results_status ON execution_results(status);
CREATE INDEX idx_execution_results_executed_at ON execution_results(executed_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_test_cases_updated_at BEFORE UPDATE ON test_cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();