// Shared WebSocket Message Types for Frontend
// This file mirrors the backend MessageTypes.ts for frontend usage

export interface BaseMessage {
  type: string;
  timestamp: number;
  messageId?: string;
  clientId?: string;
}

export interface MessagePayload {
  [key: string]: any;
}

export interface WebSocketMessage<T extends MessagePayload = MessagePayload> extends BaseMessage {
  payload: T;
}

// =============================================================================
// CONNECTION MANAGEMENT MESSAGES
// =============================================================================

export interface WelcomePayload extends MessagePayload {
  clientId: string;
  projectId?: string;
  serverTime: string;
}

export interface PingPayload extends MessagePayload {
  timestamp: number;
}

export interface PongPayload extends MessagePayload {
  timestamp: number;
}

export interface JoinProjectPayload extends MessagePayload {
  projectId: string;
  userId?: string;
}

export interface LeaveProjectPayload extends MessagePayload {
  projectId?: string;
}

export interface ProjectJoinedPayload extends MessagePayload {
  projectId: string;
  clientCount: number;
}

export interface ProjectLeftPayload extends MessagePayload {
  projectId: string;
}

// =============================================================================
// PROJECT PROCESSING MESSAGES
// =============================================================================

export interface ProcessingStepPayload extends MessagePayload {
  stepId: string;
  stepName: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  timestamp: string;
  details?: any;
}

export interface ProjectUpdatePayload extends MessagePayload {
  projectId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  currentStep?: string;
  progress: number;
  steps: ProcessingStepPayload[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
  results?: any;
}

export interface StatusRequestPayload extends MessagePayload {
  projectId: string;
  requestType?: 'current' | 'full' | 'summary';
}

export interface StatusUpdatePayload extends MessagePayload {
  projectId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress: number;
  currentStep?: string;
  message?: string;
  estimatedTimeRemaining?: number;
  details?: any;
}

// =============================================================================
// USER INPUT REQUEST MESSAGES
// =============================================================================

export interface InputFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'password' | 'select' | 'checkbox' | 'textarea' | 'file';
  required: boolean;
  placeholder?: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
  options?: Array<{ value: string; label: string }>;
  defaultValue?: any;
  helpText?: string;
}

export interface UserInputRequestPayload extends MessagePayload {
  requestId: string;
  projectId: string;
  title: string;
  description?: string;
  fields: InputFieldDefinition[];
  timeout?: number; // seconds
  context?: any; // Additional context for the input request
}

export interface UserInputResponsePayload extends MessagePayload {
  requestId: string;
  projectId: string;
  inputs: { [fieldId: string]: any };
  submittedAt: string;
}

export interface InputRequestTimeoutPayload extends MessagePayload {
  requestId: string;
  projectId: string;
  timeoutAt: string;
}

// =============================================================================
// NOTIFICATION MESSAGES
// =============================================================================

export interface NotificationPayload extends MessagePayload {
  id: string;
  projectId?: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // milliseconds
  actions?: Array<{
    id: string;
    label: string;
    action: string;
    primary?: boolean;
  }>;
  data?: any;
}

export interface NotificationActionPayload extends MessagePayload {
  notificationId: string;
  actionId: string;
  data?: any;
}

// =============================================================================
// ERROR MESSAGES
// =============================================================================

export interface ErrorPayload extends MessagePayload {
  code: string;
  message: string;
  details?: any;
  retry?: boolean;
  retryAfter?: number; // seconds
}

// =============================================================================
// FILE PROCESSING MESSAGES
// =============================================================================

export interface FileUploadProgressPayload extends MessagePayload {
  projectId: string;
  fileId: string;
  fileName: string;
  progress: number;
  stage: 'uploading' | 'validating' | 'parsing' | 'processing' | 'completed' | 'failed';
  message?: string;
}

export interface TestCaseExtractionPayload extends MessagePayload {
  projectId: string;
  fileId: string;
  extractedCount: number;
  validCount: number;
  invalidCount: number;
  testCases?: Array<{
    id: string;
    name: string;
    status: 'valid' | 'invalid' | 'warning';
    issues?: string[];
  }>;
}

// =============================================================================
// MESSAGE TYPE ENUMERATION
// =============================================================================

export enum MessageType {
  // Connection Management
  WELCOME = 'WELCOME',
  PING = 'PING',
  PONG = 'PONG',
  JOIN_PROJECT = 'JOIN_PROJECT',
  LEAVE_PROJECT = 'LEAVE_PROJECT',
  PROJECT_JOINED = 'PROJECT_JOINED',
  PROJECT_LEFT = 'PROJECT_LEFT',

  // Project Processing
  PROJECT_UPDATE = 'PROJECT_UPDATE',
  STATUS_REQUEST = 'STATUS_REQUEST',
  STATUS_UPDATE = 'STATUS_UPDATE',
  PROCESSING_STEP = 'PROCESSING_STEP',

  // User Input
  USER_INPUT_REQUEST = 'USER_INPUT_REQUEST',
  USER_INPUT_RESPONSE = 'USER_INPUT_RESPONSE',
  INPUT_REQUEST_TIMEOUT = 'INPUT_REQUEST_TIMEOUT',

