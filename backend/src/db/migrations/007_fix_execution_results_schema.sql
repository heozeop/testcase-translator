-- Fix execution_results table schema to match the service requirements
-- Add missing columns that the service expects

ALTER TABLE execution_results 
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS execution_data JSONB,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create index on project_id
CREATE INDEX IF NOT EXISTS idx_execution_results_project_id ON execution_results(project_id);

-- Add trigger for updated_at
CREATE TRIGGER update_execution_results_updated_at BEFORE UPDATE ON execution_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing records to set project_id based on test_case_id (if any exist)
UPDATE execution_results 
SET project_id = tc.project_id 
FROM test_cases tc 
WHERE execution_results.test_case_id = tc.id 
AND execution_results.project_id IS NULL;