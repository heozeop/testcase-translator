import { WebSocketServerManager } from './WebSocketServer';
import {
  MessageType,
  MessageFactory,
  UserInputRequestPayload,
  ProjectUpdatePayload,
  ProcessingStepPayload,
  // NotificationPayload
} from './MessageTypes';

export class WebSocketEndpoints {
  private wsManager: WebSocketServerManager;
  private activeInputRequests: Map<string, {
    requestId: string;
    projectId: string;
    clientId: string;
    timeout: NodeJS.Timeout;
    resolve: (inputs: any) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(wsManager: WebSocketServerManager) {
    this.wsManager = wsManager;
  }

  // =============================================================================
  // PROJECT PROCESSING ENDPOINTS
  // =============================================================================

  /**
   * Notify clients about project processing updates
   */
  public notifyProjectUpdate(projectId: string, update: Partial<ProjectUpdatePayload>): number {
    const message = MessageFactory.createMessage(MessageType.PROJECT_UPDATE, {
      projectId,
      status: 'in-progress',
      progress: 0,
      steps: [],
      ...update
    } as ProjectUpdatePayload);

    return this.wsManager.sendToProject(projectId, message);
  }

  /**
   * Notify clients about individual processing step updates
   */
  public notifyProcessingStep(
    projectId: string,
    stepId: string,
    stepName: string,
    status: 'pending' | 'in-progress' | 'completed' | 'failed',
    progress?: number,
    message?: string,
    details?: any
  ): number {
    const stepMessage = MessageFactory.createMessage(MessageType.PROCESSING_STEP, {
      stepId,
      stepName,
      status,
      progress,
      message,
      timestamp: new Date().toISOString(),
      details
    } as ProcessingStepPayload);

    return this.wsManager.sendToProject(projectId, stepMessage);
  }

  /**
   * Broadcast status updates to all clients in a project
   */
  public broadcastStatusUpdate(
    projectId: string,
    status: 'pending' | 'in-progress' | 'completed' | 'failed',
    progress: number,
    currentStep?: string,
    message?: string,
    _estimatedTimeRemaining?: number
  ): number {
    return this.wsManager.broadcastStatusUpdateToProject(
      projectId,
      status,
      progress,
      currentStep,
      message
    );
  }

  // =============================================================================
  // FILE PROCESSING ENDPOINTS
  // =============================================================================

  /**
   * Notify clients about file upload progress
   */
  public notifyFileUploadProgress(
    projectId: string,
    fileId: string,
    fileName: string,
    progress: number,
    stage: 'uploading' | 'validating' | 'parsing' | 'processing' | 'completed' | 'failed',
    message?: string
  ): number {
    const progressMessage = MessageFactory.createMessage(MessageType.FILE_UPLOAD_PROGRESS, {
      projectId,
      fileId,
      fileName,
      progress,
      stage,
      message
    });

    return this.wsManager.sendToProject(projectId, progressMessage);
  }

  /**
   * Notify clients about test case extraction results
   */
  public notifyTestCaseExtraction(
    projectId: string,
    fileId: string,
    extractedCount: number,
    validCount: number,
    invalidCount: number,
    testCases?: Array<{
      id: string;
      name: string;
      status: 'valid' | 'invalid' | 'warning';
      issues?: string[];
    }>
  ): number {
    const extractionMessage = MessageFactory.createMessage(MessageType.TEST_CASE_EXTRACTION, {
      projectId,
      fileId,
      extractedCount,
      validCount,
      invalidCount,
      testCases
    });

    return this.wsManager.sendToProject(projectId, extractionMessage);
  }

  // =============================================================================
  // USER INPUT REQUEST ENDPOINTS
  // =============================================================================

  /**
   * Request input from users with timeout handling
   */
  public async requestUserInput(
    projectId: string,
    title: string,
    description: string,
    fields: Array<{
      id: string;
      name: string;
      label: string;
      type: 'text' | 'number' | 'email' | 'password' | 'select' | 'checkbox' | 'textarea' | 'file';
      required: boolean;
      placeholder?: string;
      validation?: any;
      options?: Array<{ value: string; label: string }>;
      defaultValue?: any;
      helpText?: string;
    }>,
    timeoutSeconds: number = 300, // 5 minutes default
    context?: any
  ): Promise<{ [fieldId: string]: any }> {
    const requestId = this.generateRequestId();
    const projectClients = this.wsManager.getProjectClients(projectId);

    if (projectClients.length === 0) {
      throw new Error('No clients connected to project');
    }

    // For now, send to the first connected client
    // In a real implementation, you might want more sophisticated routing
    const targetClient = projectClients[0];

    const inputRequest = MessageFactory.createMessage(MessageType.USER_INPUT_REQUEST, {
      requestId,
      projectId,
      title,
      description,
      fields,
      timeout: timeoutSeconds,
      context
    } as UserInputRequestPayload);

    return new Promise<{ [fieldId: string]: any }>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.activeInputRequests.delete(requestId);
        
        // Notify client about timeout
        const timeoutMessage = MessageFactory.createMessage(MessageType.INPUT_REQUEST_TIMEOUT, {
          requestId,
          projectId,
          timeoutAt: new Date().toISOString()
        });
        this.wsManager.sendToClient(targetClient.id, timeoutMessage);

        reject(new Error('User input request timed out'));
      }, timeoutSeconds * 1000);

      // Store the request
      this.activeInputRequests.set(requestId, {
        requestId,
        projectId,
        clientId: targetClient.id,
        timeout,
        resolve,
        reject
      });

