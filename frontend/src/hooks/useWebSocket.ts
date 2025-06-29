import { useEffect, useRef, useState, useCallback } from 'react';
import {
  WebSocketClient,
  WebSocketEventHandler,
  WebSocketEventMap,
  createWebSocketClient,
  getWebSocketClient
} from '../services/websocketClient';
import { WebSocketConnectionState } from '../types/websocket';

export interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  projectId?: string;
  userId?: string;
}

export interface UseWebSocketReturn {
  client: WebSocketClient | null;
  connectionState: WebSocketConnectionState;
  isConnected: boolean;
  connect: (projectId?: string, userId?: string) => Promise<void>;
  disconnect: () => void;
  joinProject: (projectId: string, userId?: string) => boolean;
  leaveProject: () => boolean;
  requestStatus: (projectId: string, requestType?: 'current' | 'full' | 'summary') => boolean;
  respondToUserInputRequest: (
    requestId: string,
    projectId: string,
    inputs: { [fieldId: string]: any }
  ) => boolean;
  respondToNotificationAction: (
    notificationId: string,
    actionId: string,
    data?: any
  ) => boolean;
}

/**
 * React hook for managing WebSocket connections
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  // Sanitize the URL from environment variable to remove quotes and fix malformed URLs
  const envUrl = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:8000';
  // If URL starts with '/', make it relative to current host
  const sanitizedUrl = envUrl.startsWith('/') 
    ? window.location.origin + envUrl 
    : envUrl.replace(/^['"`]|['"`]$/g, '').replace(/^'ws.*/, 'http://localhost:8000');
  
  const {
    url = sanitizedUrl,
    autoConnect = false,
    projectId: initialProjectId,
    userId: initialUserId
  } = options;

  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
  });

  const clientRef = useRef<WebSocketClient | null>(null);

  // Initialize client
  useEffect(() => {
    // Check if there's already a client instance
    let client = getWebSocketClient();
    
    if (!client) {
      client = createWebSocketClient({
        url,
        autoReconnect: true,
        maxReconnectAttempts: 5,
        reconnectInterval: 1000,
        pingInterval: 30000,
        connectionTimeout: 10000
      });
    }

    clientRef.current = client;

    // Set up connection state listener
    const handleConnectionStateChange = (state: WebSocketConnectionState) => {
      setConnectionState(state);
    };

    client.on('connection-state-change', handleConnectionStateChange);

    // Auto-connect if enabled
    if (autoConnect) {
      client.connect(initialProjectId, initialUserId).catch(error => {
        console.error('Auto-connect failed:', error);
      });
    }

    // Cleanup function
    return () => {
      if (client) {
        client.off('connection-state-change', handleConnectionStateChange);
      }
    };
  }, [url, autoConnect, initialProjectId, initialUserId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Only destroy if this is the last component using the client
      // In a real app, you might want more sophisticated reference counting
      // For now, we'll keep the connection alive across component remounts
    };
  }, []);

  const connect = useCallback(async (projectId?: string, userId?: string) => {
    if (!clientRef.current) {
      throw new Error('WebSocket client not initialized');
    }
    await clientRef.current.connect(projectId, userId);
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
  }, []);

  const joinProject = useCallback((projectId: string, userId?: string) => {
    return clientRef.current?.joinProject(projectId, userId) || false;
  }, []);

  const leaveProject = useCallback(() => {
    return clientRef.current?.leaveProject() || false;
  }, []);

  const requestStatus = useCallback((projectId: string, requestType?: 'current' | 'full' | 'summary') => {
    return clientRef.current?.requestStatus(projectId, requestType) || false;
  }, []);

  const respondToUserInputRequest = useCallback((
    requestId: string,
    projectId: string,
    inputs: { [fieldId: string]: any }
  ) => {
    return clientRef.current?.respondToUserInputRequest(requestId, projectId, inputs) || false;
  }, []);

  const respondToNotificationAction = useCallback((
    notificationId: string,
    actionId: string,
    data?: any
  ) => {
    return clientRef.current?.respondToNotificationAction(notificationId, actionId, data) || false;
  }, []);

  return {
    client: clientRef.current,
    connectionState,
    isConnected: connectionState.status === 'connected',
    connect,
    disconnect,
    joinProject,
    leaveProject,
    requestStatus,
    respondToUserInputRequest,
    respondToNotificationAction
  };
}

/**
 * Hook for subscribing to specific WebSocket events
 */
export function useWebSocketEvent<K extends keyof WebSocketEventMap>(
  event: K,
  handler: WebSocketEventHandler<WebSocketEventMap[K]>,
  dependencies: any[] = []
): void {
  const client = getWebSocketClient();

  useEffect(() => {
    if (!client) {
      return;
    }

    client.on(event, handler);

    return () => {
      client.off(event, handler);
    };
  }, [client, event, handler, ...dependencies]);
}

/**
 * Hook for managing project-specific WebSocket connections
 */
export function useProjectWebSocket(projectId: string, userId?: string) {
  const webSocket = useWebSocket({
    autoConnect: true,
    projectId,
    userId
  });

  // Auto-join project when connected
  useEffect(() => {
    if (webSocket.isConnected && projectId) {
      webSocket.joinProject(projectId, userId);
    }
  }, [webSocket.isConnected, projectId, userId, webSocket]);

  // Auto-leave project on unmount
  useEffect(() => {
    return () => {
      if (webSocket.isConnected) {
        webSocket.leaveProject();
      }
    };
  }, [webSocket]);

  return webSocket;
}

/**
 * Hook for displaying connection status in UI
 */
export function useWebSocketStatus() {
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
  });

  useWebSocketEvent('connection-state-change', setConnectionState);

  const getStatusText = useCallback(() => {
    switch (connectionState.status) {
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'reconnecting':
        return `Reconnecting... (${connectionState.reconnectAttempts}/${connectionState.maxReconnectAttempts})`;
      case 'error':
        return connectionState.error || 'Connection Error';
      default:
        return 'Unknown';
    }
  }, [connectionState]);

  const getStatusColor = useCallback(() => {
    switch (connectionState.status) {
      case 'connected':
        return 'green';
      case 'connecting':
      case 'reconnecting':
        return 'yellow';
      case 'disconnected':
        return 'gray';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  }, [connectionState.status]);

  return {
    connectionState,
    statusText: getStatusText(),
    statusColor: getStatusColor(),
    isConnected: connectionState.status === 'connected',
    isConnecting: connectionState.status === 'connecting' || connectionState.status === 'reconnecting'
  };
}