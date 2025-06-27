import { query, transaction } from '../db';
import {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectWithStats,
  QueryOptions,
  PaginatedResult
} from '../types';

export class ProjectRepository {
  async create(input: CreateProjectInput): Promise<Project> {
    const sql = `
      INSERT INTO projects (name, target_url, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const result = await query(sql, [input.name, input.target_url, input.description || null]);
    return result.rows[0];
  }

  async findById(id: string): Promise<Project | null> {
    const sql = 'SELECT * FROM projects WHERE id = $1';
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  async findAll(options: QueryOptions = {}): Promise<PaginatedResult<Project>> {
    const { limit = 10, offset = 0, orderBy = 'created_at', order = 'DESC' } = options;
    
    const countSql = 'SELECT COUNT(*) FROM projects';
    const dataSql = `
      SELECT * FROM projects
      ORDER BY ${orderBy} ${order}
      LIMIT $1 OFFSET $2
    `;
    
    const [countResult, dataResult] = await Promise.all([
      query(countSql),
      query(dataSql, [limit, offset])
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

  async findByName(name: string): Promise<Project | null> {
    const sql = 'SELECT * FROM projects WHERE name = $1';
    const result = await query(sql, [name]);
    return result.rows[0] || null;
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(input.name);
    }
    
    if (input.target_url !== undefined) {
      updates.push(`target_url = $${paramCount++}`);
      values.push(input.target_url);
    }
    
    if (input.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(input.description);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const sql = `
      UPDATE projects 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query(sql, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM projects WHERE id = $1';
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async findWithStats(id: string): Promise<ProjectWithStats | null> {
    const sql = `
      SELECT 
        p.*,
        COUNT(tc.id) as test_case_count,
        MAX(er.executed_at) as last_execution_date
      FROM projects p
      LEFT JOIN test_cases tc ON p.id = tc.project_id
      LEFT JOIN execution_results er ON tc.id = er.test_case_id
      WHERE p.id = $1
      GROUP BY p.id
    `;
    
    const result = await query(sql, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      ...row,
      test_case_count: parseInt(row.test_case_count, 10),
      last_execution_date: row.last_execution_date || null
    };
  }

  async deleteWithCascade(id: string): Promise<boolean> {
    return transaction(async (client) => {
      // Delete execution results first
      await client.query(`
        DELETE FROM execution_results 
        WHERE test_case_id IN (
          SELECT id FROM test_cases WHERE project_id = $1
        )
      `, [id]);
      
      // Delete generated code
      await client.query(`
        DELETE FROM generated_code 
        WHERE test_case_id IN (
          SELECT id FROM test_cases WHERE project_id = $1
        )
      `, [id]);
      
      // Delete test cases
      await client.query('DELETE FROM test_cases WHERE project_id = $1', [id]);
      
      // Delete project
      const result = await client.query('DELETE FROM projects WHERE id = $1', [id]);
      
      return (result.rowCount ?? 0) > 0;
    });
  }
}