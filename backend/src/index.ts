import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { testConnection } from './db';
import projectRoutes from './routes/projectRoutes';
import websocketTestRoutes from './routes/websocketTestRoutes';
import { WebSocketServerManager } from './websocket/WebSocketServer';
import { WebSocketEndpoints } from './websocket/WebSocketEndpoints';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket server
const wsManager = new WebSocketServerManager(httpServer, '/ws');
const wsEndpoints = new WebSocketEndpoints(wsManager);

// Set up bi-directional reference
wsManager.endpoints = wsEndpoints;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make WebSocket manager and endpoints available to routes
app.locals.wsManager = wsManager;
app.locals.wsEndpoints = wsEndpoints;

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/websocket', websocketTestRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({ 
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString() 
  });
});

// WebSocket status endpoint
app.get('/api/websocket/status', (req, res) => {
  res.json({
    success: true,
    data: {
      clientCount: wsManager.getClientCount(),
      serverTime: new Date().toISOString()
    }
  });
});


// 404 handler
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err.stack);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    },
    timestamp: new Date().toISOString()
  });
});

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