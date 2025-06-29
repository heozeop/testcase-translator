-- Make test_case_id nullable for project-level executions
-- This allows storing executions at the project level (multiple test cases)
-- as well as individual test case executions

ALTER TABLE execution_results 
ALTER COLUMN test_case_id DROP NOT NULL;