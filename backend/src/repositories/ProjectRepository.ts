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
      totalPages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1
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

  async countByProjectId(projectId: string): Promise<number> {
    const sql = 'SELECT COUNT(*) FROM projects WHERE id = $1';
    const result = await query(sql, [projectId]);
    return parseInt(result.rows[0].count, 10);
  }

  async getProjectStatisticsById(projectId: string): Promise<any> {
    const sql = `
      SELECT 
        p.id,
        p.name,
        p.target_url,
        p.created_at,
        p.updated_at,
        COUNT(DISTINCT tc.id) as test_case_count,
        COUNT(DISTINCT gc.id) as generated_code_count,
        COUNT(DISTINCT er.id) as execution_count,
        COUNT(CASE WHEN tc.status = 'completed' THEN 1 END) as processed_test_cases,
        COUNT(CASE WHEN tc.status = 'failed' THEN 1 END) as failed_test_cases,
        MAX(er.executed_at) as last_execution_date,
        AVG(CASE WHEN er.status = 'success' THEN 1.0 ELSE 0.0 END) as success_rate
      FROM projects p
      LEFT JOIN test_cases tc ON p.id = tc.project_id
      LEFT JOIN generated_code gc ON tc.id = gc.test_case_id
      LEFT JOIN execution_results er ON tc.id = er.test_case_id
      WHERE p.id = $1
      GROUP BY p.id, p.name, p.target_url, p.created_at, p.updated_at
    `;
    
    const result = await query(sql, [projectId]);
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      target_url: row.target_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      statistics: {
        test_case_count: parseInt(row.test_case_count, 10),
        generated_code_count: parseInt(row.generated_code_count, 10),
        execution_count: parseInt(row.execution_count, 10),
        processed_test_cases: parseInt(row.processed_test_cases, 10),
        failed_test_cases: parseInt(row.failed_test_cases, 10),
        last_execution_date: row.last_execution_date,
        success_rate: parseFloat(row.success_rate) || 0
      }
    };
  }

  async duplicate(projectId: string, options: {
    name: string;
    copy_test_cases?: boolean;
    copy_generated_code?: boolean;
  }): Promise<Project> {
    return transaction(async (client) => {
      // Get original project
      const originalResult = await client.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      if (originalResult.rows.length === 0) {
        throw new Error('Source project not found');
      }
      
      const original = originalResult.rows[0];
      
      // Create new project
      const newProjectResult = await client.query(`
        INSERT INTO projects (name, target_url, description)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [options.name, original.target_url, original.description]);
      
      const newProject = newProjectResult.rows[0];
      
      // Copy test cases if requested
      if (options.copy_test_cases) {
        const testCasesResult = await client.query(`
          INSERT INTO test_cases (
            project_id, scenario_name, test_type, priority, description,
            preconditions, steps, expected_results, test_data, tags,
            status, created_at, updated_at
          )
          SELECT 
            $1, scenario_name, test_type, priority, description,
            preconditions, steps, expected_results, test_data, tags,
            'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM test_cases 
          WHERE project_id = $2
          RETURNING id, scenario_name
        `, [newProject.id, projectId]);
        
        // Copy generated code if requested and test cases were copied
        if (options.copy_generated_code && testCasesResult.rows.length > 0) {
          // Create a mapping from old test case IDs to new ones
          const originalTestCases = await client.query(
            'SELECT id, scenario_name FROM test_cases WHERE project_id = $1 ORDER BY created_at',
            [projectId]
          );
          
          const testCaseMapping = new Map();
          originalTestCases.rows.forEach((original: any, index: number) => {
            if (testCasesResult.rows[index]) {
              testCaseMapping.set(original.id, testCasesResult.rows[index].id);
            }
          });
          
          // Copy generated code with updated test case IDs
          for (const [oldTestCaseId, newTestCaseId] of testCaseMapping) {
            await client.query(`
              INSERT INTO generated_code (
                project_id, test_case_id, file_name, file_path, content,
                metadata, status, created_at, updated_at
              )
              SELECT 
                $1, $2, file_name, file_path, content,
                metadata, 'generated', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              FROM generated_code 
              WHERE test_case_id = $3
            `, [newProject.id, newTestCaseId, oldTestCaseId]);
          }
        }
      }
      
      return newProject;
    });
  }

  async getProjectStatistics(): Promise<{
    total: number;
    active: number;
    completed: number;
    recentActivity: any[];
  }> {
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM projects
    `);

    const recentResult = await query(`
      SELECT * FROM projects 
      ORDER BY updated_at DESC 
      LIMIT 10
    `);

    const stats = statsResult.rows[0];
    return {
      total: parseInt(stats.total, 10),
      active: parseInt(stats.active, 10),
      completed: parseInt(stats.completed, 10),
      recentActivity: recentResult.rows
    };
  }
}