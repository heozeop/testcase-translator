import {
  WebSocketMessage,
  AnyWebSocketMessage,
  MessageType,
  MessageFactory,
  WebSocketConnectionStatus,
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
  private ws: WebSocket | null = null;
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
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isIntentionallyDisconnected = false;
      this.updateConnectionState({ status: 'connecting' });

      // Build connection URL with query parameters
      const url = new URL(this.options.url);
      if (projectId) url.searchParams.set('projectId', projectId);
      if (userId) url.searchParams.set('userId', userId);

      try {
        this.ws = new WebSocket(url.toString());
        
        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, this.options.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.onOpen();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.onMessage(event);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.onClose(event);
        };

        this.ws.onerror = (event) => {
          clearTimeout(connectionTimeout);
          this.onError(event);
          reject(new Error('WebSocket connection error'));
        };

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
    
    if (this.ws) {
      this.ws.close(1000, 'Client initiated disconnect');
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
    return this.ws?.readyState === WebSocket.OPEN;
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
      this.ws!.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
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

  private onMessage(event: MessageEvent): void {
    try {
      const message: AnyWebSocketMessage = JSON.parse(event.data);
      this.handleMessage(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, event.data);
    }
  }

  private onClose(event: CloseEvent): void {
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

  private onError(event: Event): void {
    console.error('WebSocket error:', event);
    this.updateConnectionState({ 
      status: 'error',
      error: 'WebSocket connection error'
    });
  }

  private handleMessage(message: AnyWebSocketMessage): void {
    // Update last ping time for connection tracking
    this.updateConnectionState({ lastPing: Date.now() });

    switch (message.type) {
      case MessageType.WELCOME:
        this.updateConnectionState({ 
          clientId: (message.payload as any).clientId,
          projectId: (message.payload as any).projectId
        });
        this.emit('welcome', message.payload as any);
        break;

      case MessageType.PONG:
        // Handle pong response (connection is alive)
        break;

      case MessageType.PROJECT_JOINED:
        this.updateConnectionState({ projectId: (message.payload as any).projectId });
        this.emit('project-joined', message.payload as any);
        break;

      case MessageType.PROJECT_LEFT:
        this.updateConnectionState({ projectId: undefined });
        this.emit('project-left', message.payload as any);
        break;

      case MessageType.NOTIFICATION:
        this.emit('notification', message.payload as any);
        break;

      case MessageType.STATUS_UPDATE:
        this.emit('status-update', message.payload as any);
        break;

      case MessageType.PROJECT_UPDATE:
        this.emit('project-update', message.payload as any);
        break;

      case MessageType.USER_INPUT_REQUEST:
        this.emit('user-input-request', message.payload as any);
        break;

      case MessageType.FILE_UPLOAD_PROGRESS:
        this.emit('file-upload-progress', message.payload as any);
        break;

      case MessageType.TEST_CASE_EXTRACTION:
        this.emit('test-case-extraction', message.payload as any);
        break;

      case MessageType.PROCESSING_STEP:
        this.emit('processing-step', message.payload as any);
        break;

      case MessageType.ERROR:
        this.emit('error', message.payload as any);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
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
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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