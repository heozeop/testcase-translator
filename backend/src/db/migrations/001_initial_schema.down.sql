-- Drop triggers
DROP TRIGGER IF EXISTS update_test_cases_updated_at ON test_cases;
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables (in reverse order due to foreign key constraints)
DROP TABLE IF EXISTS execution_results;
DROP TABLE IF EXISTS generated_code;
DROP TABLE IF EXISTS test_cases;
DROP TABLE IF EXISTS projects;

-- Drop extension (optional, might be used by other schemas)
-- DROP EXTENSION IF EXISTS "uuid-ossp";