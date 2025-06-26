import { WebSocketServerManager } from '../websocket/WebSocketServer';
import { MessageType } from '../websocket/MessageTypes';
import { InputCollectionService, InputRequest, InputResponse, InputCollectionSession } from './InputCollectionService';

export interface InputRequestMessage {
  type: MessageType.INPUT_REQUEST;
  payload: {
    request: InputRequest;
    sessionInfo: {
      sessionId: string;
      totalRequests: number;
      completedRequests: number;
      estimatedTimeRemaining: number;
    };
  };
}

export interface InputResponseMessage {
  type: MessageType.INPUT_RESPONSE;
  payload: {
    requestId: string;
    value: any;
    metadata?: any;
  };
}

export interface InputValidationMessage {
  type: MessageType.INPUT_VALIDATION_ERROR;
  payload: {
    requestId: string;
    errors: string[];
    suggestions?: string[];
  };
}

export interface InputSessionUpdateMessage {
  type: MessageType.INPUT_SESSION_UPDATE;
  payload: {
    sessionId: string;
    status: 'started' | 'progress' | 'completed' | 'cancelled' | 'expired';
    progress: {
      total: number;
      completed: number;
      pending: number;
      percentage: number;
    };
    currentRequest?: InputRequest;
    estimatedTimeRemaining?: number;
  };
}

export interface InputCollectionCompleteMessage {
  type: MessageType.INPUT_COLLECTION_COMPLETE;
  payload: {
    sessionId: string;
    results: {
      totalInputs: number;
      successfulInputs: number;
      failedInputs: number;
      skippedInputs: number;
    };
    collectedData: Record<string, any>;
    duration: number;
  };
}

export class InputCollectionWebSocketService {
  private wsManager: WebSocketServerManager;
  private inputService: InputCollectionService;
  private activeInputSessions: Map<string, {
    clientId: string;
    sessionId: string;
    startTime: number;
    currentRequestId?: string;
  }> = new Map();

  constructor(wsManager: WebSocketServerManager, inputService: InputCollectionService) {
    this.wsManager = wsManager;
    this.inputService = inputService;
    this.setupMessageHandlers();
  }

  private setupMessageHandlers(): void {
    // Handle input responses from clients
    this.wsManager.on('message', (clientId: string, message: any) => {
      if (message.type === MessageType.INPUT_RESPONSE) {
        this.handleInputResponse(clientId, message as InputResponseMessage);
      } else if (message.type === MessageType.INPUT_REQUEST_CANCEL) {
        this.handleInputCancel(clientId, message);
      } else if (message.type === MessageType.INPUT_SESSION_CANCEL) {
        this.handleSessionCancel(clientId, message);
      }
    });

    // Handle client disconnections
    this.wsManager.on('clientDisconnected', (clientId: string) => {
      this.handleClientDisconnection(clientId);
    });
  }

