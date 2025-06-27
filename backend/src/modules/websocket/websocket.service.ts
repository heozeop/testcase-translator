import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

interface ConnectedClient {
  id: string;
  socket: Socket;
  sessionId?: string;
  projectId?: string;
  joinedAt: Date;
  lastActivity: Date;
}

interface InputRequest {
  id: string;
  sessionId: string;
  projectId?: string;
  type: 'text' | 'select' | 'confirm' | 'file';
  prompt: string;
  options?: string[];
  defaultValue?: string;
  required?: boolean;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
}

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);
  private readonly clients = new Map<string, ConnectedClient>();
  private readonly inputRequests = new Map<string, InputRequest>();
  private readonly pendingResponses = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }>();

  addClient(socket: Socket): void {
    const client: ConnectedClient = {
      id: socket.id,
      socket,
      joinedAt: new Date(),
      lastActivity: new Date(),
    };

    this.clients.set(socket.id, client);
    this.logger.log(`Client connected: ${socket.id}`);
    
    // Send welcome message
    socket.emit('connected', {
      clientId: socket.id,
      timestamp: new Date().toISOString(),
      message: 'Connected to Testcase Translator WebSocket',
    });
  }

  removeClient(socketId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      this.clients.delete(socketId);
      this.logger.log(`Client disconnected: ${socketId}`);
      
      // Cancel any pending input requests for this client
      this.cancelPendingRequests(socketId);
    }
  }

  updateClientActivity(socketId: string, data?: any): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.lastActivity = new Date();
      
      if (data?.sessionId) {
        client.sessionId = data.sessionId;
      }
      if (data?.projectId) {
        client.projectId = data.projectId;
      }
    }
  }

  async requestInput(
    sessionId: string,
    inputRequest: Omit<InputRequest, 'id' | 'sessionId'>
  ): Promise<any> {
    const requestId = `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const request: InputRequest = {
      id: requestId,
      sessionId,
      ...inputRequest,
    };

    this.inputRequests.set(requestId, request);

    // Find clients associated with this session
    const sessionClients = Array.from(this.clients.values()).filter(
      client => client.sessionId === sessionId
    );

    if (sessionClients.length === 0) {
      throw new Error(`No clients connected for session ${sessionId}`);
    }

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(requestId);
        this.inputRequests.delete(requestId);
        reject(new Error('Input request timed out'));
      }, 300000); // 5 minutes timeout

      this.pendingResponses.set(requestId, { resolve, reject, timeout });

      // Send input request to all clients in the session
      sessionClients.forEach(client => {
        client.socket.emit('input_request', {
          requestId,
          type: request.type,
          prompt: request.prompt,
          options: request.options,
          defaultValue: request.defaultValue,
          required: request.required,
          validation: request.validation,
          timestamp: new Date().toISOString(),
        });
      });

      this.logger.log(`Input request sent: ${requestId} for session ${sessionId}`);
    });
  }

  handleInputResponse(socketId: string, data: any): void {
    const { requestId, value, cancelled } = data;
    
    if (!requestId) {
      this.logger.warn(`Invalid input response from ${socketId}: missing requestId`);
      return;
    }

    const pendingResponse = this.pendingResponses.get(requestId);
    if (!pendingResponse) {
      this.logger.warn(`No pending response found for request ${requestId}`);
      return;
    }

    // Clear timeout
    clearTimeout(pendingResponse.timeout);
    this.pendingResponses.delete(requestId);
    this.inputRequests.delete(requestId);

    if (cancelled) {
      pendingResponse.reject(new Error('Input request cancelled by user'));
    } else {
      pendingResponse.resolve(value);
    }

    this.logger.log(`Input response received: ${requestId} from ${socketId}`);
  }

  joinSession(socketId: string, sessionId: string): void {
    const client = this.clients.get(socketId);
    if (!client) {
      this.logger.warn(`Attempt to join session by unknown client: ${socketId}`);
      return;
    }

    client.sessionId = sessionId;
    client.socket.join(`session_${sessionId}`);
    
    this.logger.log(`Client ${socketId} joined session ${sessionId}`);
    
    // Notify client
    client.socket.emit('session_joined', {
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  leaveSession(socketId: string, sessionId: string): void {
    const client = this.clients.get(socketId);
    if (!client) {
      return;
    }

    client.socket.leave(`session_${sessionId}`);
    if (client.sessionId === sessionId) {
      client.sessionId = undefined;
    }
    
    this.logger.log(`Client ${socketId} left session ${sessionId}`);
    
    // Notify client
    client.socket.emit('session_left', {
      sessionId,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastToSession(sessionId: string, event: string, data: any): void {
    const sessionClients = Array.from(this.clients.values()).filter(
      client => client.sessionId === sessionId
    );

    sessionClients.forEach(client => {
      client.socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    });

    this.logger.log(`Broadcast to session ${sessionId}: ${event}`);
  }

  getConnectedClients(): any[] {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      sessionId: client.sessionId,
      projectId: client.projectId,
      joinedAt: client.joinedAt,
      lastActivity: client.lastActivity,
    }));
  }

  getSessionClients(sessionId: string): any[] {
    return Array.from(this.clients.values())
      .filter(client => client.sessionId === sessionId)
      .map(client => ({
        id: client.id,
        joinedAt: client.joinedAt,
        lastActivity: client.lastActivity,
      }));
  }

  private cancelPendingRequests(socketId: string): void {
    const client = this.clients.get(socketId);
    if (!client?.sessionId) {
      return;
    }

    // Find and cancel pending requests for this session if no other clients
    const sessionClients = Array.from(this.clients.values()).filter(
      c => c.sessionId === client.sessionId && c.id !== socketId
    );

    if (sessionClients.length === 0) {
      // No other clients in session, cancel pending requests
      Array.from(this.pendingResponses.entries()).forEach(([requestId, response]) => {
        const request = this.inputRequests.get(requestId);
        if (request?.sessionId === client.sessionId) {
          clearTimeout(response.timeout);
          this.pendingResponses.delete(requestId);
          this.inputRequests.delete(requestId);
          response.reject(new Error('Client disconnected'));
        }
      });
    }
  }
}