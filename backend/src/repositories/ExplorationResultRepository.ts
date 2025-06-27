import { Pool } from 'pg';
import { getPool } from '../db';
import { 
  ExplorationSession, 
  NavigationSequence, 
  PageState, 
  NavigationAction, 
  ExplorationResult,
  CollectedInput
} from '../services/ExplorationResultsStorage';

export interface ExplorationSessionRow {
  id: string;
  project_id?: string;
  test_case_id?: string;
  user_id?: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  start_time: Date;
  end_time?: Date;
  total_duration: number;
  settings: any;
  summary: any;
  created_at: Date;
  updated_at: Date;
}

export interface NavigationSequenceRow {
  id: string;
  session_id: string;
  test_case_id?: string;
  start_time: Date;
  end_time?: Date;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  start_url: string;
  final_url?: string;
  navigation_plan: any;
  total_duration: number;
  error_count: number;
  completion_percentage: number;
  metrics: any;
  created_at: Date;
  updated_at: Date;
}

export interface PageStateRow {
  id: string;
  sequence_id: string;
  url: string;
  title: string;
  timestamp: Date;
  dom_snapshot?: string;
  screenshot_path?: string;
  viewport_size: any;
  load_time: number;
  http_status?: number;
  elements: any;
  forms: any;
  errors: any;
  metadata: any;
  created_at: Date;
}

export interface NavigationActionRow {
  id: string;
  sequence_id: string;
  type: string;
  timestamp: Date;
  selector?: string;
  value?: any;
  url?: string;
  coordinates?: any;
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: any;
  created_at: Date;
}

export interface CollectedInputRow {
  id: string;
  sequence_id: string;
  element_selector: string;
  field_name: string;
  field_type: string;
  value: any;
  timestamp: Date;
  confidence: number;
  source: 'user' | 'default' | 'inferred' | 'fallback';
  created_at: Date;
}

export interface ExplorationResultRow {
  id: string;
  session_id: string;
  cypress_data: any;
  raw_data: any;
  metadata: any;
  generated_at: Date;
  created_at: Date;
}

