export interface Project {
  id: string;
  name: string;
  target_url: string;
  description?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  name: string;
  target_url: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  target_url?: string;
  description?: string;
}

export enum TestCaseStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface TestCase {
  id: string;
  project_id: string;
  scenario_name: string;
  test_data: TestCaseData;
  status: TestCaseStatus;
  created_at: Date;
  updated_at: Date;
}

export interface TestCaseData {
  steps: TestStep[];
  assertions: Assertion[];
  inputs: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface TestStep {
  action: string;
  target: string;
  value?: string;
  description?: string;
}

export interface Assertion {
  type: string;
  target: string;
  expected: any;
  description?: string;
}

export interface CreateTestCaseInput {
  project_id: string;
  scenario_name: string;
  test_data: TestCaseData;
  status?: TestCaseStatus;
}

export interface UpdateTestCaseInput {
  scenario_name?: string;
  test_data?: TestCaseData;
  status?: TestCaseStatus;
  processed_at?: Date;
  error_message?: string;
}

export interface GeneratedCode {
  id: string;
  test_case_id: string;
  cypress_script: string;
  file_path?: string | null;
  version: number;
  created_at: Date;
}

export interface CreateGeneratedCodeInput {
  test_case_id: string;
  cypress_script: string;
  file_path?: string;
  version?: number;
}

export enum ExecutionStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  SKIPPED = 'skipped'
}

export interface ExecutionResult {
  id: string;
  test_case_id: string;
  generated_code_id?: string | null;
  status: ExecutionStatus;
  logs?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  executed_at: Date;
}

export interface CreateExecutionResultInput {
  test_case_id: string;
  generated_code_id?: string;
  status: ExecutionStatus;
  logs?: string;
  error_message?: string;
  duration_ms?: number;
}


export interface ProjectWithStats extends Project {
  test_case_count?: number;
  last_execution_date?: Date | null;
}

export interface TestCaseWithRelations extends TestCase {
  project?: Project;
  generated_codes?: GeneratedCode[];
  execution_results?: ExecutionResult[];
}