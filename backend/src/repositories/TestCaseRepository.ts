import { query, transaction } from '../db';
import {
  TestCase,
  CreateTestCaseInput,
  UpdateTestCaseInput,
  TestCaseWithRelations,
  TestCaseStatus,
  QueryOptions,
  PaginatedResult
} from '../types';

export class TestCaseRepository {
  async create(input: CreateTestCaseInput): Promise<TestCase> {
    const sql = `
      INSERT INTO test_cases (project_id, scenario_name, test_data, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await query(sql, [
      input.project_id,
      input.scenario_name,
      JSON.stringify(input.test_data),
      input.status || TestCaseStatus.PENDING
    ]);
    
    const row = result.rows[0];
    return {
      ...row,
      test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
    };
  }

  async findById(id: string): Promise<TestCase | null> {
    const sql = 'SELECT * FROM test_cases WHERE id = $1';
    const result = await query(sql, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      ...row,
      test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
    };
  }

  async findByProjectId(projectId: string, options: QueryOptions = {}): Promise<PaginatedResult<TestCase>> {
    const { limit = 10, offset = 0, orderBy = 'created_at', order = 'DESC' } = options;
    
    const countSql = 'SELECT COUNT(*) FROM test_cases WHERE project_id = $1';
    const dataSql = `
      SELECT * FROM test_cases 
      WHERE project_id = $1
      ORDER BY ${orderBy} ${order}
      LIMIT $2 OFFSET $3
    `;
    
    const [countResult, dataResult] = await Promise.all([
      query(countSql, [projectId]),
      query(dataSql, [projectId, limit, offset])
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const page = Math.floor(offset / limit) + 1;
    
    const data = dataResult.rows.map(row => ({
      ...row,
      test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
    }));
    
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1
    };
  }

  async findByStatus(status: TestCaseStatus, options: QueryOptions = {}): Promise<PaginatedResult<TestCase>> {
    const { limit = 10, offset = 0, orderBy = 'created_at', order = 'DESC' } = options;
    
    const countSql = 'SELECT COUNT(*) FROM test_cases WHERE status = $1';
    const dataSql = `
      SELECT * FROM test_cases 
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
    
    const data = dataResult.rows.map(row => ({
      ...row,
      test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
    }));
    
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1
    };
  }

  async update(id: string, input: UpdateTestCaseInput): Promise<TestCase | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.scenario_name !== undefined) {
      updates.push(`scenario_name = $${paramCount++}`);
      values.push(input.scenario_name);
    }
    
    if (input.test_data !== undefined) {
      updates.push(`test_data = $${paramCount++}`);
      values.push(JSON.stringify(input.test_data));
    }
    
    if (input.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(input.status);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const sql = `
      UPDATE test_cases 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query(sql, values);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      ...row,
      test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
    };
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM test_cases WHERE id = $1';
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async findWithRelations(id: string): Promise<TestCaseWithRelations | null> {
    const testCase = await this.findById(id);
    if (!testCase) {
      return null;
    }

    // Get project
    const projectSql = 'SELECT * FROM projects WHERE id = $1';
    const projectResult = await query(projectSql, [testCase.project_id]);
    
    // Get generated codes
    const codesSql = 'SELECT * FROM generated_code WHERE test_case_id = $1 ORDER BY created_at DESC';
    const codesResult = await query(codesSql, [id]);
    
    // Get execution results
    const resultsSql = 'SELECT * FROM execution_results WHERE test_case_id = $1 ORDER BY executed_at DESC';
    const resultsResult = await query(resultsSql, [id]);

    return {
      ...testCase,
      project: projectResult.rows[0] || undefined,
      generated_codes: codesResult.rows,
      execution_results: resultsResult.rows
    };
  }

  async updateStatus(id: string, status: TestCaseStatus): Promise<TestCase | null> {
    return this.update(id, { status });
  }

  async bulkCreate(inputs: CreateTestCaseInput[]): Promise<TestCase[]> {
    return transaction(async (client) => {
      const results: TestCase[] = [];
      
      for (const input of inputs) {
        const sql = `
          INSERT INTO test_cases (project_id, scenario_name, test_data, status)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `;
        
        const result = await client.query(sql, [
          input.project_id,
          input.scenario_name,
          JSON.stringify(input.test_data),
          input.status || TestCaseStatus.PENDING
        ]);
        
        const row = result.rows[0];
        results.push({
          ...row,
          test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
        });
      }
      
      return results;
    });
  }

  async countByProjectId(projectId: string): Promise<number> {
    const sql = 'SELECT COUNT(*) FROM test_cases WHERE project_id = $1';
    const result = await query(sql, [projectId]);
    return parseInt(result.rows[0].count, 10);
  }

  async findAll(options: QueryOptions & { filters?: any } = {}): Promise<PaginatedResult<TestCase>> {
    const { limit = 10, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = options;
    
    let whereClause = '';
    const params: any[] = [];
    let paramCount = 0;

    // Add filters
    if (filters.status) {
      paramCount++;
      whereClause += paramCount === 1 ? 'WHERE' : ' AND';
      whereClause += ` status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.project_id) {
      paramCount++;
      whereClause += paramCount === 1 ? 'WHERE' : ' AND';
      whereClause += ` project_id = $${paramCount}`;
      params.push(filters.project_id);
    }
    
    const countSql = `SELECT COUNT(*) FROM test_cases ${whereClause}`;
    const dataSql = `
      SELECT * FROM test_cases 
      ${whereClause}
      ORDER BY ${orderBy} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    const [countResult, dataResult] = await Promise.all([
      query(countSql, params),
      query(dataSql, [...params, limit, offset])
    ]);
    
    const total = parseInt(countResult.rows[0].count, 10);
    const page = Math.floor(offset / limit) + 1;
    
    const data = dataResult.rows.map(row => ({
      ...row,
      test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
    }));
    
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1
    };
  }

  async findWithDetails(id: string): Promise<TestCase | null> {
    return this.findWithRelations(id);
  }

  async findByScenarioName(projectId: string, scenarioName: string): Promise<TestCase | null> {
    const sql = 'SELECT * FROM test_cases WHERE project_id = $1 AND scenario_name = $2';
    const result = await query(sql, [projectId, scenarioName]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      ...row,
      test_data: typeof row.test_data === 'string' ? JSON.parse(row.test_data) : row.test_data
    };
  }

  async duplicate(id: string, newData: { scenario_name: string }): Promise<TestCase | null> {
    const original = await this.findById(id);
    if (!original) {
      return null;
    }

    return this.create({
      project_id: original.project_id,
      scenario_name: newData.scenario_name,
      test_data: original.test_data,
      status: TestCaseStatus.PENDING
    });
  }

  async getTestCaseStatistics(projectId?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    recentActivity: any[];
  }> {
    const whereClause = projectId ? 'WHERE project_id = $1' : '';
    const params = projectId ? [projectId] : [];

    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        status,
        COUNT(*) as count
      FROM test_cases 
      ${whereClause}
      GROUP BY status
    `, params);

    const recentResult = await query(`
      SELECT * FROM test_cases 
      ${whereClause}
      ORDER BY updated_at DESC 
      LIMIT 10
    `, params);

    const total = statsResult.rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0);
    const byStatus = statsResult.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});

    return {
      total,
      byStatus,
      recentActivity: recentResult.rows
    };
  }
}