import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { testConnection } from './db';
import projectRoutes from './routes/projectRoutes';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/projects', projectRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({ 
    status: dbConnected ? 'healthy' : 'unhealthy',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString() 
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    // Echo the message back for now
    ws.send(JSON.stringify({ type: 'echo', data: message.toString() }));
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
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
  console.log(`WebSocket server is ready`);
  
  // Test database connection on startup
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('Warning: Could not connect to database on startup');
  }
});