  // Notifications
  NOTIFICATION = 'NOTIFICATION',
  NOTIFICATION_ACTION = 'NOTIFICATION_ACTION',

  // Errors
  ERROR = 'ERROR',

  // File Processing
  FILE_UPLOAD_PROGRESS = 'FILE_UPLOAD_PROGRESS',
  TEST_CASE_EXTRACTION = 'TEST_CASE_EXTRACTION',

  // Script Generation
  SCRIPT_GENERATION = 'SCRIPT_GENERATION',
  SCRIPT_GENERATION_BATCH = 'SCRIPT_GENERATION_BATCH',

  // Heartbeat (backwards compatibility)
  HEARTBEAT = 'HEARTBEAT'
}

// =============================================================================
// TYPED MESSAGE INTERFACES
// =============================================================================

export type WelcomeMessage = WebSocketMessage<WelcomePayload>;
export type PingMessage = WebSocketMessage<PingPayload>;
export type PongMessage = WebSocketMessage<PongPayload>;
export type JoinProjectMessage = WebSocketMessage<JoinProjectPayload>;
export type LeaveProjectMessage = WebSocketMessage<LeaveProjectPayload>;
export type ProjectJoinedMessage = WebSocketMessage<ProjectJoinedPayload>;
export type ProjectLeftMessage = WebSocketMessage<ProjectLeftPayload>;

export type ProjectUpdateMessage = WebSocketMessage<ProjectUpdatePayload>;
export type StatusRequestMessage = WebSocketMessage<StatusRequestPayload>;
export type StatusUpdateMessage = WebSocketMessage<StatusUpdatePayload>;
export type ProcessingStepMessage = WebSocketMessage<ProcessingStepPayload>;

export type UserInputRequestMessage = WebSocketMessage<UserInputRequestPayload>;
export type UserInputResponseMessage = WebSocketMessage<UserInputResponsePayload>;
export type InputRequestTimeoutMessage = WebSocketMessage<InputRequestTimeoutPayload>;

export type NotificationMessage = WebSocketMessage<NotificationPayload>;
export type NotificationActionMessage = WebSocketMessage<NotificationActionPayload>;

export type ErrorMessage = WebSocketMessage<ErrorPayload>;

export type FileUploadProgressMessage = WebSocketMessage<FileUploadProgressPayload>;
export type TestCaseExtractionMessage = WebSocketMessage<TestCaseExtractionPayload>;

// Union type for all possible messages
export type AnyWebSocketMessage = 
  | WelcomeMessage
  | PingMessage
  | PongMessage
  | JoinProjectMessage
  | LeaveProjectMessage
  | ProjectJoinedMessage
  | ProjectLeftMessage
  | ProjectUpdateMessage
  | StatusRequestMessage
  | StatusUpdateMessage
  | ProcessingStepMessage
  | UserInputRequestMessage
  | UserInputResponseMessage
  | InputRequestTimeoutMessage
  | NotificationMessage
  | NotificationActionMessage
  | ErrorMessage
  | FileUploadProgressMessage
  | TestCaseExtractionMessage;

// =============================================================================
// CLIENT-SIDE MESSAGE FACTORY UTILITIES
// =============================================================================

export class MessageFactory {
  static createMessage<T extends MessagePayload>(
    type: MessageType,
    payload: T,
    messageId?: string
  ): WebSocketMessage<T> {
    return {
      type,
      payload,
      timestamp: Date.now(),
      messageId: messageId || this.generateMessageId()
    };
  }

  static createPingMessage(): PingMessage {
    return this.createMessage(MessageType.PING, {
      timestamp: Date.now()
    });
  }

  static createJoinProjectMessage(projectId: string, userId?: string): JoinProjectMessage {
    return this.createMessage(MessageType.JOIN_PROJECT, {
      projectId,
      userId
    });
  }

  static createLeaveProjectMessage(): LeaveProjectMessage {
    return this.createMessage(MessageType.LEAVE_PROJECT, {});
  }

  static createStatusRequestMessage(projectId: string, requestType?: 'current' | 'full' | 'summary'): StatusRequestMessage {
    return this.createMessage(MessageType.STATUS_REQUEST, {
      projectId,
      requestType
    });
  }

  static createUserInputResponseMessage(
    requestId: string,
    projectId: string,
    inputs: { [fieldId: string]: any }
  ): UserInputResponseMessage {
    return this.createMessage(MessageType.USER_INPUT_RESPONSE, {
      requestId,
      projectId,
      inputs,
      submittedAt: new Date().toISOString()
    });
  }

  static createNotificationActionMessage(
    notificationId: string,
    actionId: string,
    data?: any
  ): NotificationActionMessage {
    return this.createMessage(MessageType.NOTIFICATION_ACTION, {
      notificationId,
      actionId,
      data
    });
  }

  private static generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// CONNECTION STATUS TYPES
// =============================================================================

export type WebSocketConnectionStatus = 
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export interface WebSocketConnectionState {
  status: WebSocketConnectionStatus;
  clientId?: string;
  projectId?: string;
  lastPing?: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  error?: string;
}