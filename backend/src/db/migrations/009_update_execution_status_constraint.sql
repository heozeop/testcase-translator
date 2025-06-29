-- Update status constraint to include 'running' and 'completed' statuses
-- This allows tracking execution progress more granularly

ALTER TABLE execution_results 
DROP CONSTRAINT valid_execution_status;

ALTER TABLE execution_results 
ADD CONSTRAINT valid_execution_status 
CHECK (status IN ('pending', 'running', 'success', 'completed', 'failed', 'error', 'timeout', 'skipped'));