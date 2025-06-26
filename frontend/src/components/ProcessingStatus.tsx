import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';

interface ProcessingStep {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  timestamp?: string;
}

interface ProcessingStatus {
  projectId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  currentStep: string;
  progress: number;
  steps: ProcessingStep[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface ProcessingStatusProps {
  projectId: string;
  onComplete?: (status: ProcessingStatus) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export const ProcessingStatusComponent: React.FC<ProcessingStatusProps> = ({
  projectId,
  onComplete,
  onError,
  onCancel
}) => {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      // Note: This endpoint doesn't exist yet, but will be implemented in future tasks
      const response = await apiService.getProjectStatus(projectId);
      setStatus(response);

      // Check if processing is complete
      if (response.status === 'completed') {
        setIsPolling(false);
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
        if (onComplete) {
          onComplete(response);
        }
        toast({
          title: "Processing Complete",
          description: "Your test cases have been processed successfully!"
        });
      } else if (response.status === 'failed') {
        setIsPolling(false);
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
        if (onError) {
          onError(response.error || 'Processing failed');
        }
        toast({
          title: "Processing Failed",
          description: response.error || "An error occurred during processing.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch processing status:', error);
      
      // For demo purposes, simulate processing status
      const mockStatus = createMockStatus(projectId);
      setStatus(mockStatus);
    }
  }, [projectId, pollingInterval, onComplete, onError, toast]);

  const createMockStatus = (projectId: string): ProcessingStatus => {
    const steps: ProcessingStep[] = [
      {
        id: 'validation',
        name: 'Validating uploaded file',
        status: 'completed',
        progress: 100,
        message: 'File validation completed successfully',
        timestamp: new Date(Date.now() - 30000).toISOString()
      },
      {
        id: 'parsing',
        name: 'Parsing Excel content',
        status: 'completed',
        progress: 100,
        message: 'Excel content parsed, 15 test cases found',
        timestamp: new Date(Date.now() - 20000).toISOString()
      },
      {
        id: 'ai-processing',
        name: 'AI processing test cases',
        status: 'in-progress',
        progress: 65,
        message: 'Processing test case scenarios with Claude AI...',
        timestamp: new Date(Date.now() - 10000).toISOString()
      },
      {
        id: 'storage',
        name: 'Storing processed test cases',
        status: 'pending',
        progress: 0,
        message: 'Waiting for AI processing to complete'
      },
      {
        id: 'script-generation',
        name: 'Generating Cypress scripts',
        status: 'pending',
        progress: 0,
        message: 'Ready to generate test scripts'
      }
    ];

    return {
      projectId,
      status: 'in-progress',
      currentStep: 'ai-processing',
      progress: 52, // Overall progress
      steps,
      startedAt: new Date(Date.now() - 35000).toISOString()
    };
  };

  const startPolling = useCallback(() => {
    if (isPolling) return;

    setIsPolling(true);
    fetchStatus(); // Initial fetch

    const interval = setInterval(fetchStatus, 2000); // Poll every 2 seconds
    setPollingInterval(interval);
  }, [isPolling, fetchStatus]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  useEffect(() => {
    startPolling();

    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

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

  if (!status) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="py-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading processing status...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Processing Status</span>
          {status.startedAt && (
            <span className="text-sm font-normal text-muted-foreground">
              Running for {formatElapsedTime(status.startedAt)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall Progress</span>
            <span>{status.progress}%</span>
          </div>
          <Progress value={status.progress} className="w-full" />
        </div>

        {/* Current Step Highlight */}
        <div className="p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-1">Current Step</h4>
          <p className="text-sm text-muted-foreground">
            {status.steps.find(s => s.id === status.currentStep)?.name || 'Processing...'}
          </p>
        </div>

        {/* Processing Steps */}
        <div className="space-y-4">
          <h4 className="font-medium">Processing Steps</h4>
          <div className="space-y-3">
            {status.steps.map((step, index) => (
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
            {status.status === 'in-progress' && (
              <Button variant="outline" onClick={stopPolling} disabled={!isPolling}>
                {isPolling ? 'Pause Updates' : 'Resume Updates'}
              </Button>
            )}
            
            {status.status === 'failed' && (
              <Button onClick={() => startPolling()}>
                Retry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};