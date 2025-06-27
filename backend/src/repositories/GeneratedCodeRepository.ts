import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface StoredCypressGeneration {
  id: string;
  projectId: string;
  testCaseId?: string;
  explorationResultId?: string;
  projectPath: string;
  configFile: string;
  testFiles: { name: string; path: string; content: string }[];
  fixtureFiles: { name: string; path: string; content: string }[];
  supportFiles: { name: string; path: string; content: string }[];
  packageJson?: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface GeneratedCodeQueryOptions {
  projectId?: string;
  testCaseId?: string;
  explorationResultId?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at';
  orderDirection?: 'ASC' | 'DESC';
}

export class GeneratedCodeRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async saveGeneratedCode(
    generation: Omit<StoredCypressGeneration, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const generationId = uuidv4();
      const now = new Date();

      // Insert main generation record
      await client.query(`
        INSERT INTO generated_code (
          id, project_id, test_case_id, exploration_result_id,
          project_path, config_file, package_json, metadata,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        generationId,
        generation.projectId,
        generation.testCaseId || null,
        generation.explorationResultId || null,
        generation.projectPath,
        generation.configFile,
        generation.packageJson || null,
        JSON.stringify(generation.metadata),
        now,
        now
      ]);

      // Insert test files
      for (const file of generation.testFiles) {
        await client.query(`
          INSERT INTO generated_code_files (
            id, generation_id, file_type, file_name, file_path, content, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          uuidv4(),
          generationId,
          'test',
          file.name,
          file.path,
          file.content,
          now
        ]);
      }

      // Insert fixture files
      for (const file of generation.fixtureFiles) {
        await client.query(`
          INSERT INTO generated_code_files (
            id, generation_id, file_type, file_name, file_path, content, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          uuidv4(),
          generationId,
          'fixture',
          file.name,
          file.path,
          file.content,
          now
        ]);
      }

      // Insert support files
      for (const file of generation.supportFiles) {
        await client.query(`
          INSERT INTO generated_code_files (
            id, generation_id, file_type, file_name, file_path, content, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          uuidv4(),
          generationId,
          'support',
          file.name,
          file.path,
          file.content,
          now
        ]);
      }

      await client.query('COMMIT');
      return generationId;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getGeneratedCode(generationId: string): Promise<StoredCypressGeneration | null> {
    const client = await this.pool.connect();
    
    try {
      // Get main generation record
      const generationResult = await client.query(`
        SELECT * FROM generated_code WHERE id = $1
      `, [generationId]);

      if (generationResult.rows.length === 0) {
        return null;
      }

      const generation = generationResult.rows[0];

      // Get all files for this generation
      const filesResult = await client.query(`
        SELECT file_type, file_name, file_path, content
        FROM generated_code_files
        WHERE generation_id = $1
        ORDER BY file_type, file_name
      `, [generationId]);

      // Group files by type
      const testFiles: { name: string; path: string; content: string }[] = [];
      const fixtureFiles: { name: string; path: string; content: string }[] = [];
      const supportFiles: { name: string; path: string; content: string }[] = [];

      for (const file of filesResult.rows) {
        const fileData = {
          name: file.file_name,
          path: file.file_path,
          content: file.content
        };

        switch (file.file_type) {
          case 'test':
            testFiles.push(fileData);
            break;
          case 'fixture':
            fixtureFiles.push(fileData);
            break;
          case 'support':
            supportFiles.push(fileData);
            break;
        }
      }

      return {
        id: generation.id,
        projectId: generation.project_id,
        testCaseId: generation.test_case_id,
        explorationResultId: generation.exploration_result_id,
        projectPath: generation.project_path,
        configFile: generation.config_file,
        testFiles,
        fixtureFiles,
        supportFiles,
        packageJson: generation.package_json,
        metadata: generation.metadata,
        createdAt: generation.created_at,
        updatedAt: generation.updated_at
      };

    } finally {
      client.release();
    }
  }

  async getGeneratedCodeByProject(projectId: string): Promise<StoredCypressGeneration[]> {
    return this.queryGeneratedCode({ projectId, orderBy: 'created_at', orderDirection: 'DESC' });
  }

  async getGeneratedCodeByTestCase(testCaseId: string): Promise<StoredCypressGeneration[]> {
    return this.queryGeneratedCode({ testCaseId, orderBy: 'created_at', orderDirection: 'DESC' });
  }

  async getGeneratedCodeByExplorationResult(explorationResultId: string): Promise<StoredCypressGeneration[]> {
    return this.queryGeneratedCode({ explorationResultId, orderBy: 'created_at', orderDirection: 'DESC' });
  }

  async queryGeneratedCode(options: GeneratedCodeQueryOptions): Promise<StoredCypressGeneration[]> {
    const client = await this.pool.connect();
    
    try {
      let query = 'SELECT * FROM generated_code WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (options.projectId) {
        query += ` AND project_id = $${paramIndex}`;
        params.push(options.projectId);
        paramIndex++;
      }

      if (options.testCaseId) {
        query += ` AND test_case_id = $${paramIndex}`;
        params.push(options.testCaseId);
        paramIndex++;
      }

      if (options.explorationResultId) {
        query += ` AND exploration_result_id = $${paramIndex}`;
        params.push(options.explorationResultId);
        paramIndex++;
      }

      // Add ordering
      const orderBy = options.orderBy || 'created_at';
      const orderDirection = options.orderDirection || 'DESC';
      query += ` ORDER BY ${orderBy} ${orderDirection}`;

      // Add pagination
      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
        paramIndex++;
      }

      const result = await client.query(query, params);
      
      // For each generation, load its files
      const generations: StoredCypressGeneration[] = [];
      
      for (const row of result.rows) {
        const fullGeneration = await this.getGeneratedCode(row.id);
        if (fullGeneration) {
          generations.push(fullGeneration);
        }
      }

      return generations;

    } finally {
      client.release();
    }
  }

  async updateGeneratedCode(
    generationId: string,
    updates: Partial<Pick<StoredCypressGeneration, 'projectPath' | 'configFile' | 'packageJson' | 'metadata'>>
  ): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const setParts: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updates.projectPath !== undefined) {
        setParts.push(`project_path = $${paramIndex}`);
        params.push(updates.projectPath);
        paramIndex++;
      }

      if (updates.configFile !== undefined) {
        setParts.push(`config_file = $${paramIndex}`);
        params.push(updates.configFile);
        paramIndex++;
      }

      if (updates.packageJson !== undefined) {
        setParts.push(`package_json = $${paramIndex}`);
        params.push(updates.packageJson);
        paramIndex++;
      }

      if (updates.metadata !== undefined) {
        setParts.push(`metadata = $${paramIndex}`);
        params.push(JSON.stringify(updates.metadata));
        paramIndex++;
      }

      if (setParts.length === 0) {
        return false;
      }

      setParts.push(`updated_at = $${paramIndex}`);
      params.push(new Date());
      paramIndex++;

      params.push(generationId);

      const query = `
        UPDATE generated_code 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
      `;

      const result = await client.query(query, params);
      return result.rowCount > 0;

    } finally {
      client.release();
    }
  }

  async deleteGeneratedCode(generationId: string): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete files first (due to foreign key constraint)
      await client.query(`
        DELETE FROM generated_code_files WHERE generation_id = $1
      `, [generationId]);

      // Delete main generation record
      const result = await client.query(`
        DELETE FROM generated_code WHERE id = $1
      `, [generationId]);

      await client.query('COMMIT');
      return result.rowCount > 0;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getGenerationStatistics(projectId?: string): Promise<{
    totalGenerations: number;
    totalTestFiles: number;
    totalFixtureFiles: number;
    totalSupportFiles: number;
    averageFilesPerGeneration: number;
    latestGeneration?: Date;
    oldestGeneration?: Date;
  }> {
    const client = await this.pool.connect();
    
    try {
      let baseQuery = `
        SELECT 
          COUNT(DISTINCT gc.id) as total_generations,
          COUNT(CASE WHEN gcf.file_type = 'test' THEN 1 END) as total_test_files,
          COUNT(CASE WHEN gcf.file_type = 'fixture' THEN 1 END) as total_fixture_files,
          COUNT(CASE WHEN gcf.file_type = 'support' THEN 1 END) as total_support_files,
          MAX(gc.created_at) as latest_generation,
          MIN(gc.created_at) as oldest_generation
        FROM generated_code gc
        LEFT JOIN generated_code_files gcf ON gc.id = gcf.generation_id
      `;

      const params: any[] = [];
      
      if (projectId) {
        baseQuery += ' WHERE gc.project_id = $1';
        params.push(projectId);
      }

      const result = await client.query(baseQuery, params);
      const row = result.rows[0];

      const totalGenerations = parseInt(row.total_generations) || 0;
      const totalFiles = (parseInt(row.total_test_files) || 0) + 
                        (parseInt(row.total_fixture_files) || 0) + 
                        (parseInt(row.total_support_files) || 0);

      return {
        totalGenerations,
        totalTestFiles: parseInt(row.total_test_files) || 0,
        totalFixtureFiles: parseInt(row.total_fixture_files) || 0,
        totalSupportFiles: parseInt(row.total_support_files) || 0,
        averageFilesPerGeneration: totalGenerations > 0 ? totalFiles / totalGenerations : 0,
        latestGeneration: row.latest_generation,
        oldestGeneration: row.oldest_generation
      };

    } finally {
      client.release();
    }
  }

  async getFileContent(generationId: string, fileName: string): Promise<string | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT content FROM generated_code_files
        WHERE generation_id = $1 AND file_name = $2
      `, [generationId, fileName]);

      return result.rows.length > 0 ? result.rows[0].content : null;

    } finally {
      client.release();
    }
  }

  async updateFileContent(
    generationId: string, 
    fileName: string, 
    content: string
  ): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        UPDATE generated_code_files
        SET content = $1, updated_at = $2
        WHERE generation_id = $3 AND file_name = $4
      `, [content, new Date(), generationId, fileName]);

      return result.rowCount > 0;

    } finally {
      client.release();
    }
  }
}