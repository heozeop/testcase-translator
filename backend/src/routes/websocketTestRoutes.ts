import { Router, Request, Response } from 'express';
import { WebSocketEndpoints } from '../websocket/WebSocketEndpoints';

const router = Router();

// Test endpoint to trigger WebSocket notifications
router.post('/test/notification', async (req: Request, res: Response): Promise<void> => {
  try {
    const wsEndpoints = req.app.locals.wsEndpoints as WebSocketEndpoints;
    const { projectId, title, message, type = 'info' } = req.body;

    if (!projectId || !title || !message) {
      return res.status(400).json({
        success: false,
        error: { message: 'projectId, title, and message are required' }
      });
    }

    const sentCount = wsEndpoints.broadcastNotificationToProject(
      projectId,
      title,
      message,
      type
    );

    res.json({
      success: true,
      data: { sentToClients: sentCount }
    });
  } catch (error: any) {
    console.error('WebSocket notification test error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to send notification' }
    });
  }
});

// Test endpoint to trigger status updates
router.post('/test/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const wsEndpoints = req.app.locals.wsEndpoints as WebSocketEndpoints;
    const { projectId, status, progress, currentStep, message } = req.body;

    if (!projectId || typeof progress !== 'number') {
      return res.status(400).json({
        success: false,
        error: { message: 'projectId and progress are required' }
      });
    }

    const sentCount = wsEndpoints.broadcastStatusUpdate(
      projectId,
      status || 'in-progress',
      progress,
      currentStep,
      message
    );

    res.json({
      success: true,
      data: { sentToClients: sentCount }
    });
  } catch (error: any) {
    console.error('WebSocket status test error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to send status update' }
    });
  }
});

// Test endpoint to request user input
router.post('/test/input-request', async (req: Request, res: Response): Promise<void> => {
  try {
    const wsEndpoints = req.app.locals.wsEndpoints as WebSocketEndpoints;
    const { projectId, title, description, fields, timeout = 60 } = req.body;

    if (!projectId || !title || !fields) {
      return res.status(400).json({
        success: false,
        error: { message: 'projectId, title, and fields are required' }
      });
    }

    const inputs = await wsEndpoints.requestUserInput(
      projectId,
      title,
      description || '',
      fields,
      timeout
    );

    res.json({
      success: true,
      data: { inputs }
    });
  } catch (error: any) {
    console.error('WebSocket input request test error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// Test endpoint to simulate file upload progress
router.post('/test/file-progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const wsEndpoints = req.app.locals.wsEndpoints as WebSocketEndpoints;
    const { projectId, fileName = 'test.xlsx' } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { message: 'projectId is required' }
      });
    }

    const fileId = `file_${Date.now()}`;

    // Simulate file upload progress
    const stages: Array<{
      stage: 'uploading' | 'validating' | 'parsing' | 'processing' | 'completed' | 'failed';
      progress: number;
      message: string;
    }> = [
      { stage: 'uploading', progress: 25, message: 'Uploading file...' },
      { stage: 'validating', progress: 50, message: 'Validating file format...' },
      { stage: 'parsing', progress: 75, message: 'Parsing Excel content...' },
      { stage: 'processing', progress: 90, message: 'Processing test cases...' },
      { stage: 'completed', progress: 100, message: 'File processing completed!' }
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index >= stages.length) {
        clearInterval(interval);
        return;
      }

      const stage = stages[index];
      wsEndpoints.notifyFileUploadProgress(
        projectId,
        fileId,
        fileName,
        stage.progress,
        stage.stage,
        stage.message
      );

      index++;
    }, 1000);

    res.json({
      success: true,
      data: { fileId, message: 'File progress simulation started' }
    });
  } catch (error: any) {
    console.error('WebSocket file progress test error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to simulate file progress' }
    });
  }
});

// Get project session information
router.get('/:projectId/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const wsEndpoints = req.app.locals.wsEndpoints as WebSocketEndpoints;
    const { projectId } = req.params;

    const sessions = wsEndpoints.getProjectSessions(projectId);

    res.json({
      success: true,
      data: { sessions }
    });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get project sessions' }
    });
  }
});

// Get connection statistics
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const wsEndpoints = req.app.locals.wsEndpoints as WebSocketEndpoints;
    const stats = wsEndpoints.getConnectionStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get connection stats' }
    });
  }
});

export default router;