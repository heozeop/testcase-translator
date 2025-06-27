-- Migration: Create Generated Code Tables
-- Description: Tables for storing generated Cypress test projects and files
-- Version: 006
-- Created: 2024-12-26

-- Create generated_code table for storing main generation metadata
CREATE TABLE IF NOT EXISTS generated_code (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE SET NULL,
    exploration_result_id UUID REFERENCES exploration_results(id) ON DELETE SET NULL,
    project_path TEXT NOT NULL,
    config_file TEXT NOT NULL,
    package_json TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create generated_code_files table for storing individual file contents
CREATE TABLE IF NOT EXISTS generated_code_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID NOT NULL REFERENCES generated_code(id) ON DELETE CASCADE,
    file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('test', 'fixture', 'support')),
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_generated_code_project_id ON generated_code(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_code_test_case_id ON generated_code(test_case_id);
CREATE INDEX IF NOT EXISTS idx_generated_code_exploration_result_id ON generated_code(exploration_result_id);
CREATE INDEX IF NOT EXISTS idx_generated_code_created_at ON generated_code(created_at);

CREATE INDEX IF NOT EXISTS idx_generated_code_files_generation_id ON generated_code_files(generation_id);
CREATE INDEX IF NOT EXISTS idx_generated_code_files_type ON generated_code_files(file_type);
CREATE INDEX IF NOT EXISTS idx_generated_code_files_name ON generated_code_files(file_name);

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_generated_code_project_created ON generated_code(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_code_files_generation_type ON generated_code_files(generation_id, file_type);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_generated_code_updated_at 
    BEFORE UPDATE ON generated_code 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_code_files_updated_at 
    BEFORE UPDATE ON generated_code_files 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE generated_code IS 'Stores metadata and configuration for generated Cypress test projects';
COMMENT ON TABLE generated_code_files IS 'Stores individual file contents for generated Cypress projects';

COMMENT ON COLUMN generated_code.project_path IS 'File system path where the generated project is stored';
COMMENT ON COLUMN generated_code.config_file IS 'Contents of the cypress.config.js file';
COMMENT ON COLUMN generated_code.package_json IS 'Contents of the package.json file (optional)';
COMMENT ON COLUMN generated_code.metadata IS 'Additional metadata about the generation process';

COMMENT ON COLUMN generated_code_files.file_type IS 'Type of file: test, fixture, or support';
COMMENT ON COLUMN generated_code_files.file_name IS 'Name of the file (e.g., login.cy.js)';
COMMENT ON COLUMN generated_code_files.file_path IS 'Full path where the file is stored';
COMMENT ON COLUMN generated_code_files.content IS 'Complete file content';

-- Insert migration record
INSERT INTO schema_migrations (version, name, executed_at) 
VALUES ('006', 'create_generated_code_tables', CURRENT_TIMESTAMP)
ON CONFLICT (version) DO NOTHING;