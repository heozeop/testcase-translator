import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { useWebSocketEvent, useProjectWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../hooks/use-toast';
import { WebSocketStatus } from './WebSocketStatus';
import {
  StatusUpdatePayload,
  ProjectUpdatePayload,
  ProcessingStepPayload,
  FileUploadProgressPayload,
  TestCaseExtractionPayload
} from '../types/websocket';

interface ProcessingStep {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  timestamp?: string;
  details?: any;
}

interface ProcessingStatus {
  projectId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  currentStep?: string;
  progress: number;
  steps: ProcessingStep[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
  results?: any;
}

interface FileProcessingInfo {
  fileId: string;
  fileName: string;
  progress: number;
  stage: 'uploading' | 'validating' | 'parsing' | 'processing' | 'completed' | 'failed';
  message?: string;
}

interface WebSocketProcessingStatusProps {
  projectId: string;
  userId?: string;
  onComplete?: (status: ProcessingStatus) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  showConnectionStatus?: boolean;
}

export const WebSocketProcessingStatus: React.FC<WebSocketProcessingStatusProps> = ({
  projectId,
  userId,
  onComplete,
  onError,
  onCancel,
  showConnectionStatus = true
}) => {
  const [status, setStatus] = useState<ProcessingStatus>({
    projectId,
    status: 'pending',
    progress: 0,
    steps: []
  });
  
  const [fileProcessing, setFileProcessing] = useState<Map<string, FileProcessingInfo>>(new Map());
  const [testCaseResults, setTestCaseResults] = useState<any>(null);
  
  const { toast } = useToast();
  const webSocket = useProjectWebSocket(projectId, userId);

  // Listen for status updates
  useWebSocketEvent('status-update', (update: StatusUpdatePayload) => {
    if (update.projectId === projectId) {
      setStatus(prev => ({
        ...prev,
        status: update.status,
        progress: update.progress,
        currentStep: update.currentStep,
        error: update.status === 'failed' ? (update.message || 'Processing failed') : undefined
      }));

      // Handle completion
      if (update.status === 'completed') {
        toast({
          title: "Processing Complete",
          description: update.message || "Your project has been processed successfully!"
        });
        onComplete?.(status);
      } else if (update.status === 'failed') {
        toast({
          title: "Processing Failed",
          description: update.message || "An error occurred during processing.",
          variant: "destructive"
        });
        onError?.(update.message || 'Processing failed');
      }
    }
  }, [projectId, status, onComplete, onError, toast]);

  // Listen for project updates
  useWebSocketEvent('project-update', (update: ProjectUpdatePayload) => {
    if (update.projectId === projectId) {
      setStatus(prev => ({
        ...prev,
        status: update.status,
        progress: update.progress,
        currentStep: update.currentStep,
        steps: update.steps.map(step => ({
          id: step.stepId,
          name: step.stepName,
          status: step.status,
          progress: step.progress,
          message: step.message,
          timestamp: step.timestamp,
          details: step.details
        })),
        startedAt: update.startedAt,
        completedAt: update.completedAt,
        error: update.error,
        results: update.results
      }));
    }
  }, [projectId]);

  // Listen for processing step updates
  useWebSocketEvent('processing-step', (step: ProcessingStepPayload) => {
    setStatus(prev => {
      const updatedSteps = [...prev.steps];
      const existingIndex = updatedSteps.findIndex(s => s.id === step.stepId);
      
      const updatedStep: ProcessingStep = {
        id: step.stepId,
        name: step.stepName,
        status: step.status,
        progress: step.progress,
        message: step.message,
        timestamp: step.timestamp,
        details: step.details
      };

      if (existingIndex >= 0) {
        updatedSteps[existingIndex] = updatedStep;
      } else {
        updatedSteps.push(updatedStep);
      }

      return {
        ...prev,
        steps: updatedSteps
      };
    });
  }, []);

  // Listen for file upload progress
  useWebSocketEvent('file-upload-progress', (progress: FileUploadProgressPayload) => {
    if (progress.projectId === projectId) {
      setFileProcessing(prev => {
        const updated = new Map(prev);
        updated.set(progress.fileId, {
          fileId: progress.fileId,
          fileName: progress.fileName,
          progress: progress.progress,
          stage: progress.stage,
          message: progress.message
        });
        return updated;
      });

      // Update overall progress based on file progress
      if (progress.stage === 'completed') {
        toast({
          title: "File Processing Complete",
          description: `${progress.fileName} has been processed successfully`
        });
      } else if (progress.stage === 'failed') {
        toast({
          title: "File Processing Failed",
          description: progress.message || `Failed to process ${progress.fileName}`,
          variant: "destructive"
        });
      }
    }
  }, [projectId, toast]);

  // Listen for test case extraction results
  useWebSocketEvent('test-case-extraction', (extraction: TestCaseExtractionPayload) => {
    if (extraction.projectId === projectId) {
      setTestCaseResults(extraction);
      
      toast({
        title: "Test Cases Extracted",
        description: `Found ${extraction.extractedCount} test cases (${extraction.validCount} valid, ${extraction.invalidCount} invalid)`
      });
    }
  }, [projectId, toast]);

  // Request initial status when connected
  useEffect(() => {
    if (webSocket.isConnected) {
      webSocket.requestStatus(projectId, 'full');
    }
  }, [webSocket.isConnected, projectId, webSocket]);

  const getStepIcon = (step: ProcessingStep) => {
    switch (step.status) {
      case 'completed':
        return (
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'in-progress':
        return (
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
          </div>
        );
      case 'failed':
        return (
          <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
          </div>
        );
    }
  };

  const formatElapsedTime = (startTime: string) => {
    const elapsed = Date.now() - new Date(startTime).getTime();
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getStageDisplayName = (stage: FileProcessingInfo['stage']) => {
    switch (stage) {
      case 'uploading': return 'Uploading';
      case 'validating': return 'Validating';
      case 'parsing': return 'Parsing';
      case 'processing': return 'Processing';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      default: return stage;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Processing Status</span>
          <div className="flex items-center space-x-4">
            {status.startedAt && (
              <span className="text-sm font-normal text-muted-foreground">
                Running for {formatElapsedTime(status.startedAt)}
              </span>
            )}
            {showConnectionStatus && <WebSocketStatus />}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        {!webSocket.isConnected && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              Real-time updates unavailable. Attempting to reconnect...
            </p>
          </div>
        )}

        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span>{status.progress}%</span>
          </div>
          <Progress value={status.progress} className="w-full" />
        </div>

        {/* Current Step Highlight */}
        {status.currentStep && (
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-1">Current Step</h4>
            <p className="text-sm text-muted-foreground">
              {status.steps.find(s => s.id === status.currentStep)?.name || status.currentStep}
            </p>
          </div>
        )}

        {/* File Processing Status */}
        {fileProcessing.size > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium">File Processing</h4>
            <div className="space-y-3">
              {Array.from(fileProcessing.values()).map((file) => (
                <div key={file.fileId} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium truncate">{file.fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      {getStageDisplayName(file.stage)} - {file.progress}%
                    </span>
                  </div>
                  <Progress value={file.progress} className="w-full h-2" />
                  {file.message && (
                    <p className="text-xs text-muted-foreground mt-1">{file.message}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processing Steps */}
        {status.steps.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-medium">Processing Steps</h4>
            <div className="space-y-3">
              {status.steps.map((step) => (
                <div key={step.id} className="flex items-start space-x-3">
                  {getStepIcon(step)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${
                        step.status === 'in-progress' ? 'text-blue-600' : 
                        step.status === 'completed' ? 'text-green-600' :
                        step.status === 'failed' ? 'text-red-600' : 
                        'text-muted-foreground'
                      }`}>
                        {step.name}
                      </p>
                      {step.progress !== undefined && step.status === 'in-progress' && (
                        <span className="text-xs text-muted-foreground">
                          {step.progress}%
                        </span>
                      )}
                    </div>
                    {step.message && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {step.message}
                      </p>
                    )}
                    {step.progress !== undefined && step.status === 'in-progress' && (
                      <Progress value={step.progress} className="w-full mt-2 h-2" />
                    )}
                    {step.timestamp && step.status === 'completed' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Completed at {new Date(step.timestamp).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Case Results */}
        {testCaseResults && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-medium text-green-800 mb-2">Test Case Extraction Results</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="text-lg font-semibold text-green-700">
                  {testCaseResults.extractedCount}
                </div>
                <div className="text-green-600">Total Found</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-green-700">
                  {testCaseResults.validCount}
                </div>
                <div className="text-green-600">Valid</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-red-700">
                  {testCaseResults.invalidCount}
                </div>
                <div className="text-red-600">Invalid</div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {status.status === 'failed' && status.error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="font-medium text-red-800 mb-1">Processing Failed</h4>
            <p className="text-sm text-red-600">{status.error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          
          <div className="space-x-2">
            {!webSocket.isConnected && (
              <Button 
                variant="outline" 
                onClick={() => webSocket.connect(projectId, userId)}
              >
                Reconnect
              </Button>
            )}
            
            {status.status === 'failed' && (
              <Button onClick={() => webSocket.requestStatus(projectId, 'full')}>
                Retry
              </Button>
            )}

            {webSocket.isConnected && (
              <Button 
                variant="outline"
                onClick={() => webSocket.requestStatus(projectId, 'current')}
              >
                Refresh Status
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};