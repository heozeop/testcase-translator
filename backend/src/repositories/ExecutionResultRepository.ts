import { query } from '../db';
import {
  ExecutionResult,
  CreateExecutionResultInput,
  ExecutionStatus,
  QueryOptions,
  PaginatedResult
} from '../types';

export class ExecutionResultRepository {
  async create(input: CreateExecutionResultInput): Promise<ExecutionResult> {
    const sql = `
      INSERT INTO execution_results (test_case_id, generated_code_id, status, logs, error_message, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await query(sql, [
      input.test_case_id,
      input.generated_code_id || null,
      input.status,
      input.logs || null,
      input.error_message || null,
      input.duration_ms || null
    ]);
    
    return result.rows[0];
  }

  async findById(id: string): Promise<ExecutionResult | null> {
    const sql = 'SELECT * FROM execution_results WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  async findByTestCaseId(testCaseId: string, options: QueryOptions = {}): Promise<PaginatedResult<ExecutionResult>> {
    const { limit = 10, offset = 0, orderBy = 'executed_at', order = 'DESC' } = options;
    
    const countSql = 'SELECT COUNT(*) FROM execution_results WHERE test_case_id = $1';
    const dataSql = `
      SELECT * FROM execution_results 
      WHERE test_case_id = $1
      ORDER BY ${orderBy} ${order}
      LIMIT $2 OFFSET $3
    `;
    
    const [countResult, dataResult] = await Promise.all([
      query(countSql, [testCaseId]),
      query(dataSql, [testCaseId, limit, offset])
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const page = Math.floor(offset / limit) + 1;
    
    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1
    };
  }

  async findByStatus(status: ExecutionStatus, options: QueryOptions = {}): Promise<PaginatedResult<ExecutionResult>> {
    const { limit = 10, offset = 0, orderBy = 'executed_at', order = 'DESC' } = options;
    
    const countSql = 'SELECT COUNT(*) FROM execution_results WHERE status = $1';
    const dataSql = `
      SELECT * FROM execution_results 
      WHERE status = $1
      ORDER BY ${orderBy} ${order}
      LIMIT $2 OFFSET $3
    `;
    
    const [countResult, dataResult] = await Promise.all([
      query(countSql, [status]),
      query(dataSql, [status, limit, offset])
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const page = Math.floor(offset / limit) + 1;
    
    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1
    };
  }

  async findLatestByTestCaseId(testCaseId: string): Promise<ExecutionResult | null> {
    const sql = `
      SELECT * FROM execution_results 
      WHERE test_case_id = $1 
      ORDER BY executed_at DESC 
      LIMIT 1
    `;
    const result = await query(sql, [testCaseId]);
    return result.rows[0] || null;
  }

  async findByGeneratedCodeId(generatedCodeId: string, options: QueryOptions = {}): Promise<PaginatedResult<ExecutionResult>> {
    const { limit = 10, offset = 0, orderBy = 'executed_at', order = 'DESC' } = options;
    
    const countSql = 'SELECT COUNT(*) FROM execution_results WHERE generated_code_id = $1';
    const dataSql = `
      SELECT * FROM execution_results 
      WHERE generated_code_id = $1
      ORDER BY ${orderBy} ${order}
      LIMIT $2 OFFSET $3
    `;
    
    const [countResult, dataResult] = await Promise.all([
      query(countSql, [generatedCodeId]),
      query(dataSql, [generatedCodeId, limit, offset])
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const page = Math.floor(offset / limit) + 1;
    
    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1
    };
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM execution_results WHERE id = $1';
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByTestCaseId(testCaseId: string): Promise<number> {
    const sql = 'DELETE FROM execution_results WHERE test_case_id = $1';
    const result = await query(sql, [testCaseId]);
    return result.rowCount ?? 0;
  }

  async getStatsByTestCaseId(testCaseId: string): Promise<{
    total: number;
    success: number;
    failed: number;
    error: number;
    timeout: number;
    skipped: number;
    successRate: number;
    averageDuration: number | null;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
        SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
        AVG(duration_ms) as avg_duration
      FROM execution_results 
      WHERE test_case_id = $1
    `;
    
    const result = await query(sql, [testCaseId]);
    const row = result.rows[0];
    
    const total = parseInt(row.total, 10);
    const success = parseInt(row.success, 10);
    
    return {
      total,
      success,
      failed: parseInt(row.failed, 10),
      error: parseInt(row.error, 10),
      timeout: parseInt(row.timeout, 10),
      skipped: parseInt(row.skipped, 10),
      successRate: total > 0 ? (success / total) * 100 : 0,
      averageDuration: row.avg_duration ? parseFloat(row.avg_duration) : null
    };
  }

  async findWithRelations(id: string): Promise<(ExecutionResult & { 
    test_case?: any; 
    generated_code?: any;
    project?: any;
  }) | null> {
    const sql = `
      SELECT 
        er.*,
        tc.scenario_name,
        tc.status as test_case_status,
        gc.version as code_version,
        gc.file_path,
        p.name as project_name,
        p.target_url
      FROM execution_results er
      LEFT JOIN test_cases tc ON er.test_case_id = tc.id
      LEFT JOIN generated_code gc ON er.generated_code_id = gc.id
      LEFT JOIN projects p ON tc.project_id = p.id
      WHERE er.id = $1
    `;
    
    const result = await query(sql, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      test_case_id: row.test_case_id,
      generated_code_id: row.generated_code_id,
      status: row.status,
      logs: row.logs,
      error_message: row.error_message,
      duration_ms: row.duration_ms,
      executed_at: row.executed_at,
      test_case: row.scenario_name ? {
        scenario_name: row.scenario_name,
        status: row.test_case_status
      } : undefined,
      generated_code: row.code_version ? {
        version: row.code_version,
        file_path: row.file_path
      } : undefined,
      project: row.project_name ? {
        name: row.project_name,
        target_url: row.target_url
      } : undefined
    };
  }
}