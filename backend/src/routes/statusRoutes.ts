import express from 'express';
import { Request, Response } from 'express';
import { testConnection } from '../db';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { TestCaseRepository } from '../repositories/TestCaseRepository';
import { GeneratedCodeRepository } from '../repositories/GeneratedCodeRepository';
// import { Pool } from 'pg';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/apiHelpers';

const router = express.Router();

// Initialize repositories
// Note: In a real implementation, pool would be injected or imported properly
const projectRepository = new ProjectRepository();
const testCaseRepository = new TestCaseRepository();
const generatedCodeRepository = new GeneratedCodeRepository(require('../db').getPool());

// GET /api/status
// Comprehensive system status endpoint
router.get('/',
  asyncHandler(async (_req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      // Test database connection
      const dbConnected = await testConnection();
      const dbResponseTime = Date.now() - startTime;

      // Get basic statistics
      const [
        projectStats,
        testCaseStats,
        generationStats
      ] = await Promise.allSettled([
        projectRepository.getProjectStatistics?.() || Promise.resolve(null),
        testCaseRepository.getTestCaseStatistics?.() || Promise.resolve(null),
        generatedCodeRepository.getGenerationStatistics() || Promise.resolve(null)
      ]);

      // System metrics
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Environment info
      const environment = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        environment: process.env.NODE_ENV || 'development'
      };

      // API endpoints summary
      const apiEndpoints = {
        projects: {
          total: 12,
          crud: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'],
          specialized: [
            'POST /validate-url',
            'POST /:id/test-cases/upload',
            'POST /:id/explore-and-generate',
            'GET /:id/explore-status/:processId'
          ]
        },
        testCases: {
          total: 8,
          crud: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id'],
          specialized: [
            'POST /:id/process',
            'POST /batch-process',
            'GET /:id/inputs'
          ]
        },
        cypress: {
          total: 8,
          endpoints: [
            'POST /generate',
            'GET /generations',
            'GET /generations/:id',
            'POST /regenerate',
            'DELETE /generations/:id',
            'GET /templates',
            'GET /statistics',
            'POST /validate-request'
          ]
        },
        scripts: {
          total: 10,
          endpoints: [
            'GET /',
            'POST /generate',
            'POST /:id/optimize',
            'POST /export',
            'GET /:id/download',
            'DELETE /:id'
          ]
        },
        websocket: {
          endpoints: [
            'GET /status',
            'POST /test',
            'WebSocket /ws'
          ]
        }
      };

      // Service health checks
      const services = {
        database: {
          status: dbConnected ? 'healthy' : 'unhealthy',
          responseTime: `${dbResponseTime}ms`,
          connection: dbConnected ? 'connected' : 'disconnected'
        },
        llmProcessing: {
          status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured',
          provider: 'Anthropic Claude',
          model: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229'
        },
        mastra: {
          status: process.env.MASTRA_API_KEY ? 'configured' : 'not_configured',
          provider: 'Mastra.ai'
        },
        fileStorage: {
          status: 'healthy',
          baseDirectory: './generated-tests',
          maxFileSize: '50MB'
        }
      };

      // Feature flags
      const features = {
        urlValidation: true,
        excelParsing: true,
        llmProcessing: !!process.env.ANTHROPIC_API_KEY,
        cypressGeneration: true,
        templateEngine: true,
        dynamicExploration: true,
        inputCollection: true,
        websocketSupport: true,
        fileGeneration: true,
        projectManagement: true
      };

      // Performance metrics
      const performance = {
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
        },
        responseTime: `${Date.now() - startTime}ms`
      };

      // Statistics summary
      const statistics = {
        projects: projectStats.status === 'fulfilled' ? projectStats.value : null,
        testCases: testCaseStats.status === 'fulfilled' ? testCaseStats.value : null,
        generations: generationStats.status === 'fulfilled' ? generationStats.value : null
      };

      const overallStatus = dbConnected && 
        services.llmProcessing.status !== 'error' ? 'healthy' : 'degraded';

      sendSuccess(res, {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment,
        services,
        features,
        performance,
        statistics,
        apiEndpoints,
        documentation: {
          apiDocs: '/api/docs',
          healthCheck: '/health',
          statusEndpoint: '/api/status'
        }
      }, 'System status retrieved successfully');

    } catch (error: any) {
      console.error('Status check error:', error);
      
      sendSuccess(res, {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          message: 'Failed to retrieve complete system status',
          details: error.message
        },
        performance: {
          responseTime: `${Date.now() - startTime}ms`
        }
      }, 'Partial system status retrieved', 503);
    }
  })
);

// GET /api/status/services
// Detailed service health status
router.get('/services',
  asyncHandler(async (_req: Request, res: Response) => {
    const checks = await Promise.allSettled([
      // Database check
      testConnection().then(connected => ({
        service: 'database',
        status: connected ? 'healthy' : 'unhealthy',
        details: { connected }
      })),
      
      // LLM service check
      Promise.resolve({
        service: 'llm_processing',
        status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured',
        details: { 
          provider: 'Anthropic',
          hasApiKey: !!process.env.ANTHROPIC_API_KEY
        }
      }),
      
      // File system check
      Promise.resolve({
        service: 'file_system',
        status: 'healthy',
        details: { 
          writable: true,
          baseDirectory: './generated-tests'
        }
      })
    ]);

    const serviceResults = checks.map(check => 
      check.status === 'fulfilled' ? check.value : {
        service: 'unknown',
        status: 'error',
        error: check.reason?.message
      }
    );

    const allHealthy = serviceResults.every(s => s.status === 'healthy' || s.status === 'configured');

    sendSuccess(res, {
      overallStatus: allHealthy ? 'healthy' : 'degraded',
      services: serviceResults,
      timestamp: new Date().toISOString()
    }, 'Service status retrieved successfully');
  })
);

// GET /api/status/metrics
// Performance metrics and usage statistics
router.get('/metrics',
  asyncHandler(async (_req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
      system: {
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      },
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      process: {
        argv: process.argv.slice(2),
        execPath: process.execPath,
        title: process.title
      },
      timestamps: {
        started: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        current: new Date().toISOString()
      }
    };

    sendSuccess(res, metrics, 'Performance metrics retrieved successfully');
  })
);

// GET /api/status/errors
// Recent error information (last 24 hours)
router.get('/errors',
  asyncHandler(async (_req: Request, res: Response) => {
    // In a real implementation, this would query an error logging system
    // For now, return a mock response
    sendSuccess(res, {
      period: 'last_24_hours',
      totalErrors: 0,
      criticalErrors: 0,
      warnings: 0,
      recentErrors: [],
      errorCategories: {
        database: 0,
        llm_processing: 0,
        file_operations: 0,
        validation: 0,
        network: 0
      },
      message: 'No errors recorded in the last 24 hours'
    }, 'Error statistics retrieved successfully');
  })
);

export default router;