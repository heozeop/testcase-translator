import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

interface InputRequest {
  id: string;
  type: string;
  prompt: string;
  description?: string;
  required: boolean;
  category: string;
  validationRules: ValidationRule[];
  options?: InputOption[];
  defaultValue?: any;
  metadata: InputMetadata;
  createdAt: number;
  expiresAt?: number;
}

interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message: string;
  errorCode?: string;
}

interface InputOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

interface InputMetadata {
  priority: 'high' | 'medium' | 'low';
  source: string;
  tags: string[];
  hints: string[];
  examples: string[];
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
}

interface InputCollectionSession {
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
}

interface InputCollectionState {
  isActive: boolean;
  currentSession: InputCollectionSession | null;
  pendingRequests: InputRequest[];
  completedInputs: Map<string, any>;
  errors: string[];
  isModalOpen: boolean;
}

interface UseInputCollectionOptions {
  autoOpen?: boolean;
  onSessionComplete?: (results: any) => void;
  onError?: (error: string) => void;
}

export function useInputCollection(options: UseInputCollectionOptions = {}) {
  const { autoOpen = true, onSessionComplete, onError } = options;
  
  const [state, setState] = useState<InputCollectionState>({
    isActive: false,
    currentSession: null,
    pendingRequests: [],
    completedInputs: new Map(),
    errors: [],
    isModalOpen: false
  });

  const webSocket = useWebSocket({
    autoConnect: true
  });

  const handleInputCollectionRequired = useCallback((payload: any) => {
    setState(prev => ({
      ...prev,
      isActive: true,
      errors: []
    }));

    if (autoOpen) {
      setState(prev => ({ ...prev, isModalOpen: true }));
    }
  }, [autoOpen]);

  const handleInputRequest = useCallback((payload: any) => {
    const { request, sessionInfo } = payload;
    
    setState(prev => ({
      ...prev,
      isActive: true,
      currentSession: {
        sessionId: sessionInfo.sessionId,
        status: 'progress',
        progress: {
          total: sessionInfo.totalRequests,
          completed: sessionInfo.completedRequests,
          pending: sessionInfo.totalRequests - sessionInfo.completedRequests,
          percentage: sessionInfo.totalRequests > 0 ? 
            (sessionInfo.completedRequests / sessionInfo.totalRequests) * 100 : 0
        },
        currentRequest: request,
        estimatedTimeRemaining: sessionInfo.estimatedTimeRemaining
      },
      pendingRequests: [request],
      isModalOpen: autoOpen
    }));
  }, [autoOpen]);

  const handleSessionUpdate = useCallback((payload: any) => {
    setState(prev => ({
      ...prev,
      currentSession: prev.currentSession ? {
        ...prev.currentSession,
        status: payload.status,
        progress: payload.progress,
        currentRequest: payload.currentRequest,
        estimatedTimeRemaining: payload.estimatedTimeRemaining
      } : null
    }));
  }, []);

  const handleValidationError = useCallback((payload: any) => {
    const { requestId, errors, suggestions } = payload;
    
    setState(prev => ({
      ...prev,
      errors: [...prev.errors, ...errors]
    }));

    if (onError) {
      onError(`Validation failed for input: ${errors.join(', ')}`);
    }
  }, [onError]);

  const handleCollectionComplete = useCallback((payload: any) => {
    const { sessionId, results, collectedData, duration } = payload;
    
    setState(prev => ({
      ...prev,
      isActive: false,
      currentSession: prev.currentSession ? {
        ...prev.currentSession,
        status: 'completed'
      } : null,
      isModalOpen: false
    }));

    if (onSessionComplete) {
      onSessionComplete({
        sessionId,
        results,
        collectedData,
        duration
      });
    }
  }, [onSessionComplete]);

  const handleRequestCancelled = useCallback((payload: any) => {
    const { requestId } = payload;
    
    setState(prev => ({
      ...prev,
      pendingRequests: prev.pendingRequests.filter(req => req.id !== requestId)
    }));
  }, []);

  const handleSessionCancelled = useCallback((payload: any) => {
    setState(prev => ({
      ...prev,
      isActive: false,
      currentSession: prev.currentSession ? {
        ...prev.currentSession,
        status: 'cancelled'
      } : null,
      pendingRequests: [],
      isModalOpen: false
    }));
  }, []);

  const submitInput = useCallback((requestId: string, value: any) => {
    if (!webSocket.client || webSocket.connectionState.status !== 'connected') {
      throw new Error('WebSocket is not connected');
    }

    const message = {
      type: 'INPUT_RESPONSE',
      timestamp: Date.now(),
      payload: {
        requestId,
        value,
        metadata: {
          timestamp: Date.now(),
          userAgent: navigator.userAgent
        }
      }
    };

    webSocket.client?.sendMessage(message);

    // Update local state
    setState(prev => ({
      ...prev,
      completedInputs: new Map(prev.completedInputs).set(requestId, value),
      errors: [] // Clear errors on successful submission
    }));
  }, [webSocket.client, webSocket.connectionState.status]);

  const skipInput = useCallback((requestId: string) => {
    if (!webSocket.client || webSocket.connectionState.status !== 'connected') {
      throw new Error('WebSocket is not connected');
    }

    const message = {
      type: 'INPUT_SKIP',
      timestamp: Date.now(),
      payload: {
        requestId
      }
    };

    webSocket.client?.sendMessage(message);

    // Update local state
    setState(prev => ({
      ...prev,
      pendingRequests: prev.pendingRequests.filter(req => req.id !== requestId)
    }));
  }, [webSocket.client, webSocket.connectionState.status]);

  const cancelSession = useCallback((sessionId: string) => {
    if (!webSocket.client || webSocket.connectionState.status !== 'connected') {
      throw new Error('WebSocket is not connected');
    }

    const message = {
      type: 'INPUT_SESSION_CANCEL',
      timestamp: Date.now(),
      payload: {
        sessionId
      }
    };

    webSocket.client?.sendMessage(message);

    // Update local state
    setState(prev => ({
      ...prev,
      isActive: false,
      currentSession: null,
      pendingRequests: [],
      isModalOpen: false
    }));
  }, [webSocket.client, webSocket.connectionState.status]);

  const openModal = useCallback(() => {
    setState(prev => ({ ...prev, isModalOpen: true }));
  }, []);

  const closeModal = useCallback(() => {
    setState(prev => ({ ...prev, isModalOpen: false }));
  }, []);

  const clearErrors = useCallback(() => {
    setState(prev => ({ ...prev, errors: [] }));
  }, []);

  const getCompletedInput = useCallback((requestId: string) => {
    return state.completedInputs.get(requestId);
  }, [state.completedInputs]);

  const getAllCompletedInputs = useCallback(() => {
    return Object.fromEntries(state.completedInputs);
  }, [state.completedInputs]);

  const isSessionActive = useCallback(() => {
    return state.isActive && state.currentSession?.status === 'progress';
  }, [state.isActive, state.currentSession?.status]);

  const getSessionProgress = useCallback(() => {
    return state.currentSession?.progress || null;
  }, [state.currentSession?.progress]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!webSocket.client) return;

    // Use the WebSocketClient's event system instead of raw WebSocket events
    webSocket.client.on('user-input-request', handleInputRequest);

    return () => {
      webSocket.client?.off('user-input-request', handleInputRequest);
    };
  }, [webSocket.client, handleInputRequest]);

  return {
    // State
    isActive: state.isActive,
    currentSession: state.currentSession,
    pendingRequests: state.pendingRequests,
    errors: state.errors,
    isModalOpen: state.isModalOpen,
    
    // Actions
    submitInput,
    skipInput,
    cancelSession,
    openModal,
    closeModal,
    clearErrors,
    
    // Getters
    getCompletedInput,
    getAllCompletedInputs,
    isSessionActive,
    getSessionProgress,
    
    // WebSocket state
    connectionState: webSocket.connectionState,
    isConnected: webSocket.isConnected
  };
}