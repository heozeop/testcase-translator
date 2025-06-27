import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);

  constructor(
    @Inject('DATABASE_POOL')
    private readonly pool: Pool,
  ) {}

  async getHealth() {
    const healthChecks = {
      database: false,
      filesystem: false,
      memory: false,
      uptime: 0,
      timestamp: new Date().toISOString(),
    };

    try {
      // Database health check
      const dbResult = await this.pool.query('SELECT 1 as health');
      healthChecks.database = dbResult.rows[0]?.health === 1;
    } catch (error) {
      this.logger.warn('Database health check failed:', error);
      healthChecks.database = false;
    }

    try {
      // Filesystem health check
      const tempFile = path.join(os.tmpdir(), 'health-check.tmp');
      fs.writeFileSync(tempFile, 'health-check');
      const content = fs.readFileSync(tempFile, 'utf8');
      fs.unlinkSync(tempFile);
      healthChecks.filesystem = content === 'health-check';
    } catch (error) {
      this.logger.warn('Filesystem health check failed:', error);
      healthChecks.filesystem = false;
    }

    // Memory health check (consider healthy if free memory > 100MB)
    const freeMemory = os.freemem();
    healthChecks.memory = freeMemory > 100 * 1024 * 1024;

    // Uptime
    healthChecks.uptime = process.uptime();

    const isHealthy = healthChecks.database && healthChecks.filesystem && healthChecks.memory;

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks: healthChecks,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  async getMetrics() {
    try {
      const metrics = {
        system: {
          uptime: process.uptime(),
          memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal,
            external: process.memoryUsage().external,
            rss: process.memoryUsage().rss,
            free: os.freemem(),
            totalSystem: os.totalmem(),
          },
          cpu: {
            usage: process.cpuUsage(),
            loadAverage: os.loadavg(),
            cores: os.cpus().length,
          },
          platform: {
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            nodeVersion: process.version,
          },
        },
        database: await this.getDatabaseMetrics(),
        application: {
          pid: process.pid,
          ppid: process.ppid,
          startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
          environment: process.env.NODE_ENV || 'development',
        },
        timestamp: new Date().toISOString(),
      };

      return {
        data: metrics,
        message: 'System metrics retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve metrics:', error);
      throw error;
    }
  }

  private async getDatabaseMetrics() {
    try {
      const [
        connectionCount,
        dbSize,
        tableStats,
      ] = await Promise.allSettled([
        this.pool.query('SELECT count(*) as connections FROM pg_stat_activity'),
        this.pool.query('SELECT pg_database_size(current_database()) as size'),
        this.pool.query(`
          SELECT 
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_rows,
            n_dead_tup as dead_rows
          FROM pg_stat_user_tables
          ORDER BY n_live_tup DESC
          LIMIT 10
        `),
      ]);

      return {
        connections: connectionCount.status === 'fulfilled' ? 
          connectionCount.value.rows[0]?.connections : null,
        size: dbSize.status === 'fulfilled' ? 
          dbSize.value.rows[0]?.size : null,
        tableStats: tableStats.status === 'fulfilled' ? 
          tableStats.value.rows : [],
        poolInfo: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
        },
      };
    } catch (error) {
      this.logger.warn('Failed to get database metrics:', error);
      return {
        error: 'Database metrics unavailable',
      };
    }
  }

  async getVersion() {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    let version = '1.0.0';
    let name = 'testcase-translator';

    try {
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        version = packageJson.version || version;
        name = packageJson.name || name;
      }
    } catch (error) {
      this.logger.warn('Failed to read package.json:', error);
    }

    return {
      data: {
        name,
        version,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        buildDate: process.env.BUILD_DATE || new Date().toISOString(),
        gitCommit: process.env.GIT_COMMIT || 'unknown',
      },
      message: 'Version information retrieved successfully',
    };
  }

  async getActiveSessions() {
    try {
      // This would integrate with WebSocket connection tracking
      // For now, return mock data
      const sessions = {
        websocket: {
          total: 0,
          active: 0,
          rooms: [],
        },
        database: {
          activeConnections: this.pool.totalCount,
          idleConnections: this.pool.idleCount,
          waitingConnections: this.pool.waitingCount,
        },
        processes: {
          exploration: 0,
          generation: 0,
          parsing: 0,
        },
      };

      return {
        data: sessions,
        message: 'Active sessions retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve active sessions:', error);
      throw error;
    }
  }

  async getErrors(limit: number = 50) {
    try {
      // This would integrate with error logging system
      // For now, return mock data
      const errors: any[] = [];

      return {
        data: {
          errors,
          total: errors.length,
          limit,
        },
        message: 'Recent errors retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve errors:', error);
      throw error;
    }
  }
}