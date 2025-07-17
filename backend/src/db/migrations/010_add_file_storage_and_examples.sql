-- Migration: Add file storage and test examples functionality
-- Date: 2025-07-12
-- Description: Adds file storage columns to generated_code, creates test_examples table, 
--              and adds media storage columns to execution_results

-- 1. Add file storage columns to generated_code table
ALTER TABLE generated_code 
ADD COLUMN IF NOT EXISTS file_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS file_path VARCHAR(500);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_generated_code_file_url ON generated_code(file_url);
CREATE INDEX IF NOT EXISTS idx_generated_code_file_path ON generated_code(file_path);

-- 2. Create test_examples table
CREATE TABLE IF NOT EXISTS test_examples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    test_scenario TEXT NOT NULL,
    expected_result TEXT NOT NULL,
    cypress_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for test_examples
CREATE INDEX IF NOT EXISTS idx_test_examples_project_id ON test_examples(project_id);
CREATE INDEX IF NOT EXISTS idx_test_examples_is_active ON test_examples(is_active);
CREATE INDEX IF NOT EXISTS idx_test_examples_created_at ON test_examples(created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_test_examples_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_test_examples_updated_at_trigger
BEFORE UPDATE ON test_examples
FOR EACH ROW
EXECUTE FUNCTION update_test_examples_updated_at();

-- 3. Add media storage columns to execution_results table
ALTER TABLE execution_results 
ADD COLUMN IF NOT EXISTS video_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS screenshot_urls JSONB DEFAULT '[]'::jsonb;

-- Add check constraint to ensure screenshot_urls is an array
ALTER TABLE execution_results 
ADD CONSTRAINT check_screenshot_urls_is_array 
CHECK (jsonb_typeof(screenshot_urls) = 'array');

-- Add index for video_url for faster queries
CREATE INDEX IF NOT EXISTS idx_execution_results_video_url ON execution_results(video_url);

-- Add comments for documentation
COMMENT ON COLUMN generated_code.file_url IS 'URL for accessing the generated Cypress test file';
COMMENT ON COLUMN generated_code.file_path IS 'Local file system path where the generated test file is stored';

COMMENT ON TABLE test_examples IS 'Stores example test scenarios and their expected results to enhance AI prompt quality';
COMMENT ON COLUMN test_examples.test_scenario IS 'Description of the test scenario or user action';
COMMENT ON COLUMN test_examples.expected_result IS 'Expected outcome or assertion for the test scenario';
COMMENT ON COLUMN test_examples.cypress_code IS 'Example Cypress code implementation for this scenario';
COMMENT ON COLUMN test_examples.is_active IS 'Whether this example should be included in AI prompts';

COMMENT ON COLUMN execution_results.video_url IS 'URL to the video recording of the test execution';
COMMENT ON COLUMN execution_results.screenshot_urls IS 'JSON array of URLs to screenshots captured during test execution';