import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { testConnection } from './db';
import projectRoutes from './routes/projectRoutes';
import testCaseRoutes from './routes/testCaseRoutes';
import scriptRoutes from './routes/scriptRoutes';
import websocketTestRoutes from './routes/websocketTestRoutes';
import cypressRoutes from './routes/cypressRoutes';
import statusRoutes from './routes/statusRoutes';
import { WebSocketServerManager } from './websocket/WebSocketServer';
import { WebSocketEndpoints } from './websocket/WebSocketEndpoints';
import { 
  errorHandler, 
  notFoundHandler, 
  securityHeaders, 
  requestTimeout,
  rateLimitHandler 
} from './middleware/errorHandler';
import { sendSuccess } from './utils/apiHelpers';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket server
const wsManager = new WebSocketServerManager(httpServer, '/ws');
const wsEndpoints = new WebSocketEndpoints(wsManager);

// Set up bi-directional reference
wsManager.endpoints = wsEndpoints;

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
});

// Security and basic middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(securityHeaders);
app.use(limiter);
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(morgan('combined'));
app.use(requestTimeout(30000)); // 30 second timeout
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Make WebSocket manager and endpoints available to routes
app.locals.wsManager = wsManager;
app.locals.wsEndpoints = wsEndpoints;

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/test-cases', testCaseRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/cypress', cypressRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/websocket', websocketTestRoutes);

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const dbConnected = await testConnection();
    const healthData = {
      status: dbConnected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbConnected ? 'connected' : 'disconnected',
        websocket: wsManager ? 'active' : 'inactive',
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      version: process.env.npm_package_version || 'unknown'
    };
    
    if (dbConnected) {
      sendSuccess(res, healthData);
    } else {
      res.status(503).json({
        success: false,
        data: healthData,
        error: {
          code: 'SERVICE_UNHEALTHY',
          message: 'One or more services are not healthy'
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: 'Health check failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// WebSocket status endpoint
app.get('/api/websocket/status', (_req, res) => {
  sendSuccess(res, {
    clientCount: wsManager.getClientCount(),
    serverTime: new Date().toISOString(),
    connections: wsManager.getConnectionInfo()
  });
});

// API documentation endpoint
app.get('/api/docs', (_req, res) => {
  sendSuccess(res, {
    name: 'Testcase Translator API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'RESTful API for converting Excel test cases to Cypress scripts',
    endpoints: {
      projects: {
        base: '/api/projects',
        description: 'Project management operations',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      },
      testCases: {
        base: '/api/test-cases',
        description: 'Test case processing and management',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      },
      scripts: {
        base: '/api/scripts',
        description: 'Legacy Cypress script generation and optimization',
        methods: ['GET', 'POST', 'DELETE']
      },
      cypress: {
        base: '/api/cypress',
        description: 'Modern Cypress test generation with templates and lifecycle management',
        methods: ['GET', 'POST', 'DELETE']
      },
      status: {
        base: '/api/status',
        description: 'System status monitoring and performance metrics',
        methods: ['GET']
      },
      websocket: {
        base: '/api/websocket',
        description: 'WebSocket testing and real-time communication'
      },
      health: {
        base: '/health',
        description: 'System health and status monitoring'
      }
    },
    features: [
      'Excel test case parsing and AI processing',
      'Dynamic page exploration and form analysis',
      'Real-time input collection via WebSocket',
      'Cypress script generation with templates',
      'Script optimization and validation',
      'Project export in multiple formats'
    ],
    documentation: 'https://docs.testcase-translator.com'
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.BACKEND_PORT || 8000;
httpServer.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`WebSocket server is ready on /ws`);
  console.log(`WebSocket clients: ${wsManager.getClientCount()}`);
  
  // Test database connection on startup
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('Warning: Could not connect to database on startup');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  wsManager.shutdown();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  wsManager.shutdown();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});