      // Send request to client
      const sent = this.wsManager.sendToClient(targetClient.id, inputRequest);
      if (!sent) {
        clearTimeout(timeout);
        this.activeInputRequests.delete(requestId);
        reject(new Error('Failed to send input request to client'));
      }
    });
  }

  /**
   * Handle user input responses
   */
  public handleUserInputResponse(clientId: string, requestId: string, inputs: { [fieldId: string]: any }): boolean {
    const activeRequest = this.activeInputRequests.get(requestId);
    if (!activeRequest) {
      console.warn(`Received response for unknown request: ${requestId}`);
      return false;
    }

    if (activeRequest.clientId !== clientId) {
      console.warn(`Received response from unexpected client: ${clientId} for request: ${requestId}`);
      return false;
    }

    // Clear timeout and remove from active requests
    clearTimeout(activeRequest.timeout);
    this.activeInputRequests.delete(requestId);

    // Resolve the promise
    activeRequest.resolve(inputs);

    return true;
  }

  /**
   * Cancel an active input request
   */
  public cancelUserInputRequest(requestId: string): boolean {
    const activeRequest = this.activeInputRequests.get(requestId);
    if (!activeRequest) {
      return false;
    }

    clearTimeout(activeRequest.timeout);
    this.activeInputRequests.delete(requestId);
    activeRequest.reject(new Error('Input request cancelled'));

    return true;
  }

  // =============================================================================
  // NOTIFICATION ENDPOINTS
  // =============================================================================

  /**
   * Send notification to specific client
   */
  public sendNotification(
    clientId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error',
    projectId?: string,
    _duration?: number,
    _actions?: Array<{
      id: string;
      label: string;
      action: string;
      primary?: boolean;
    }>
  ): boolean {
    return this.wsManager.sendNotification(clientId, title, message, type, projectId);
  }

  /**
   * Broadcast notification to all clients in a project
   */
  public broadcastNotificationToProject(
    projectId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error',
    _duration?: number,
    _actions?: Array<{
      id: string;
      label: string;
      action: string;
      primary?: boolean;
    }>
  ): number {
    return this.wsManager.broadcastNotificationToProject(projectId, title, message, type);
  }

  /**
   * Broadcast notification to all connected clients
   */
  public broadcastGlobalNotification(
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error',
    _duration?: number
  ): number {
    const notification = MessageFactory.createNotificationMessage(
      this.generateNotificationId(),
      title,
      message,
      type
    );

    return this.wsManager.sendToAll(notification);
  }

  // =============================================================================
  // SCRIPT GENERATION ENDPOINTS
  // =============================================================================

  /**
   * Notify about individual script generation progress
   */
  public notifyScriptGeneration(
    projectId: string,
    testCaseId: string,
    status: 'queued' | 'generating' | 'completed' | 'failed',
    progress?: number,
    scriptPath?: string,
    error?: string
  ): number {
    const scriptMessage = MessageFactory.createMessage(MessageType.SCRIPT_GENERATION, {
      projectId,
      testCaseId,
      status,
      progress,
      scriptPath,
      error
    });

    return this.wsManager.sendToProject(projectId, scriptMessage);
  }

  /**
   * Notify about batch script generation progress
   */
  public notifyScriptGenerationBatch(
    projectId: string,
    totalScripts: number,
    completedScripts: number,
    failedScripts: number,
    currentScript?: string
  ): number {
    const overallProgress = Math.round((completedScripts / totalScripts) * 100);
    
    const batchMessage = MessageFactory.createMessage(MessageType.SCRIPT_GENERATION_BATCH, {
      projectId,
      totalScripts,
      completedScripts,
      failedScripts,
      currentScript,
      overallProgress
    });

    return this.wsManager.sendToProject(projectId, batchMessage);
  }

  // =============================================================================
  // SESSION MANAGEMENT
  // =============================================================================

  /**
   * Get active sessions for a project
   */
  public getProjectSessions(projectId: string) {
    const clients = this.wsManager.getProjectClients(projectId);
    return clients.map(client => ({
      clientId: client.id,
      userId: client.userId,
      projectId: client.projectId,
      lastPing: client.lastPing,
      connected: this.wsManager.isClientConnected(client.id)
    }));
  }

  /**
   * Disconnect all clients from a project
   */
  public disconnectProjectClients(projectId: string, reason: string = 'Project terminated'): number {
    const clients = this.wsManager.getProjectClients(projectId);
    let disconnectedCount = 0;

    clients.forEach(client => {
      this.wsManager.sendError(client.id, reason, 'PROJECT_TERMINATED');
      // Force disconnect after a brief delay to allow error message to be sent
      setTimeout(() => {
        if (client.ws.readyState === 1) { // OPEN
          client.ws.close(1000, reason);
        }
      }, 100);
      disconnectedCount++;
    });

    return disconnectedCount;
  }

  /**
   * Get statistics about active connections
   */
  public getConnectionStats() {
    const totalClients = this.wsManager.getClientCount();
    const projectStats: { [projectId: string]: number } = {};

    // This would need to be implemented in WebSocketServerManager
    // For now, return basic stats
    return {
      totalClients,
      activeRequests: this.activeInputRequests.size,
      projectStats
    };
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up expired input requests
   */
  public cleanupExpiredRequests(): void {
    // This could be called periodically to clean up any stuck requests
    // Most cleanup is handled by timeouts, but this provides additional safety
    this.activeInputRequests.forEach((_request, _requestId) => {
      // Additional cleanup logic if needed
    });
  }
}