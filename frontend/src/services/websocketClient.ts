import { io, Socket } from 'socket.io-client';
import {
  WebSocketMessage,
  AnyWebSocketMessage,
  MessageType,
  MessageFactory,
  WebSocketConnectionState,
  WelcomeMessage,
  NotificationMessage,
  StatusUpdateMessage,
  ProjectUpdateMessage,
  UserInputRequestMessage,
  FileUploadProgressMessage,
  TestCaseExtractionMessage,
  ProcessingStepMessage,
  ErrorMessage
} from '../types/websocket';

export type WebSocketEventHandler<T = any> = (data: T) => void;

export interface WebSocketClientOptions {
  url: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  pingInterval?: number;
  connectionTimeout?: number;
}

export interface WebSocketEventMap {
  'connection-state-change': WebSocketConnectionState;
  'welcome': WelcomeMessage['payload'];
  'notification': NotificationMessage['payload'];
  'status-update': StatusUpdateMessage['payload'];
  'project-update': ProjectUpdateMessage['payload'];
  'user-input-request': UserInputRequestMessage['payload'];
  'file-upload-progress': FileUploadProgressMessage['payload'];
  'test-case-extraction': TestCaseExtractionMessage['payload'];
  'processing-step': ProcessingStepMessage['payload'];
  'error': ErrorMessage['payload'];
  'project-joined': { projectId: string; clientCount: number };
  'project-left': { projectId: string };
}

export class WebSocketClient {
  private socket: Socket | null = null;
  private options: Required<WebSocketClientOptions>;
  private connectionState: WebSocketConnectionState;
  private eventHandlers: Map<keyof WebSocketEventMap, Set<WebSocketEventHandler>> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private isIntentionallyDisconnected = false;

  constructor(options: WebSocketClientOptions) {
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 1000,
      pingInterval: 30000,
      connectionTimeout: 10000,
      ...options
    };

    this.connectionState = {
      status: 'disconnected',
      reconnectAttempts: 0,
      maxReconnectAttempts: this.options.maxReconnectAttempts,
      error: undefined
    };
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  public connect(projectId?: string, userId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        resolve();
        return;
      }

      this.isIntentionallyDisconnected = false;
      this.updateConnectionState({ status: 'connecting' });

      try {
        // Create Socket.IO connection
        const query: any = {};
        if (projectId) query.projectId = projectId;
        if (userId) query.userId = userId;

        this.socket = io(this.options.url, {
          query,
          timeout: this.options.connectionTimeout,
          autoConnect: false
        });

        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.socket && !this.socket.connected) {
            this.socket.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, this.options.connectionTimeout);

        this.socket.on('connect', () => {
          clearTimeout(connectionTimeout);
          this.onOpen();
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          clearTimeout(connectionTimeout);
          this.onClose(reason);
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(connectionTimeout);
          this.onError(error);
          reject(new Error(`Socket.IO connection error: ${error.message}`));
        });

        // Set up message listeners for all the backend events
        this.setupEventListeners();

