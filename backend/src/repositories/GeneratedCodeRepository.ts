import { query } from '../db';
import {
  GeneratedCode,
  CreateGeneratedCodeInput,
  QueryOptions,
  PaginatedResult
} from '../types';

export class GeneratedCodeRepository {
  async create(input: CreateGeneratedCodeInput): Promise<GeneratedCode> {
    const sql = `
      INSERT INTO generated_code (test_case_id, cypress_script, file_path, version)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await query(sql, [
      input.test_case_id,
      input.cypress_script,
      input.file_path || null,
      input.version || 1
    ]);
    
    return result.rows[0];
  }

  async findById(id: string): Promise<GeneratedCode | null> {
    const sql = 'SELECT * FROM generated_code WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  async findByTestCaseId(testCaseId: string, options: QueryOptions = {}): Promise<PaginatedResult<GeneratedCode>> {
    const { limit = 10, offset = 0, orderBy = 'created_at', order = 'DESC' } = options;
    
    const countSql = 'SELECT COUNT(*) FROM generated_code WHERE test_case_id = $1';
    const dataSql = `
      SELECT * FROM generated_code 
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
      totalPages: Math.ceil(total / limit)
    };
  }

  async findLatestByTestCaseId(testCaseId: string): Promise<GeneratedCode | null> {
    const sql = `
      SELECT * FROM generated_code 
      WHERE test_case_id = $1 
      ORDER BY version DESC, created_at DESC 
      LIMIT 1
    `;
    const result = await query(sql, [testCaseId]);
    return result.rows[0] || null;
  }

  async findByVersion(testCaseId: string, version: number): Promise<GeneratedCode | null> {
    const sql = 'SELECT * FROM generated_code WHERE test_case_id = $1 AND version = $2';
    const result = await query(sql, [testCaseId, version]);
    return result.rows[0] || null;
  }

  async updateFilePath(id: string, filePath: string): Promise<GeneratedCode | null> {
    const sql = `
      UPDATE generated_code 
      SET file_path = $1
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await query(sql, [filePath, id]);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM generated_code WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rowCount > 0;
  }

  async deleteByTestCaseId(testCaseId: string): Promise<number> {
    const sql = 'DELETE FROM generated_code WHERE test_case_id = $1';
    const result = await query(sql, [testCaseId]);
    return result.rowCount;
  }

  async getNextVersion(testCaseId: string): Promise<number> {
    const sql = 'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM generated_code WHERE test_case_id = $1';
    const result = await query(sql, [testCaseId]);
    return result.rows[0].next_version;
  }

  async createNewVersion(input: CreateGeneratedCodeInput): Promise<GeneratedCode> {
    const nextVersion = await this.getNextVersion(input.test_case_id);
    
    return this.create({
      ...input,
      version: nextVersion
    });
  }

  async getAllVersions(testCaseId: string): Promise<GeneratedCode[]> {
    const sql = `
      SELECT * FROM generated_code 
      WHERE test_case_id = $1 
      ORDER BY version DESC, created_at DESC
    `;
    const result = await query(sql, [testCaseId]);
    return result.rows;
  }

  async findWithTestCase(id: string): Promise<(GeneratedCode & { test_case?: any }) | null> {
    const sql = `
      SELECT 
        gc.*,
        tc.scenario_name,
        tc.status as test_case_status,
        p.name as project_name
      FROM generated_code gc
      LEFT JOIN test_cases tc ON gc.test_case_id = tc.id
      LEFT JOIN projects p ON tc.project_id = p.id
      WHERE gc.id = $1
    `;
    
    const result = await query(sql, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      test_case_id: row.test_case_id,
      cypress_script: row.cypress_script,
      file_path: row.file_path,
      version: row.version,
      created_at: row.created_at,
      test_case: row.scenario_name ? {
        scenario_name: row.scenario_name,
        status: row.test_case_status,
        project_name: row.project_name
      } : undefined
    };
  }
}