  async requestUserInput(
    clientId: string,
    request: InputRequest,
    sessionId?: string
  ): Promise<InputResponse> {
    // Get or create session
    const session = sessionId ? 
      this.inputService.getSession(sessionId) : 
      await this.inputService.createSession(
        `session-${Date.now()}`,
        request.context.testCaseId
      );

    if (!session) {
      throw new Error('Failed to create or find input session');
    }

    // Add request to session
    await this.inputService.addRequestToSession(session.sessionId, request.id);

    // Track active input session
    this.activeInputSessions.set(request.id, {
      clientId,
      sessionId: session.sessionId,
      startTime: Date.now(),
      currentRequestId: request.id
    });

    // Send session update
    await this.sendSessionUpdate(clientId, session);

    // Send input request to client
    await this.sendInputRequest(clientId, request, session);

    // Return promise that resolves when input is received
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanupInputSession(request.id);
        reject(new Error(`Input request ${request.id} timed out`));
      }, request.expiresAt ? request.expiresAt - Date.now() : 300000);

      // Store resolver for when response comes back
      (this.inputService as any).setResponseResolver(request.id, (response: InputResponse) => {
        clearTimeout(timeout);
        this.cleanupInputSession(request.id);
        resolve(response);
      });
    });
  }

  async requestMultipleInputs(
    clientId: string,
    requests: InputRequest[],
    sessionId?: string
  ): Promise<Map<string, InputResponse>> {
    // Create or get session
    const session = sessionId ? 
      this.inputService.getSession(sessionId) : 
      await this.inputService.createSession(
        `multi-session-${Date.now()}`,
        requests[0]?.context.testCaseId
      );

    if (!session) {
      throw new Error('Failed to create or find input session');
    }

    // Add all requests to session
    for (const request of requests) {
      await this.inputService.addRequestToSession(session.sessionId, request.id);
    }

    // Send session started message
    await this.sendSessionUpdate(clientId, session);

    // Send all requests sequentially or based on dependencies
    const responses = new Map<string, InputResponse>();
    const orderedRequests = this.orderRequestsByDependencies(requests);

    for (const request of orderedRequests) {
      try {
        const response = await this.requestUserInput(clientId, request, session.sessionId);
        responses.set(request.id, response);

        // Send progress update
        await this.sendSessionUpdate(clientId, session);
      } catch (error) {
        console.error(`Failed to collect input for ${request.id}:`, error);
        // Continue with other inputs unless critical
        if (request.metadata.priority === 'high') {
          throw error;
        }
      }
    }

    // Send completion message
    await this.sendCollectionComplete(clientId, session, responses);

    return responses;
  }

  private async sendInputRequest(
    clientId: string,
    request: InputRequest,
    session: InputCollectionSession
  ): Promise<void> {
    const message: InputRequestMessage = {
      type: MessageType.INPUT_REQUEST,
      payload: {
        request,
        sessionInfo: {
          sessionId: session.sessionId,
          totalRequests: session.totalRequests,
          completedRequests: session.completedRequests,
          estimatedTimeRemaining: this.calculateTimeRemaining(session)
        }
      }
    };

    await this.wsManager.sendToClient(clientId, message);
  }

  private async sendSessionUpdate(
    clientId: string,
    session: InputCollectionSession
  ): Promise<void> {
    const currentRequest = this.getCurrentRequest(session);
    
    const message: InputSessionUpdateMessage = {
      type: MessageType.INPUT_SESSION_UPDATE,
      payload: {
        sessionId: session.sessionId,
        status: this.mapSessionStatus(session.status),
        progress: {
          total: session.totalRequests,
          completed: session.completedRequests,
          pending: session.pendingRequests.length,
          percentage: session.totalRequests > 0 ? 
            (session.completedRequests / session.totalRequests) * 100 : 0
        },
        currentRequest,
        estimatedTimeRemaining: this.calculateTimeRemaining(session)
      }
    };

    await this.wsManager.sendToClient(clientId, message);
  }

  private async sendValidationError(
    clientId: string,
    requestId: string,
    errors: string[],
    suggestions?: string[]
  ): Promise<void> {
    const message: InputValidationMessage = {
      type: MessageType.INPUT_VALIDATION_ERROR,
      payload: {
        requestId,
        errors,
        suggestions
      }
    };

    await this.wsManager.sendToClient(clientId, message);
  }

  private async sendCollectionComplete(
    clientId: string,
    session: InputCollectionSession,
    responses: Map<string, InputResponse>
  ): Promise<void> {
    const successfulInputs = Array.from(responses.values()).filter(r => r.valid).length;
    const failedInputs = Array.from(responses.values()).filter(r => !r.valid).length;
    const skippedInputs = session.totalRequests - responses.size;

    // Collect data for return
    const collectedData: Record<string, any> = {};
    for (const [requestId, response] of responses) {
      if (response.valid) {
        collectedData[requestId] = response.value;
      }
    }

    const message: InputCollectionCompleteMessage = {
      type: MessageType.INPUT_COLLECTION_COMPLETE,
      payload: {
        sessionId: session.sessionId,
        results: {
          totalInputs: session.totalRequests,
          successfulInputs,
          failedInputs,
          skippedInputs
        },
        collectedData,
        duration: session.endTime ? session.endTime - session.startTime : 0
      }
    };

    await this.wsManager.sendToClient(clientId, message);
  }

  private async handleInputResponse(
    clientId: string,
    message: InputResponseMessage
  ): Promise<void> {
    const { requestId, value, metadata } = message.payload;

    try {
      // Submit the response to the input service
      const success = await this.inputService.submitInputResponse(requestId, value, metadata);

      if (!success) {
        // Get validation errors and send back to client
        const request = this.inputService.getActiveRequests().find(r => r.id === requestId);
        if (request) {
          // Re-validate to get specific errors
          const validation = await (this.inputService as any).validateInput(request, value);
          await this.sendValidationError(clientId, requestId, validation.errors);
        }
        return;
      }

      // Update session status
      const activeSession = this.getActiveSessionByRequestId(requestId);
      if (activeSession) {
        const session = this.inputService.getSession(activeSession.sessionId);
        if (session) {
          await this.sendSessionUpdate(clientId, session);
        }
      }

    } catch (error) {
      console.error(`Error handling input response for ${requestId}:`, error);
      await this.sendValidationError(clientId, requestId, [
        `Error processing input: ${error}`
      ]);
    }
  }

  private async handleInputCancel(clientId: string, message: any): Promise<void> {
    const { requestId } = message.payload;
    
    try {
      await this.inputService.cancelRequest(requestId);
      this.cleanupInputSession(requestId);
      
      // Notify client of cancellation
      await this.wsManager.sendToClient(clientId, {
        type: MessageType.INPUT_REQUEST_CANCELLED,
        payload: { requestId }
      });
    } catch (error) {
      console.error(`Error cancelling input request ${requestId}:`, error);
    }
  }

  private async handleSessionCancel(clientId: string, message: any): Promise<void> {
    const { sessionId } = message.payload;
    
    try {
      await this.inputService.cancelSession(sessionId);
      
      // Clean up all input sessions for this session
      for (const [requestId, activeSession] of this.activeInputSessions) {
        if (activeSession.sessionId === sessionId) {
          this.cleanupInputSession(requestId);
        }
      }
      
      // Notify client of session cancellation
      await this.wsManager.sendToClient(clientId, {
        type: MessageType.INPUT_SESSION_CANCELLED,
        payload: { sessionId }
      });
    } catch (error) {
      console.error(`Error cancelling input session ${sessionId}:`, error);
    }
  }

  private handleClientDisconnection(clientId: string): void {
    // Find and clean up all input sessions for this client
    const sessionsToCleanup: string[] = [];
    
    for (const [requestId, activeSession] of this.activeInputSessions) {
      if (activeSession.clientId === clientId) {
        sessionsToCleanup.push(requestId);
      }
    }
    
    // Cancel all pending requests
    for (const requestId of sessionsToCleanup) {
      this.inputService.cancelRequest(requestId);
      this.cleanupInputSession(requestId);
    }
  }

  private orderRequestsByDependencies(requests: InputRequest[]): InputRequest[] {
    const ordered: InputRequest[] = [];
    const remaining = [...requests];
    const processed = new Set<string>();

    // First pass: Add requests with no dependencies
    for (let i = remaining.length - 1; i >= 0; i--) {
      const request = remaining[i];
      const hasDependencies = request.context.relatedInputs?.some(
        relatedId => requests.some(r => r.id === relatedId)
      );
      
      if (!hasDependencies) {
        ordered.push(request);
        processed.add(request.id);
        remaining.splice(i, 1);
      }
    }

    // Subsequent passes: Add requests whose dependencies are satisfied
    while (remaining.length > 0) {
      let addedThisPass = false;
      
      for (let i = remaining.length - 1; i >= 0; i--) {
        const request = remaining[i];
        const dependenciesSatisfied = !request.context.relatedInputs?.some(
          relatedId => !processed.has(relatedId)
        );
        
        if (dependenciesSatisfied) {
          ordered.push(request);
          processed.add(request.id);
          remaining.splice(i, 1);
          addedThisPass = true;
        }
      }
      
      // Prevent infinite loop
      if (!addedThisPass) {
        ordered.push(...remaining);
        break;
      }
    }

    return ordered;
  }

  private getCurrentRequest(session: InputCollectionSession): InputRequest | undefined {
    if (session.pendingRequests.length === 0) return undefined;
    
    const currentRequestId = session.pendingRequests[0];
    return this.inputService.getActiveRequests().find(r => r.id === currentRequestId);
  }

  private calculateTimeRemaining(session: InputCollectionSession): number {
    const avgTimePerInput = 30000; // 30 seconds average
    return session.pendingRequests.length * avgTimePerInput;
  }

  private mapSessionStatus(status: string): 'started' | 'progress' | 'completed' | 'cancelled' | 'expired' {
    switch (status) {
      case 'active':
        return 'progress';
      case 'completed':
        return 'completed';
      case 'cancelled':
        return 'cancelled';
      case 'expired':
        return 'expired';
      default:
        return 'started';
    }
  }

  private getActiveSessionByRequestId(requestId: string): any {
    return this.activeInputSessions.get(requestId);
  }

  private cleanupInputSession(requestId: string): void {
    this.activeInputSessions.delete(requestId);
  }

  // Public API methods
  async broadcastInputRequest(request: InputRequest, targetClients?: string[]): Promise<void> {
    const clients = targetClients || this.wsManager.getConnectedClients();
    
    for (const clientId of clients) {
      try {
        await this.requestUserInput(clientId, request);
      } catch (error) {
        console.error(`Failed to send input request to client ${clientId}:`, error);
      }
    }
  }

  getActiveInputSessions(): Map<string, any> {
    return new Map(this.activeInputSessions);
  }

  async getSessionProgress(sessionId: string): Promise<{
    total: number;
    completed: number;
    pending: number;
    percentage: number;
  } | null> {
    const session = this.inputService.getSession(sessionId);
    if (!session) return null;

    return {
      total: session.totalRequests,
      completed: session.completedRequests,
      pending: session.pendingRequests.length,
      percentage: session.totalRequests > 0 ? 
        (session.completedRequests / session.totalRequests) * 100 : 0
    };
  }

  async notifyInputRequired(
    clientId: string,
    analysisResult: any,
    context: any
  ): Promise<void> {
    // Send notification that input collection will be needed
    const message = {
      type: MessageType.INPUT_COLLECTION_REQUIRED,
      payload: {
        priority: analysisResult.priorityLevel,
        estimatedTime: analysisResult.estimatedTime,
        inputCount: {
          required: analysisResult.missingInputs.length,
          suggested: analysisResult.suggestedInputs.length,
          optional: analysisResult.optionalInputs.length
        },
        context
      }
    };

    await this.wsManager.sendToClient(clientId, message);
  }
}