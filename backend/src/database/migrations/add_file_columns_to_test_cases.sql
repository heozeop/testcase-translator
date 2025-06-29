-- Add file-related columns to test_cases table
ALTER TABLE test_cases 
ADD COLUMN IF NOT EXISTS file_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Add index for file path lookups
CREATE INDEX IF NOT EXISTS idx_test_cases_file_path ON test_cases(file_path);

-- Add comment for clarity
COMMENT ON COLUMN test_cases.file_path IS 'Server file path for uploaded test case files';
COMMENT ON COLUMN test_cases.original_filename IS 'Original filename uploaded by user';
COMMENT ON COLUMN test_cases.file_size IS 'File size in bytes';