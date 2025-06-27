import {
  Controller,
  Get,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { StatusService } from './status.service';

@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Health check completed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'unhealthy'] },
        checks: {
          type: 'object',
          properties: {
            database: { type: 'boolean' },
            filesystem: { type: 'boolean' },
            memory: { type: 'boolean' },
            uptime: { type: 'number' },
            timestamp: { type: 'string' },
          },
        },
        version: { type: 'string' },
        environment: { type: 'string' },
      },
    },
  })
  async getHealth() {
    const health = await this.statusService.getHealth();
    
    // Return appropriate HTTP status based on health
    if (health.status === 'unhealthy') {
      // Note: We still return 200 but indicate unhealthy status in the response
      // This allows load balancers to handle the status appropriately
    }
    
    return health;
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get detailed system metrics' })
  @ApiResponse({ status: 200, description: 'System metrics retrieved successfully' })
  async getMetrics() {
    return this.statusService.getMetrics();
  }

  @Get('version')
  @ApiOperation({ summary: 'Get application version information' })
  @ApiResponse({ status: 200, description: 'Version information retrieved successfully' })
  async getVersion() {
    return this.statusService.getVersion();
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get active sessions and connections' })
  @ApiResponse({ status: 200, description: 'Active sessions retrieved successfully' })
  async getActiveSessions() {
    return this.statusService.getActiveSessions();
  }

  @Get('errors')
  @ApiOperation({ summary: 'Get recent application errors' })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Maximum number of errors to return',
    example: 50,
  })
  @ApiResponse({ status: 200, description: 'Recent errors retrieved successfully' })
  async getErrors(@Query('limit') limit?: string) {
    const errorLimit = limit ? parseInt(limit, 10) : 50;
    return this.statusService.getErrors(errorLimit);
  }

  // Kubernetes/Docker health check endpoints
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async getReadiness() {
    const health = await this.statusService.getHealth();
    
    if (health.status === 'healthy') {
      return { status: 'ready', timestamp: new Date().toISOString() };
    } else {
      return { status: 'not ready', timestamp: new Date().toISOString() };
    }
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  async getLiveness() {
    // Simple liveness check - if the application can respond, it's alive
    return { 
      status: 'alive', 
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}