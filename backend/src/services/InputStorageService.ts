import { Pool } from 'pg';
import { InputEncryptionService, EncryptedData } from './InputEncryptionService';
import { InputRequest, InputResponse, InputCollectionSession } from './InputCollectionService';

export interface StoredInputData {
  id: string;
  requestId: string;
  sessionId: string;
  testCaseId?: string;
  scenarioId?: string;
  inputType: string;
  category: string;
  securityLevel: string;
  encryptedData: EncryptedData;
  validationPassed: boolean;
  metadata: any;
  createdAt: Date;
  expiresAt?: Date;
  lastAccessedAt?: Date;
  accessCount: number;
}

export interface InputSearchCriteria {
  sessionId?: string;
  testCaseId?: string;
  scenarioId?: string;
  category?: string;
  securityLevel?: string;
  dateRange?: {
    from: Date;
    to: Date;
  };
  includeExpired?: boolean;
}

export interface InputStorageConfig {
  encryptionPassword: string;
  autoCleanupExpired: boolean;
  cleanupInterval: number; // milliseconds
  maxRetentionDays: number;
  auditEnabled: boolean;
  compressionEnabled: boolean;
}

export class InputStorageService {
  private dbPool: Pool;
  private encryptionService: InputEncryptionService;
  private config: InputStorageConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    dbPool: Pool,
    config: InputStorageConfig
  ) {
    this.dbPool = dbPool;
    this.config = config;
    this.encryptionService = new InputEncryptionService(config.encryptionPassword);
    
    if (config.autoCleanupExpired) {
      this.startAutoCleanup();
    }
  }

  async initializeDatabase(): Promise<void> {
    const client = await this.dbPool.connect();
    
    try {
      // Create input_data table
      await client.query(`
        CREATE TABLE IF NOT EXISTS input_data (
          id VARCHAR(255) PRIMARY KEY,
          request_id VARCHAR(255) NOT NULL,
          session_id VARCHAR(255) NOT NULL,
          test_case_id VARCHAR(255),
          scenario_id VARCHAR(255),
          input_type VARCHAR(100) NOT NULL,
          category VARCHAR(100) NOT NULL,
          security_level VARCHAR(50) NOT NULL,
          encrypted_data JSONB NOT NULL,
          validation_passed BOOLEAN NOT NULL DEFAULT false,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE,
          last_accessed_at TIMESTAMP WITH TIME ZONE,
          access_count INTEGER DEFAULT 0
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_input_data_session_id ON input_data(session_id)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_input_data_test_case_id ON input_data(test_case_id)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_input_data_category ON input_data(category)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_input_data_expires_at ON input_data(expires_at)
      `);

      // Create input_sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS input_sessions (
          session_id VARCHAR(255) PRIMARY KEY,
          test_case_id VARCHAR(255),
          status VARCHAR(50) NOT NULL,
          total_requests INTEGER DEFAULT 0,
          completed_requests INTEGER DEFAULT 0,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP WITH TIME ZONE
        )
      `);

      // Create audit table if auditing is enabled
      if (this.config.auditEnabled) {
        await client.query(`
          CREATE TABLE IF NOT EXISTS input_audit_log (
            id SERIAL PRIMARY KEY,
            action VARCHAR(50) NOT NULL,
            data_id VARCHAR(255),
            session_id VARCHAR(255),
            user_id VARCHAR(255),
            security_level VARCHAR(50),
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            details JSONB
          )
        `);
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON input_audit_log(timestamp)
        `);
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_audit_data_id ON input_audit_log(data_id)
        `);
      }

    } finally {
      client.release();
    }
  }

  async storeInputData(
    request: InputRequest,
    response: InputResponse,
    sessionId: string
  ): Promise<string> {
    const client = await this.dbPool.connect();
    
    try {
      const dataId = this.generateDataId();
      
      // Encrypt the input value based on security level
      const encryptedData = await this.encryptionService.encryptInput(
        response.value,
        request.metadata.securityLevel,
        request.category,
        request.expiresAt
      );

      // Calculate expiration date
      const expiresAt = this.calculateExpirationDate(request.metadata.securityLevel);

      await client.query(`
        INSERT INTO input_data (
          id, request_id, session_id, test_case_id, scenario_id,
          input_type, category, security_level, encrypted_data,
          validation_passed, metadata, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        dataId,
        request.id,
        sessionId,
        request.context.testCaseId,
        request.context.scenarioId,
        request.type,
        request.category,
        request.metadata.securityLevel,
        JSON.stringify(encryptedData),
        response.valid,
        JSON.stringify({
          ...response.metadata,
          inputMetadata: request.metadata
        }),
        expiresAt
      ]);

      // Log audit trail
      if (this.config.auditEnabled) {
        await this.logAuditEvent('store', dataId, sessionId, request.metadata.securityLevel);
      }

      return dataId;

    } finally {
      client.release();
    }
  }

  async retrieveInputData(dataId: string, userId?: string): Promise<any> {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM input_data WHERE id = $1
      `, [dataId]);

      if (result.rows.length === 0) {
        throw new Error(`Input data with ID ${dataId} not found`);
      }

      const row = result.rows[0];
      
      // Check if data has expired
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        throw new Error('Input data has expired');
      }

      // Update access tracking
      await client.query(`
        UPDATE input_data 
        SET last_accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1
        WHERE id = $1
      `, [dataId]);

      // Decrypt the data
      const encryptedData: EncryptedData = JSON.parse(row.encrypted_data);
      const decryptedValue = await this.encryptionService.decryptInput(encryptedData);

      // Log audit trail
      if (this.config.auditEnabled) {
        await this.logAuditEvent('access', dataId, row.session_id, row.security_level, userId);
      }

      return {
        id: row.id,
        requestId: row.request_id,
        sessionId: row.session_id,
        testCaseId: row.test_case_id,
        scenarioId: row.scenario_id,
        inputType: row.input_type,
        category: row.category,
        securityLevel: row.security_level,
        value: decryptedValue,
        validationPassed: row.validation_passed,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastAccessedAt: row.last_accessed_at,
        accessCount: row.access_count
      };

    } finally {
      client.release();
    }
  }

  async retrieveSessionInputs(sessionId: string, userId?: string): Promise<Record<string, any>> {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM input_data 
        WHERE session_id = $1 
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY created_at ASC
      `, [sessionId]);

      const inputs: Record<string, any> = {};

      for (const row of result.rows) {
        try {
          // Decrypt the data
          const encryptedData: EncryptedData = JSON.parse(row.encrypted_data);
          const decryptedValue = await this.encryptionService.decryptInput(encryptedData);
          
          inputs[row.request_id] = {
            id: row.id,
            value: decryptedValue,
            type: row.input_type,
            category: row.category,
            validationPassed: row.validation_passed,
            createdAt: row.created_at
          };

          // Update access tracking
          await client.query(`
            UPDATE input_data 
            SET last_accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1
            WHERE id = $1
          `, [row.id]);

        } catch (error) {
          console.error(`Failed to decrypt input data ${row.id}:`, error);
          // Continue with other inputs
        }
      }

      // Log audit trail
      if (this.config.auditEnabled) {
        await this.logAuditEvent('bulk_access', sessionId, sessionId, 'session', userId);
      }

      return inputs;

    } finally {
      client.release();
    }
  }

  async searchInputData(criteria: InputSearchCriteria): Promise<StoredInputData[]> {
    const client = await this.dbPool.connect();
    
    try {
      let query = 'SELECT * FROM input_data WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (criteria.sessionId) {
        query += ` AND session_id = $${paramIndex++}`;
        params.push(criteria.sessionId);
      }

      if (criteria.testCaseId) {
        query += ` AND test_case_id = $${paramIndex++}`;
        params.push(criteria.testCaseId);
      }

      if (criteria.scenarioId) {
        query += ` AND scenario_id = $${paramIndex++}`;
        params.push(criteria.scenarioId);
      }

      if (criteria.category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(criteria.category);
      }

      if (criteria.securityLevel) {
        query += ` AND security_level = $${paramIndex++}`;
        params.push(criteria.securityLevel);
      }

      if (criteria.dateRange) {
        query += ` AND created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        params.push(criteria.dateRange.from, criteria.dateRange.to);
      }

      if (!criteria.includeExpired) {
        query += ` AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;
      }

      query += ' ORDER BY created_at DESC';

      const result = await client.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        requestId: row.request_id,
        sessionId: row.session_id,
        testCaseId: row.test_case_id,
        scenarioId: row.scenario_id,
        inputType: row.input_type,
        category: row.category,
        securityLevel: row.security_level,
        encryptedData: JSON.parse(row.encrypted_data),
        validationPassed: row.validation_passed,
        metadata: JSON.parse(row.metadata || '{}'),
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastAccessedAt: row.last_accessed_at,
        accessCount: row.access_count
      }));

    } finally {
      client.release();
    }
  }

  async storeSession(session: InputCollectionSession): Promise<void> {
    const client = await this.dbPool.connect();
    
    try {
      await client.query(`
        INSERT INTO input_sessions (
          session_id, test_case_id, status, total_requests, 
          completed_requests, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (session_id) DO UPDATE SET
          status = EXCLUDED.status,
          total_requests = EXCLUDED.total_requests,
          completed_requests = EXCLUDED.completed_requests,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP,
          completed_at = CASE 
            WHEN EXCLUDED.status = 'completed' THEN CURRENT_TIMESTAMP 
            ELSE input_sessions.completed_at 
          END
      `, [
        session.sessionId,
        session.testCaseId,
        session.status,
        session.totalRequests,
        session.completedRequests,
        JSON.stringify(session.metadata)
      ]);

    } finally {
      client.release();
    }
  }

  async deleteInputData(dataId: string, userId?: string): Promise<boolean> {
    const client = await this.dbPool.connect();
    
    try {
      // Get the data first for audit logging
      const selectResult = await client.query(`
        SELECT security_level, session_id FROM input_data WHERE id = $1
      `, [dataId]);

      if (selectResult.rows.length === 0) {
        return false;
      }

      const { security_level, session_id } = selectResult.rows[0];

      // Perform secure deletion
      const result = await client.query(`
        DELETE FROM input_data WHERE id = $1
      `, [dataId]);

      if (result.rowCount && result.rowCount > 0) {
        // Log audit trail
        if (this.config.auditEnabled) {
          await this.logAuditEvent('delete', dataId, session_id, security_level, userId);
        }
        return true;
      }

      return false;

    } finally {
      client.release();
    }
  }

  async cleanupExpiredData(): Promise<number> {
    const client = await this.dbPool.connect();
    
    try {
      const result = await client.query(`
        DELETE FROM input_data 
        WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `);

      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0 && this.config.auditEnabled) {
        await this.logAuditEvent('cleanup', 'bulk', 'system', 'system');
      }

      return deletedCount;

    } finally {
      client.release();
    }
  }

  async getStorageStatistics(): Promise<{
    totalInputs: number;
    inputsBySecurityLevel: Record<string, number>;
    inputsByCategory: Record<string, number>;
    expiredInputs: number;
    storageSize: number;
    oldestInput: Date | null;
    newestInput: Date | null;
  }> {
    const client = await this.dbPool.connect();
    
    try {
      // Total inputs
      const totalResult = await client.query(`
        SELECT COUNT(*) as count FROM input_data
      `);
      const totalInputs = parseInt(totalResult.rows[0].count);

      // Inputs by security level
      const securityLevelResult = await client.query(`
        SELECT security_level, COUNT(*) as count 
        FROM input_data 
        GROUP BY security_level
      `);
      const inputsBySecurityLevel: Record<string, number> = {};
      for (const row of securityLevelResult.rows) {
        inputsBySecurityLevel[row.security_level] = parseInt(row.count);
      }

      // Inputs by category
      const categoryResult = await client.query(`
        SELECT category, COUNT(*) as count 
        FROM input_data 
        GROUP BY category
      `);
      const inputsByCategory: Record<string, number> = {};
      for (const row of categoryResult.rows) {
        inputsByCategory[row.category] = parseInt(row.count);
      }

      // Expired inputs
      const expiredResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM input_data 
        WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `);
      const expiredInputs = parseInt(expiredResult.rows[0].count);

      // Date range
      const dateRangeResult = await client.query(`
        SELECT 
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM input_data
      `);
      const { oldest, newest } = dateRangeResult.rows[0];

      // Storage size estimation (rough)
      const sizeResult = await client.query(`
        SELECT pg_total_relation_size('input_data') as size
      `);
      const storageSize = parseInt(sizeResult.rows[0].size || 0);

      return {
        totalInputs,
        inputsBySecurityLevel,
        inputsByCategory,
        expiredInputs,
        storageSize,
        oldestInput: oldest ? new Date(oldest) : null,
        newestInput: newest ? new Date(newest) : null
      };

    } finally {
      client.release();
    }
  }

  private calculateExpirationDate(securityLevel: string): Date | null {
    const requirements = this.encryptionService.getSecurityLevelRequirement(securityLevel);
    
    if (requirements.maxRetention === Infinity) {
      return null;
    }

    return new Date(Date.now() + requirements.maxRetention);
  }

  private async logAuditEvent(
    action: string,
    dataId: string,
    sessionId: string,
    securityLevel: string,
    userId?: string
  ): Promise<void> {
    if (!this.config.auditEnabled) return;

    const client = await this.dbPool.connect();
    
    try {
      await client.query(`
        INSERT INTO input_audit_log (
          action, data_id, session_id, user_id, security_level, details
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        action,
        dataId,
        sessionId,
        userId,
        securityLevel,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          userAgent: 'backend-service'
        })
      ]);

    } catch (error) {
      console.error('Failed to log audit event:', error);
    } finally {
      client.release();
    }
  }

  private generateDataId(): string {
    return `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        const deletedCount = await this.cleanupExpiredData();
        if (deletedCount > 0) {
          console.log(`Cleaned up ${deletedCount} expired input records`);
        }
      } catch (error) {
        console.error('Auto cleanup failed:', error);
      }
    }, this.config.cleanupInterval);
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    database: boolean;
    encryption: boolean;
    storage: any;
  }> {
    try {
      // Test database connection
      const client = await this.dbPool.connect();
      client.release();

      // Test encryption service
      const encryptionHealth = await this.encryptionService.healthCheck();

      // Get storage statistics
      const storage = await this.getStorageStatistics();

      const allHealthy = encryptionHealth.status === 'healthy';
      
      return {
        status: allHealthy ? 'healthy' : 'warning',
        database: true,
        encryption: encryptionHealth.status === 'healthy',
        storage
      };

    } catch (error) {
      return {
        status: 'error',
        database: false,
        encryption: false,
        storage: null
      };
    }
  }
}