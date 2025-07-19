import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/mysql';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);

  constructor(
    private readonly em: EntityManager,
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
      await this.em.getConnection().execute('SELECT 1 as health');
      healthChecks.database = true;
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
        this.em.getConnection().execute('SELECT COUNT(*) as connections FROM information_schema.processlist'),
        this.em.getConnection().execute('SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as size FROM information_schema.tables WHERE table_schema = DATABASE()'),
        this.em.getConnection().execute(`
          SELECT 
            table_schema as schemaname,
            table_name as tablename,
            table_rows as live_rows
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
          ORDER BY table_rows DESC
          LIMIT 10
        `),
      ]);

      return {
        connections: connectionCount.status === 'fulfilled' ? 
          (connectionCount.value[0] as any)[0]?.connections : null,
        size: dbSize.status === 'fulfilled' ? 
          (dbSize.value[0] as any)[0]?.size : null,
        tableStats: tableStats.status === 'fulfilled' ? 
          (tableStats.value[0] as any) : [],
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
      const sessions = {
        websocket: {
          total: 0,
          active: 0,
          rooms: [],
        },
        database: {
          activeConnections: 0,
          idleConnections: 0,
          waitingConnections: 0,
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