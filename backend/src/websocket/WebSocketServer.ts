import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { parse } from 'url';
import {
  WebSocketMessage,
  AnyWebSocketMessage,
  MessageType,
  MessageValidator,
  MessageFactory,
  JoinProjectPayload,
  StatusRequestPayload
} from './MessageTypes';

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  projectId?: string;
  userId?: string;
  lastPing: number;
}

export class WebSocketServerManager {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocketClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  public endpoints: any; // Will be set from outside

  constructor(server: any, path: string = '/ws') {
    this.wss = new WebSocketServer({
      server,
      path,
      verifyClient: this.verifyClient.bind(this)
    });

    this.setupEventHandlers();
    this.startPingInterval();

    console.log(`WebSocket server initialized on path: ${path}`);
  }

  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    // Basic verification - in production, add proper authentication
    const url = parse(info.req.url || '', true);
    
    // Allow connections with valid project ID or authentication
    if (url.query.projectId || url.query.token) {
      return true;
    }

    // For development, allow all connections
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    return false;
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleServerError.bind(this));
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const clientId = this.generateClientId();
    const url = parse(req.url || '', true);
    const projectId = url.query.projectId as string;
    const userId = url.query.userId as string;

    const client: WebSocketClient = {
      id: clientId,
      ws,
      projectId,
      userId,
      lastPing: Date.now()
    };

    this.clients.set(clientId, client);

    console.log(`Client connected: ${clientId}, Project: ${projectId || 'none'}, Total clients: ${this.clients.size}`);

    // Set up client event handlers
    ws.on('message', (data) => this.handleMessage(clientId, data));
    ws.on('close', () => this.handleDisconnection(clientId));
    ws.on('error', (error) => this.handleClientError(clientId, error));
    ws.on('pong', () => this.handlePong(clientId));

    // Send welcome message
    const welcomeMessage = MessageFactory.createWelcomeMessage(clientId, projectId);
    this.sendToClient(clientId, welcomeMessage);
  }

  private handleMessage(clientId: string, data: any): void {
    try {
      const rawMessage = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) {
        console.warn(`Message from unknown client: ${clientId}`);
        return;
      }

      // Validate message format
      const validation = MessageValidator.validateMessage(rawMessage);
      if (!validation.isValid) {
        console.warn(`Invalid message from ${clientId}:`, validation.errors);
        this.sendError(clientId, `Invalid message: ${validation.errors.join(', ')}`);
        return;
      }

      const message = rawMessage as AnyWebSocketMessage;
      console.log(`Message from ${clientId}:`, message.type);

      // Update last activity
      client.lastPing = Date.now();

      // Route message based on type
      this.routeMessage(clientId, message);

    } catch (error) {
      console.error(`Error parsing message from ${clientId}:`, error);
      this.sendError(clientId, 'Invalid message format');
    }
  }

  private routeMessage(clientId: string, message: AnyWebSocketMessage): void {
    switch (message.type) {
      case MessageType.PING:
        const pongMessage = MessageFactory.createMessage(MessageType.PONG, {
          timestamp: Date.now()
        }, message.messageId);
        this.sendToClient(clientId, pongMessage);
        break;

      case MessageType.JOIN_PROJECT:
        this.handleJoinProject(clientId, message.payload as JoinProjectPayload);
        break;

      case MessageType.LEAVE_PROJECT:
        this.handleLeaveProject(clientId);
        break;

      case MessageType.STATUS_REQUEST:
        this.handleStatusRequest(clientId, message.payload as StatusRequestPayload);
        break;

      case MessageType.USER_INPUT_RESPONSE:
        this.handleUserInputResponse(clientId, message);
        break;

      case MessageType.NOTIFICATION_ACTION:
        this.handleNotificationAction(clientId, message);
        break;

      default:
        console.warn(`Unknown message type from ${clientId}: ${message.type}`);
        this.sendError(clientId, `Unknown message type: ${message.type}`);
    }
  }

  private handleJoinProject(clientId: string, payload: JoinProjectPayload): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.projectId = payload.projectId;
    client.userId = payload.userId;
    console.log(`Client ${clientId} joined project: ${payload.projectId}`);

    const projectClients = this.getProjectClients(payload.projectId);
    const joinedMessage = MessageFactory.createMessage(MessageType.PROJECT_JOINED, {
      projectId: payload.projectId,
      clientCount: projectClients.length
    });

    this.sendToClient(clientId, joinedMessage);
  }

  private handleLeaveProject(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const projectId = client.projectId;
    client.projectId = undefined;
    client.userId = undefined;
    
    console.log(`Client ${clientId} left project: ${projectId}`);

    const leftMessage = MessageFactory.createMessage(MessageType.PROJECT_LEFT, {
      projectId: projectId || ''
    });

    this.sendToClient(clientId, leftMessage);
  }

  private handleStatusRequest(clientId: string, payload: StatusRequestPayload): void {
    // This would integrate with the project processing service
    // For now, send a mock response
    const statusMessage = MessageFactory.createStatusUpdateMessage(
      payload.projectId,
      'in-progress',
      45,
      'ai-processing',
      'Processing test cases with AI...'
    );

    this.sendToClient(clientId, statusMessage);
  }

  private handleUserInputResponse(clientId: string, message: AnyWebSocketMessage): void {
    console.log(`User input response from ${clientId}:`, message.payload);
    
    // Forward to endpoints handler if available
    if (this.endpoints) {
      const payload = message.payload as any;
      this.endpoints.handleUserInputResponse(clientId, payload.requestId, payload.inputs);
    }
  }

  private handleNotificationAction(clientId: string, message: AnyWebSocketMessage): void {
    console.log(`Notification action from ${clientId}:`, message.payload);
    // This would integrate with the notification service
    // For now, just log the action
  }

  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`Client disconnected: ${clientId}, Project: ${client.projectId || 'none'}`);
      this.clients.delete(clientId);
    }
    console.log(`Total clients: ${this.clients.size}`);
  }

  private handleClientError(clientId: string, error: Error): void {
    console.error(`Client error for ${clientId}:`, error.message);
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      this.sendError(clientId, 'Connection error occurred');
    }
  }

  private handleServerError(error: Error): void {
    console.error('WebSocket server error:', error);
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = Date.now();
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const timeoutMs = 30000; // 30 seconds

      this.clients.forEach((client, clientId) => {
        if (now - client.lastPing > timeoutMs) {
          console.log(`Client ${clientId} ping timeout, disconnecting`);
          client.ws.terminate();
          this.clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      });
    }, 15000); // Check every 15 seconds
  }

  // Public methods for sending messages

  public sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Error sending message to ${clientId}:`, error);
      return false;
    }
  }

  public sendToProject(projectId: string, message: WebSocketMessage): number {
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.projectId === projectId && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`Error sending message to client ${client.id} in project ${projectId}:`, error);
        }
      }
    });

    return sentCount;
  }

  public sendToAll(message: WebSocketMessage): number {
    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`Error broadcasting message to client ${client.id}:`, error);
        }
      }
    });

    return sentCount;
  }

  public sendError(clientId: string, errorMessage: string, code: string = 'GENERIC_ERROR'): boolean {
    const errorMsg = MessageFactory.createErrorMessage(code, errorMessage);
    return this.sendToClient(clientId, errorMsg);
  }

  public sendNotification(
    clientId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error',
    projectId?: string
  ): boolean {
    const notification = MessageFactory.createNotificationMessage(
      this.generateMessageId(),
      title,
      message,
      type,
      projectId
    );
    return this.sendToClient(clientId, notification);
  }

  public broadcastNotificationToProject(
    projectId: string,
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error'
  ): number {
    const notification = MessageFactory.createNotificationMessage(
      this.generateMessageId(),
      title,
      message,
      type,
      projectId
    );
    return this.sendToProject(projectId, notification);
  }

  public sendStatusUpdate(
    clientId: string,
    projectId: string,
    status: 'pending' | 'in-progress' | 'completed' | 'failed',
    progress: number,
    currentStep?: string,
    message?: string
  ): boolean {
    const statusUpdate = MessageFactory.createStatusUpdateMessage(
      projectId,
      status,
      progress,
      currentStep,
      message
    );
    return this.sendToClient(clientId, statusUpdate);
  }

  public broadcastStatusUpdateToProject(
    projectId: string,
    status: 'pending' | 'in-progress' | 'completed' | 'failed',
    progress: number,
    currentStep?: string,
    message?: string
  ): number {
    const statusUpdate = MessageFactory.createStatusUpdateMessage(
      projectId,
      status,
      progress,
      currentStep,
      message
    );
    return this.sendToProject(projectId, statusUpdate);
  }

  // Utility methods

  public getClientCount(): number {
    return this.clients.size;
  }

  public getConnectionInfo(): any {
    const projectStats: Record<string, number> = {};
    
    for (const client of this.clients.values()) {
      if (client.projectId) {
        projectStats[client.projectId] = (projectStats[client.projectId] || 0) + 1;
      }
    }
    
    return {
      totalClients: this.clients.size,
      projectBreakdown: projectStats,
      serverUptime: Date.now() - this.startTime,
      activeConnections: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        projectId: client.projectId,
        userId: client.userId,
        connectedAt: client.lastPing
      }))
    };
  }

  public getProjectClients(projectId: string): WebSocketClient[] {
    const projectClients: WebSocketClient[] = [];
    this.clients.forEach((client) => {
      if (client.projectId === projectId) {
        projectClients.push(client);
      }
    });
    return projectClients;
  }

  public isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return client ? client.ws.readyState === WebSocket.OPEN : false;
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup
  public shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, 'Server shutting down');
      }
    });

    this.wss.close(() => {
      console.log('WebSocket server closed');
    });
  }
}