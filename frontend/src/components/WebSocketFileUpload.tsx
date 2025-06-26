import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import { validateFile, formatFileSize } from '../utils/validation';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useWebSocketEvent, useProjectWebSocket } from '../hooks/useWebSocket';
import { FileUploadProgressPayload, TestCaseExtractionPayload } from '../types/websocket';

interface WebSocketFileUploadProps {
  projectId: string;
  userId?: string;
  onUploadSuccess?: (testCases: any[]) => void;
  onUploadError?: (error: string) => void;
}

interface UploadState {
  isUploading: boolean;
  progress: number;
  file: File | null;
  error: string | null;
  stage: 'idle' | 'uploading' | 'validating' | 'parsing' | 'processing' | 'completed' | 'failed';
  message?: string;
}

export const WebSocketFileUpload: React.FC<WebSocketFileUploadProps> = ({
  projectId,
  userId,
  onUploadSuccess,
  onUploadError
}) => {
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    file: null,
    error: null,
    stage: 'idle'
  });

  const [testCaseResults, setTestCaseResults] = useState<any>(null);
  const { toast } = useToast();
  const webSocket = useProjectWebSocket(projectId, userId);

  // Listen for file upload progress updates
  useWebSocketEvent('file-upload-progress', (progress: FileUploadProgressPayload) => {
    if (progress.projectId === projectId && uploadState.isUploading) {
      setUploadState(prev => ({
        ...prev,
        progress: progress.progress,
        stage: progress.stage,
        message: progress.message
      }));

      // Handle completion
      if (progress.stage === 'completed') {
        setTimeout(() => {
          setUploadState(prev => ({
            ...prev,
            isUploading: false,
            stage: 'idle',
            file: null,
            progress: 0
          }));
        }, 1000);
      } else if (progress.stage === 'failed') {
        setUploadState(prev => ({
          ...prev,
          isUploading: false,
          stage: 'failed',
          error: progress.message || 'Upload failed',
          progress: 0
        }));

        if (onUploadError) {
          onUploadError(progress.message || 'Upload failed');
        }
      }
    }
  }, [projectId, uploadState.isUploading, onUploadError]);

  // Listen for test case extraction results
  useWebSocketEvent('test-case-extraction', (extraction: TestCaseExtractionPayload) => {
    if (extraction.projectId === projectId) {
      setTestCaseResults(extraction);
      
      toast({
        title: "Test Cases Extracted",
        description: `Found ${extraction.extractedCount} test cases (${extraction.validCount} valid, ${extraction.invalidCount} invalid)`
      });

      if (onUploadSuccess && extraction.testCases) {
        onUploadSuccess(extraction.testCases);
      }
    }
  }, [projectId, onUploadSuccess, toast]);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    // Clear previous state
    setUploadState(prev => ({ ...prev, error: null, file: null, stage: 'idle' }));
    setTestCaseResults(null);

    // Handle rejected files
    if (rejectedFiles.length > 0) {
      const rejectedFile = rejectedFiles[0];
      let errorMessage = 'File rejected: ';
      
      if (rejectedFile.errors) {
        errorMessage += rejectedFile.errors.map((e: any) => e.message).join(', ');
      } else {
        errorMessage += 'Invalid file type or size';
      }

      setUploadState(prev => ({ ...prev, error: errorMessage, stage: 'failed' }));
      return;
    }

    // Handle accepted files
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      
      // Additional validation using our custom validator
      const validation = validateFile(file);
      if (!validation.isValid) {
        setUploadState(prev => ({ 
          ...prev, 
          error: validation.error || 'File validation failed', 
          stage: 'failed' 
        }));
        return;
      }

      setUploadState(prev => ({ ...prev, file, error: null, stage: 'idle' }));
      toast({
        title: "File Selected",
        description: `${file.name} (${formatFileSize(file.size)}) is ready to upload.`
      });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/csv': ['.csv']
    },
    maxFiles: 1,
    maxSize: parseInt(process.env.REACT_APP_MAX_FILE_SIZE || '52428800'), // 50MB default
    multiple: false
  });

  const handleUpload = async () => {
    if (!uploadState.file) return;

    setUploadState(prev => ({ 
      ...prev, 
      isUploading: true, 
      progress: 0, 
      error: null,
      stage: 'uploading',
      message: 'Starting upload...'
    }));

    try {
      // Upload the file - WebSocket will handle progress updates
      const result = await apiService.uploadTestCases(projectId, uploadState.file);

      // If no WebSocket updates received, handle as regular upload
      if (!webSocket.isConnected) {
        setUploadState(prev => ({ ...prev, progress: 100, stage: 'completed' }));
        
        setTimeout(() => {
          setUploadState({
            isUploading: false,
            progress: 0,
            file: null,
            error: null,
            stage: 'idle'
          });

          toast({
            title: "Upload Successful",
            description: `File uploaded and processed successfully. ${result.testCases?.length || 0} test cases extracted.`
          });

          if (onUploadSuccess && result.testCases) {
            onUploadSuccess(result.testCases);
          }
        }, 500);
      }

    } catch (error: any) {
      console.error('Upload error:', error);
      
      let errorMessage = 'Upload failed: ';
      if (error.response?.data?.error?.message) {
        errorMessage += error.response.data.error.message;
      } else if (error.response?.data?.message) {
        errorMessage += error.response.data.message;
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'An unexpected error occurred';
      }

      setUploadState(prev => ({
        ...prev,
        isUploading: false,
        progress: 0,
        error: errorMessage,
        stage: 'failed'
      }));

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive"
      });

      if (onUploadError) {
        onUploadError(errorMessage);
      }
    }
  };

  const handleClearFile = () => {
    setUploadState({
      isUploading: false,
      progress: 0,
      file: null,
      error: null,
      stage: 'idle'
    });
    setTestCaseResults(null);
  };

  const getStageDisplayName = (stage: UploadState['stage']): string => {
    switch (stage) {
      case 'uploading': return 'Uploading file...';
      case 'validating': return 'Validating file...';
      case 'parsing': return 'Parsing Excel content...';
      case 'processing': return 'Processing with AI...';
      case 'completed': return 'Upload completed!';
      case 'failed': return 'Upload failed';
      default: return '';
    }
  };

  const getStageColor = (stage: UploadState['stage']): string => {
    switch (stage) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'uploading':
      case 'validating':
      case 'parsing':
      case 'processing': return 'text-blue-600';
      default: return 'text-muted-foreground';
    }
  };

  const dropzoneClasses = `
    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
    ${isDragActive && !isDragReject ? 'border-primary bg-primary/10' : ''}
    ${isDragReject ? 'border-destructive bg-destructive/10' : ''}
    ${!isDragActive ? 'border-muted-foreground/25 hover:border-muted-foreground/50' : ''}
    ${uploadState.isUploading ? 'pointer-events-none opacity-50' : ''}
  `.trim();

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Upload Excel Test Cases</h3>
            {webSocket.isConnected && (
              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                Real-time updates enabled
              </span>
            )}
          </div>
          
          {/* Dropzone */}
          <div {...getRootProps({ className: dropzoneClasses })}>
            <input {...getInputProps()} disabled={uploadState.isUploading} />
            
            <div className="space-y-2">
              {isDragActive ? (
                isDragReject ? (
                  <p className="text-destructive">
                    Invalid file type. Please drop a valid Excel file (.xlsx, .xls) or CSV file.
                  </p>
                ) : (
                  <p className="text-primary">Drop your file here...</p>
                )
              ) : (
                <>
                  <div className="flex justify-center mb-2">
                    <svg
                      className="w-10 h-10 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-muted-foreground">
                    Drag & drop your Excel file here, or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports .xlsx, .xls, and .csv files (max 50MB)
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Error Display */}
          {uploadState.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-destructive text-sm">{uploadState.error}</p>
            </div>
          )}

          {/* Selected File Display */}
          {uploadState.file && !uploadState.isUploading && (
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{uploadState.file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(uploadState.file.size)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFile}
                  disabled={uploadState.isUploading}
                >
                  Remove
                </Button>
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {uploadState.isUploading && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className={getStageColor(uploadState.stage)}>
                  {getStageDisplayName(uploadState.stage)}
                </span>
                <span>{uploadState.progress}%</span>
              </div>
              <Progress value={uploadState.progress} className="w-full" />
              {uploadState.message && (
                <p className="text-xs text-muted-foreground">{uploadState.message}</p>
              )}
            </div>
          )}

          {/* Test Case Results */}
          {testCaseResults && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <h4 className="font-medium text-green-800 mb-2">Extraction Results</h4>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-green-700">
                    {testCaseResults.extractedCount}
                  </div>
                  <div className="text-green-600">Total</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-green-700">
                    {testCaseResults.validCount}
                  </div>
                  <div className="text-green-600">Valid</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-red-700">
                    {testCaseResults.invalidCount}
                  </div>
                  <div className="text-red-600">Invalid</div>
                </div>
              </div>
            </div>
          )}

          {/* Connection Status Warning */}
          {!webSocket.isConnected && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-yellow-800 text-sm">
                ⚠️ Real-time updates unavailable. Upload progress will be simulated.
              </p>
            </div>
          )}

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={!uploadState.file || uploadState.isUploading}
            className="w-full"
          >
            {uploadState.isUploading 
              ? `${getStageDisplayName(uploadState.stage)}` 
              : 'Upload & Process File'
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};