        // Connect
        this.socket.connect();

      } catch (error) {
        this.updateConnectionState({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown connection error' 
        });
        reject(error);
      }
    });
  }

  public disconnect(): void {
    this.isIntentionallyDisconnected = true;
    this.clearTimers();
    
    if (this.socket) {
      this.socket.disconnect();
    }

    this.updateConnectionState({ 
      status: 'disconnected', 
      reconnectAttempts: 0,
      error: undefined 
    });
  }

  public getConnectionState(): WebSocketConnectionState {
    return { ...this.connectionState };
  }

  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // =============================================================================
  // MESSAGE HANDLING
  // =============================================================================

  public sendMessage(message: WebSocketMessage): boolean {
    if (!this.isConnected()) {
      // Queue message if auto-reconnect is enabled
      if (this.options.autoReconnect && !this.isIntentionallyDisconnected) {
        this.messageQueue.push(message);
        this.attemptReconnect();
      }
      return false;
    }

    try {
      // Map WebSocket message types to Socket.IO events
      const eventName = this.getSocketEventName(message.type as MessageType);
      this.socket!.emit(eventName, message.payload);
      return true;
    } catch (error) {
      console.error('Failed to send Socket.IO message:', error);
      return false;
    }
  }

  public joinProject(projectId: string, userId?: string): boolean {
    const message = MessageFactory.createJoinProjectMessage(projectId, userId);
    return this.sendMessage(message);
  }

  public leaveProject(): boolean {
    const message = MessageFactory.createLeaveProjectMessage();
    return this.sendMessage(message);
  }

  public requestStatus(projectId: string, requestType?: 'current' | 'full' | 'summary'): boolean {
    const message = MessageFactory.createStatusRequestMessage(projectId, requestType);
    return this.sendMessage(message);
  }

  public respondToUserInputRequest(
    requestId: string,
    projectId: string,
    inputs: { [fieldId: string]: any }
  ): boolean {
    const message = MessageFactory.createUserInputResponseMessage(requestId, projectId, inputs);
    return this.sendMessage(message);
  }

  public respondToNotificationAction(
    notificationId: string,
    actionId: string,
    data?: any
  ): boolean {
    const message = MessageFactory.createNotificationActionMessage(notificationId, actionId, data);
    return this.sendMessage(message);
  }

  // =============================================================================
  // EVENT HANDLING
  // =============================================================================

  public on<K extends keyof WebSocketEventMap>(
    event: K,
    handler: WebSocketEventHandler<WebSocketEventMap[K]>
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  public off<K extends keyof WebSocketEventMap>(
    event: K,
    handler: WebSocketEventHandler<WebSocketEventMap[K]>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  public once<K extends keyof WebSocketEventMap>(
    event: K,
    handler: WebSocketEventHandler<WebSocketEventMap[K]>
  ): void {
    const onceHandler = (data: WebSocketEventMap[K]) => {
      handler(data);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }

  private emit<K extends keyof WebSocketEventMap>(
    event: K,
    data: WebSocketEventMap[K]
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${event}:`, error);
        }
      });
    }
  }

  // =============================================================================
  // SOCKET.IO HELPERS
  // =============================================================================

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Listen for backend events
    this.socket.on('pong', (data) => {
      // Handle pong response (connection is alive)
      this.updateConnectionState({ lastPing: Date.now() });
    });

    this.socket.on('error', (data) => {
      this.emit('error', data);
    });

    // Listen for file upload progress updates
    this.socket.on('file-upload-progress', (data) => {
      this.emit('file-upload-progress', data);
    });

    // Listen for test case extraction results
    this.socket.on('test-case-extraction', (data) => {
      this.emit('test-case-extraction', data);
    });

    // Listen for generation progress
    this.socket.on('generation_progress', (data) => {
      this.emit('processing-step', data);
    });

    // Listen for exploration updates
    this.socket.on('exploration_update', (data) => {
      this.emit('project-update', data);
    });

    // Add session info response
    this.socket.on('session_info', (data) => {
      this.emit('status-update', data);
    });
  }

  private getSocketEventName(messageType: MessageType): string {
    // Map WebSocket message types to Socket.IO event names
    switch (messageType) {
      case MessageType.JOIN_PROJECT:
        return 'join_session';
      case MessageType.LEAVE_PROJECT:
        return 'leave_session';
      case MessageType.PING:
        return 'ping';
      case MessageType.USER_INPUT_RESPONSE:
        return 'input_response';
      case MessageType.STATUS_REQUEST:
        return 'get_session_info';
      case MessageType.NOTIFICATION_ACTION:
        return 'broadcast_to_session';
      default:
        return 'message';
    }
  }

  // =============================================================================
  // INTERNAL EVENT HANDLERS
  // =============================================================================

  private onOpen(): void {
    this.updateConnectionState({ 
      status: 'connected',
      reconnectAttempts: 0,
      error: undefined
    });

    this.startPingTimer();
    this.flushMessageQueue();
  }


  private onClose(reason: string): void {
    this.clearTimers();

    if (this.isIntentionallyDisconnected) {
      this.updateConnectionState({ status: 'disconnected' });
      return;
    }

    // Handle unexpected disconnection
    this.updateConnectionState({ status: 'disconnected' });

    if (this.options.autoReconnect && 
        this.connectionState.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.attemptReconnect();
    }
  }

  private onError(error: Error): void {
    console.error('Socket.IO error:', error);
    this.updateConnectionState({ 
      status: 'error',
      error: `Socket.IO connection error: ${error.message}`
    });
  }


  // =============================================================================
  // RECONNECTION LOGIC
  // =============================================================================

  private attemptReconnect(): void {
    if (this.isIntentionallyDisconnected || 
        this.connectionState.reconnectAttempts >= this.options.maxReconnectAttempts) {
      return;
    }

    this.updateConnectionState({ 
      status: 'reconnecting',
      reconnectAttempts: this.connectionState.reconnectAttempts + 1
    });

    // Exponential backoff with jitter
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(2, this.connectionState.reconnectAttempts) +
      Math.random() * 1000,
      30000 // Max 30 seconds
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.connectionState.projectId)
        .catch(error => {
          console.error('Reconnection attempt failed:', error);
          if (this.connectionState.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.attemptReconnect();
          }
        });
    }, delay);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private updateConnectionState(updates: Partial<WebSocketConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates };
    this.emit('connection-state-change', this.connectionState);
  }

  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        const pingMessage = MessageFactory.createPingMessage();
        this.sendMessage(pingMessage);
      }
    }, this.options.pingInterval);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
  }

  // =============================================================================
  // CLEANUP
  // =============================================================================

  public destroy(): void {
    this.isIntentionallyDisconnected = true;
    this.clearTimers();
    this.messageQueue = [];
    this.eventHandlers.clear();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE MANAGEMENT
// =============================================================================

let websocketClientInstance: WebSocketClient | null = null;

export function createWebSocketClient(options: WebSocketClientOptions): WebSocketClient {
  if (websocketClientInstance) {
    websocketClientInstance.destroy();
  }
  
  websocketClientInstance = new WebSocketClient(options);
  return websocketClientInstance;
}

export function getWebSocketClient(): WebSocketClient | null {
  return websocketClientInstance;
}

export function destroyWebSocketClient(): void {
  if (websocketClientInstance) {
    websocketClientInstance.destroy();
    websocketClientInstance = null;
  }
}