export class ExplorationResultRepository {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  // Exploration Session methods
  async createExplorationSession(session: ExplorationSession): Promise<string> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO exploration_sessions (
          id, project_id, test_case_id, user_id, status, start_time, end_time,
          total_duration, settings, summary, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id
      `;
      
      const values = [
        session.id,
        session.projectId,
        session.testCaseId,
        session.userId,
        session.status,
        new Date(session.startTime),
        session.endTime ? new Date(session.endTime) : null,
        session.totalDuration,
        JSON.stringify(session.settings),
        JSON.stringify(session.summary)
      ];

      const result = await client.query(query, values);
      console.log(`Created exploration session: ${session.id}`);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async updateExplorationSession(session: ExplorationSession): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
        UPDATE exploration_sessions 
        SET status = $2, end_time = $3, total_duration = $4, 
            settings = $5, summary = $6, updated_at = NOW()
        WHERE id = $1
      `;
      
      const values = [
        session.id,
        session.status,
        session.endTime ? new Date(session.endTime) : null,
        session.totalDuration,
        JSON.stringify(session.settings),
        JSON.stringify(session.summary)
      ];

      await client.query(query, values);
      console.log(`Updated exploration session: ${session.id}`);
    } finally {
      client.release();
    }
  }

  async getExplorationSession(sessionId: string): Promise<ExplorationSession | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM exploration_sessions WHERE id = $1
      `;
      
      const result = await client.query(query, [sessionId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as ExplorationSessionRow;
      
      // Get navigation sequences for this session
      const sequences = await this.getNavigationSequencesBySession(sessionId);
      
      return {
        id: row.id,
        projectId: row.project_id,
        testCaseId: row.test_case_id,
        userId: row.user_id,
        status: row.status,
        startTime: row.start_time.getTime(),
        endTime: row.end_time?.getTime(),
        navigationSequences: sequences,
        totalDuration: row.total_duration,
        settings: row.settings,
        summary: row.summary
      };
    } finally {
      client.release();
    }
  }

  async getExplorationSessionsByProject(projectId: string): Promise<ExplorationSession[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM exploration_sessions 
        WHERE project_id = $1 
        ORDER BY created_at DESC
      `;
      
      const result = await client.query(query, [projectId]);
      
      const sessions: ExplorationSession[] = [];
      for (const row of result.rows as ExplorationSessionRow[]) {
        const sequences = await this.getNavigationSequencesBySession(row.id);
        
        sessions.push({
          id: row.id,
          projectId: row.project_id,
          testCaseId: row.test_case_id,
          userId: row.user_id,
          status: row.status,
          startTime: row.start_time.getTime(),
          endTime: row.end_time?.getTime(),
          navigationSequences: sequences,
          totalDuration: row.total_duration,
          settings: row.settings,
          summary: row.summary
        });
      }
      
      return sessions;
    } finally {
      client.release();
    }
  }

  // Navigation Sequence methods
  async createNavigationSequence(sequence: NavigationSequence): Promise<string> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO navigation_sequences (
          id, session_id, test_case_id, start_time, end_time, status,
          start_url, final_url, navigation_plan, total_duration,
          error_count, completion_percentage, metrics, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING id
      `;
      
      const values = [
        sequence.id,
        sequence.sessionId,
        sequence.testCaseId,
        new Date(sequence.startTime),
        sequence.endTime ? new Date(sequence.endTime) : null,
        sequence.status,
        sequence.startUrl,
        sequence.finalUrl,
        JSON.stringify(sequence.navigationPlan),
        sequence.totalDuration,
        sequence.errorCount,
        sequence.completionPercentage,
        JSON.stringify(sequence.metrics)
      ];

      const result = await client.query(query, values);
      console.log(`Created navigation sequence: ${sequence.id}`);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async updateNavigationSequence(sequence: NavigationSequence): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
        UPDATE navigation_sequences 
        SET status = $2, end_time = $3, final_url = $4, total_duration = $5,
            error_count = $6, completion_percentage = $7, metrics = $8, updated_at = NOW()
        WHERE id = $1
      `;
      
      const values = [
        sequence.id,
        sequence.status,
        sequence.endTime ? new Date(sequence.endTime) : null,
        sequence.finalUrl,
        sequence.totalDuration,
        sequence.errorCount,
        sequence.completionPercentage,
        JSON.stringify(sequence.metrics)
      ];

      await client.query(query, values);
      console.log(`Updated navigation sequence: ${sequence.id}`);
    } finally {
      client.release();
    }
  }

  async getNavigationSequence(sequenceId: string): Promise<NavigationSequence | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM navigation_sequences WHERE id = $1
      `;
      
      const result = await client.query(query, [sequenceId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as NavigationSequenceRow;
      
      // Get related data
      const actions = await this.getNavigationActionsBySequence(sequenceId);
      const pageStates = await this.getPageStatesBySequence(sequenceId);
      const collectedInputs = await this.getCollectedInputsBySequence(sequenceId);
      
      return {
        id: row.id,
        sessionId: row.session_id,
        testCaseId: row.test_case_id,
        startTime: row.start_time.getTime(),
        endTime: row.end_time?.getTime(),
        status: row.status,
        startUrl: row.start_url,
        finalUrl: row.final_url,
        actions,
        pageStates,
        collectedInputs,
        navigationPlan: row.navigation_plan,
        totalDuration: row.total_duration,
        errorCount: row.error_count,
        completionPercentage: row.completion_percentage,
        metrics: row.metrics
      };
    } finally {
      client.release();
    }
  }

  async getNavigationSequencesBySession(sessionId: string): Promise<NavigationSequence[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM navigation_sequences 
        WHERE session_id = $1 
        ORDER BY start_time ASC
      `;
      
      const result = await client.query(query, [sessionId]);
      
      const sequences: NavigationSequence[] = [];
      for (const row of result.rows as NavigationSequenceRow[]) {
        const actions = await this.getNavigationActionsBySequence(row.id);
        const pageStates = await this.getPageStatesBySequence(row.id);
        const collectedInputs = await this.getCollectedInputsBySequence(row.id);
        
        sequences.push({
          id: row.id,
          sessionId: row.session_id,
          testCaseId: row.test_case_id,
          startTime: row.start_time.getTime(),
          endTime: row.end_time?.getTime(),
          status: row.status,
          startUrl: row.start_url,
          finalUrl: row.final_url,
          actions,
          pageStates,
          collectedInputs,
          navigationPlan: row.navigation_plan,
          totalDuration: row.total_duration,
          errorCount: row.error_count,
          completionPercentage: row.completion_percentage,
          metrics: row.metrics
        });
      }
      
      return sequences;
    } finally {
      client.release();
    }
  }

  // Navigation Action methods
  async createNavigationAction(action: NavigationAction, sequenceId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO navigation_actions (
          id, sequence_id, type, timestamp, selector, value, url,
          coordinates, duration, success, error, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING id
      `;
      
      const values = [
        action.id,
        sequenceId,
        action.type,
        new Date(action.timestamp),
        action.selector,
        action.value ? JSON.stringify(action.value) : null,
        action.url,
        action.coordinates ? JSON.stringify(action.coordinates) : null,
        action.duration,
        action.success,
        action.error,
        action.metadata ? JSON.stringify(action.metadata) : null
      ];

      const result = await client.query(query, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getNavigationActionsBySequence(sequenceId: string): Promise<NavigationAction[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM navigation_actions 
        WHERE sequence_id = $1 
        ORDER BY timestamp ASC
      `;
      
      const result = await client.query(query, [sequenceId]);
      
      return result.rows.map((row: NavigationActionRow) => ({
        id: row.id,
        type: row.type as any,
        timestamp: row.timestamp.getTime(),
        selector: row.selector,
        value: row.value ? JSON.parse(row.value) : undefined,
        url: row.url,
        coordinates: row.coordinates ? JSON.parse(row.coordinates) : undefined,
        duration: row.duration,
        success: row.success,
        error: row.error,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));
    } finally {
      client.release();
    }
  }

  // Page State methods
  async createPageState(pageState: PageState, sequenceId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO page_states (
          id, sequence_id, url, title, timestamp, dom_snapshot, screenshot_path,
          viewport_size, load_time, http_status, elements, forms, errors, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        RETURNING id
      `;
      
      const values = [
        pageState.id,
        sequenceId,
        pageState.url,
        pageState.title,
        new Date(pageState.timestamp),
        pageState.domSnapshot,
        pageState.screenshotPath,
        JSON.stringify(pageState.viewportSize),
        pageState.loadTime,
        pageState.httpStatus,
        JSON.stringify(pageState.elements),
        JSON.stringify(pageState.forms),
        JSON.stringify(pageState.errors),
        JSON.stringify(pageState.metadata)
      ];

      const result = await client.query(query, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getPageStatesBySequence(sequenceId: string): Promise<PageState[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM page_states 
        WHERE sequence_id = $1 
        ORDER BY timestamp ASC
      `;
      
      const result = await client.query(query, [sequenceId]);
      
      return result.rows.map((row: PageStateRow) => ({
        id: row.id,
        url: row.url,
        title: row.title,
        timestamp: row.timestamp.getTime(),
        domSnapshot: row.dom_snapshot,
        screenshotPath: row.screenshot_path,
        viewportSize: row.viewport_size,
        loadTime: row.load_time,
        httpStatus: row.http_status,
        elements: row.elements,
        forms: row.forms,
        errors: row.errors,
        metadata: row.metadata
      }));
    } finally {
      client.release();
    }
  }

  // Collected Input methods
  async createCollectedInput(input: CollectedInput, sequenceId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO collected_inputs (
          id, sequence_id, element_selector, field_name, field_type, value,
          timestamp, confidence, source, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id
      `;
      
      const inputId = `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const values = [
        inputId,
        sequenceId,
        input.elementSelector,
        input.fieldName,
        input.fieldType,
        JSON.stringify(input.value),
        new Date(input.timestamp),
        input.confidence,
        input.source
      ];

      const result = await client.query(query, values);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  async getCollectedInputsBySequence(sequenceId: string): Promise<CollectedInput[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM collected_inputs 
        WHERE sequence_id = $1 
        ORDER BY timestamp ASC
      `;
      
      const result = await client.query(query, [sequenceId]);
      
      return result.rows.map((row: CollectedInputRow) => ({
        elementSelector: row.element_selector,
        fieldName: row.field_name,
        fieldType: row.field_type,
        value: JSON.parse(row.value),
        timestamp: row.timestamp.getTime(),
        confidence: row.confidence,
        source: row.source
      }));
    } finally {
      client.release();
    }
  }

  // Exploration Result methods
  async saveExplorationResult(result: ExplorationResult): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Save the main exploration result
      const resultQuery = `
        INSERT INTO exploration_results (
          id, session_id, cypress_data, raw_data, metadata, generated_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `;
      
      const resultId = `result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const resultValues = [
        resultId,
        result.session.id,
        JSON.stringify(result.cypressCompatibleData),
        JSON.stringify(result.rawData),
        JSON.stringify(result.metadata),
        new Date(result.metadata.generatedAt)
      ];

      await client.query(resultQuery, resultValues);

      // Save navigation sequences and related data
      for (const sequence of result.session.navigationSequences) {
        await this.createNavigationSequence(sequence);
        
        for (const action of sequence.actions) {
          await this.createNavigationAction(action, sequence.id);
        }
        
        for (const pageState of sequence.pageStates) {
          await this.createPageState(pageState, sequence.id);
        }
        
        for (const input of sequence.collectedInputs) {
          await this.createCollectedInput(input, sequence.id);
        }
      }

      await client.query('COMMIT');
      console.log(`Saved complete exploration result: ${resultId}`);
      return resultId;
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to save exploration result:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getExplorationResult(resultId: string): Promise<ExplorationResult | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM exploration_results WHERE id = $1
      `;
      
      const result = await client.query(query, [resultId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as ExplorationResultRow;
      const session = await this.getExplorationSession(row.session_id);
      
      if (!session) {
        return null;
      }

      return {
        session,
        cypressCompatibleData: row.cypress_data,
        rawData: row.raw_data,
        metadata: row.metadata
      };
    } finally {
      client.release();
    }
  }

  async getExplorationResultsBySession(sessionId: string): Promise<ExplorationResult[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM exploration_results 
        WHERE session_id = $1 
        ORDER BY generated_at DESC
      `;
      
      const result = await client.query(query, [sessionId]);
      const session = await this.getExplorationSession(sessionId);
      
      if (!session) {
        return [];
      }

      return result.rows.map((row: ExplorationResultRow) => ({
        session,
        cypressCompatibleData: row.cypress_data,
        rawData: row.raw_data,
        metadata: row.metadata
      }));
    } finally {
      client.release();
    }
  }

  // Cleanup methods
  async deleteExplorationSession(sessionId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete in order due to foreign key constraints
      await client.query('DELETE FROM collected_inputs WHERE sequence_id IN (SELECT id FROM navigation_sequences WHERE session_id = $1)', [sessionId]);
      await client.query('DELETE FROM page_states WHERE sequence_id IN (SELECT id FROM navigation_sequences WHERE session_id = $1)', [sessionId]);
      await client.query('DELETE FROM navigation_actions WHERE sequence_id IN (SELECT id FROM navigation_sequences WHERE session_id = $1)', [sessionId]);
      await client.query('DELETE FROM navigation_sequences WHERE session_id = $1', [sessionId]);
      await client.query('DELETE FROM exploration_results WHERE session_id = $1', [sessionId]);
      await client.query('DELETE FROM exploration_sessions WHERE id = $1', [sessionId]);

      await client.query('COMMIT');
      console.log(`Deleted exploration session: ${sessionId}`);
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to delete exploration session:', error);
      return false;
    } finally {
      client.release();
    }
  }

  async cleanupOldSessions(retentionDays: number = 30): Promise<number> {
    const client = await this.pool.connect();
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const query = `
        SELECT id FROM exploration_sessions 
        WHERE created_at < $1 AND status IN ('completed', 'failed', 'cancelled')
      `;
      
      const result = await client.query(query, [cutoffDate]);
      let deletedCount = 0;
      
      for (const row of result.rows) {
        if (await this.deleteExplorationSession(row.id)) {
          deletedCount++;
        }
      }

      console.log(`Cleaned up ${deletedCount} old exploration sessions`);
      return deletedCount;
    } finally {
      client.release();
    }
  }

  // NestJS-compatible methods
  async findBySessionId(sessionId: string): Promise<ExplorationResult[]> {
    return this.getExplorationResultsBySession(sessionId);
  }
}