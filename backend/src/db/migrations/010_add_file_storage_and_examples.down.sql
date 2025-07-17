-- Rollback Migration: Add file storage and test examples functionality
-- Date: 2025-07-12
-- Description: Removes file storage columns from generated_code, drops test_examples table, 
--              and removes media storage columns from execution_results

-- 1. Remove media storage columns from execution_results table
ALTER TABLE execution_results 
DROP CONSTRAINT IF EXISTS check_screenshot_urls_is_array;

DROP INDEX IF EXISTS idx_execution_results_video_url;

ALTER TABLE execution_results 
DROP COLUMN IF EXISTS video_url,
DROP COLUMN IF EXISTS screenshot_urls;

-- 2. Drop test_examples table and related objects
DROP TRIGGER IF EXISTS update_test_examples_updated_at_trigger ON test_examples;
DROP FUNCTION IF EXISTS update_test_examples_updated_at();

DROP INDEX IF EXISTS idx_test_examples_created_at;
DROP INDEX IF EXISTS idx_test_examples_is_active;
DROP INDEX IF EXISTS idx_test_examples_project_id;

DROP TABLE IF EXISTS test_examples;

-- 3. Remove file storage columns from generated_code table
DROP INDEX IF EXISTS idx_generated_code_file_path;
DROP INDEX IF EXISTS idx_generated_code_file_url;

ALTER TABLE generated_code 
DROP COLUMN IF EXISTS file_url,
DROP COLUMN IF EXISTS file_path;