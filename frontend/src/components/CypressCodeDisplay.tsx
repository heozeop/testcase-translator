import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface GeneratedFile {
  fileName: string;
  content: string;
  type: 'test' | 'config' | 'support';
  filePath?: string;
  fileSize?: number;
}

interface GenerationSummary {
  generationId: string;
  sessionId?: string;
  suiteName?: string;
  description?: string;
  status: string;
  filesCount: number;
  createdAt: string;
  updatedAt: string;
  baseUrl?: string;
}

interface GenerationDetail {
  generationId: string;
  projectId: string;
  projectName: string;
  projectUrl: string;
  testCasesCount: number;
  filesGenerated: number;
  files: GeneratedFile[];
  createdAt: string;
  sessionId?: string;
  suiteName?: string;
  description?: string;
  status: string;
  baseUrl?: string;
}

interface TestExecutionProgress {
  stage: string;
  progress: number;
  message: string;
  elapsedTime?: number;
}

interface TestExecutionResult {
  executionId: string;
  projectId: string;
  status: string;
  startedAt: string;
  baseUrl: string;
  logs?: {
    message?: string;
    stage?: string;
    testResults?: Array<{
      name: string;
      status: string;
      details?: string;
      duration?: number;
      error?: string;
      stackTrace?: string;
      codeFrame?: any;
      retries?: number;
    }>;
    summary?: {
      total: number;
      passed: number;
      failed: number;
    };
    screenshots?: string[];
    videos?: string[];
    cypressLogs?: string;
  };
}

interface CypressCodeDisplayProps {
  projectId: string;
  onBack?: () => void;
}

export const CypressCodeDisplay: React.FC<CypressCodeDisplayProps> = ({ projectId, onBack }) => {
  // List states
  const [generationsList, setGenerationsList] = useState<GenerationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  // Selected generation states
  const [selectedGeneration, setSelectedGeneration] = useState<GenerationDetail | null>(null);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  // Generation states
  const [generationProgress, setGenerationProgress] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Execution states
  const [executionResult, setExecutionResult] = useState<TestExecutionResult | null>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionProgress, setExecutionProgress] = useState<TestExecutionProgress | null>(null);
  
  const { toast } = useToast();

  // Load generated code list
  const loadGenerationsList = useCallback(async (page: number = 1) => {
    try {
      setListLoading(true);
      setListError(null);
      
      console.log('🔍 Loading generated code list for project:', projectId, 'page:', page);
      
      const response = await apiService.listGeneratedCode(projectId, page, 10);
      
      console.log('📋 Generated code list response:', response);
      
      setGenerationsList(response.data || []);
      setPagination(response.pagination || {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      });
      
    } catch (error: any) {
      console.error('❌ Error loading generated code list:', error);
      setListError(error.message || 'Failed to load generated code list');
    } finally {
      setListLoading(false);
    }
  }, [projectId]);

  // Load specific generation detail
  const loadGenerationDetail = useCallback(async (generationId: string) => {
    try {
      setGenerationLoading(true);
      setGenerationError(null);
      
      console.log('🔍 Loading generation detail:', generationId);
      
      const response = await apiService.getGeneratedCodeById(projectId, generationId);
      
      if (response) {
        console.log('📄 Generation detail loaded:', response);
        setSelectedGeneration(response);
      } else {
        setGenerationError('Generated code not found');
      }
      
    } catch (error: any) {
      console.error('❌ Error loading generation detail:', error);
      setGenerationError(error.message || 'Failed to load generation detail');
    } finally {
      setGenerationLoading(false);
    }
  }, [projectId]);

  // Generate new code
  const generateCode = useCallback(async () => {
    try {
      setIsGenerating(true);
      setGenerationError(null);
      setGenerationProgress(null);
      
      console.log('🚀 Starting code generation for project:', projectId);
      
      const result = await apiService.generateCypressCode(projectId, (progress) => {
        setGenerationProgress(progress);
        console.log('Generation progress:', progress);
      });
      
      console.log('🎉 Generation completed:', result);
      setGenerationProgress(null);
      
      toast({
        title: "Success",
        description: `Generated ${result?.filesGenerated || 0} Cypress files from ${result?.testCasesCount || 0} test cases`
      });

      // Reload list and select new generation
      await loadGenerationsList(1);
      
    } catch (error: any) {
      console.error('❌ Error generating Cypress code:', error);
      const errorMessage = error.message || 'Failed to generate Cypress code';
      setGenerationError(errorMessage);
      setGenerationProgress(null);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, toast, loadGenerationsList]);

  // Poll execution status
  const pollExecutionStatus = useCallback(async (executionId: string) => {
    const maxAttempts = 120;
    let attempts = 0;
    
    const poll = async (): Promise<void> => {
      try {
        attempts++;
        console.log(`🔄 Polling attempt ${attempts}/${maxAttempts} for execution:`, executionId);
        
        const response = await apiService.getCypressExecutionStatus(projectId, executionId);
        const statusData = response.data || response;
        
        console.log('📊 Poll response status:', statusData.status);
        
        setExecutionResult(prev => ({ 
          ...prev, 
          ...statusData,
          executionId: prev?.executionId || executionId,
          projectId: prev?.projectId || projectId
        }));
        
        if (statusData.status === 'completed' || statusData.status === 'failed' || statusData.status === 'error') {
          console.log('🏁 Execution finished with status:', statusData.status);
          
          setExecutionLoading(false);
          setExecutionProgress(null);
          
          const isSuccess = statusData.status === 'completed';
          const passedCount = statusData.logs?.summary?.passed || 0;
          const totalCount = statusData.logs?.summary?.total || 0;
          
          toast({
            title: isSuccess ? "✅ Tests Completed" : "❌ Tests Failed",
            description: isSuccess ? `${passedCount}/${totalCount} tests passed` : 'Test execution failed',
            variant: isSuccess ? "default" : "destructive"
          });
          return;
        }
        
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          console.error('⏰ Polling timed out');
          setExecutionError('Test execution timed out. Tests may still be running in the background.');
          setExecutionLoading(false);
          setExecutionProgress(null);
        }
      } catch (error: any) {
        console.error('❌ Error polling execution status:', error);
        setExecutionError('Failed to get execution status');
        setExecutionLoading(false);
        setExecutionProgress(null);
      }
    };
    
    await poll();
  }, [projectId, toast]);

  // Run tests
  const runTests = useCallback(async () => {
    if (!selectedGeneration) {
      toast({
        title: "No Code Selected",
        description: "Please select generated code first before running tests",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log('🏃 Starting test execution for selected generation:', selectedGeneration.generationId);
      
      setExecutionLoading(true);
      setExecutionError(null);
      setExecutionResult(null);
      setExecutionProgress({
        stage: 'initializing',
        progress: 0,
        message: 'Initializing test execution for selected generation...',
        elapsedTime: 0
      });
      
      // Use the new API method that runs tests for a specific generation
      const result = await apiService.runCypressTestsForGeneration(projectId, selectedGeneration.generationId, (progress) => {
        console.log('🔄 Received execution progress:', progress);
        setExecutionProgress(progress);
      });
      
      console.log('✅ Test execution API call completed for generation:', result);
      
      const resultData = result.data || result;
      setExecutionResult(resultData);
      
      if (resultData.executionId) {
        console.log('📊 Starting polling for execution:', resultData.executionId);
        await pollExecutionStatus(resultData.executionId);
      } else {
        console.warn('⚠️ No executionId found in response');
        setExecutionLoading(false);
        setExecutionProgress(null);
      }
      
    } catch (error: any) {
      console.error('❌ Error running tests:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to run tests';
      
      setExecutionError(errorMessage);
      setExecutionProgress(null);
      setExecutionLoading(false);
      
      toast({
        title: "Test Execution Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [projectId, selectedGeneration, toast, pollExecutionStatus]);

  // File operations
  const downloadFile = useCallback((file: GeneratedFile) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Success",
      description: `Downloaded ${file.fileName}`
    });
  }, [toast]);

  const downloadAllFiles = useCallback(() => {
    if (!selectedGeneration?.files) return;
    
    selectedGeneration.files.forEach((file, index) => {
      setTimeout(() => downloadFile(file), index * 100);
    });
  }, [selectedGeneration, downloadFile]);

  const copyToClipboard = useCallback(async (content: string, fileName: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied",
        description: `${fileName} copied to clipboard`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    }
  }, [toast]);

  // Delete generation
  const deleteGeneration = useCallback(async (generationId: string) => {
    try {
      await apiService.deleteGeneratedCode(projectId, generationId);
      
      toast({
        title: "Success",
        description: "Generated code deleted successfully"
      });
      
      // If we deleted the currently selected generation, clear selection
      if (selectedGeneration?.generationId === generationId) {
        setSelectedGeneration(null);
      }
      
      // Reload the list
      await loadGenerationsList(pagination.page);
      
    } catch (error: any) {
      console.error('❌ Error deleting generated code:', error);
      toast({
        title: "Error", 
        description: error.message || "Failed to delete generated code",
        variant: "destructive"
      });
    }
  }, [projectId, selectedGeneration, pagination.page, toast, loadGenerationsList]);

  // Load list on mount
  useEffect(() => {
    loadGenerationsList();
  }, [loadGenerationsList]);

  if (listLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-lg font-semibold">Loading Generated Code</p>
            <p className="text-sm text-muted-foreground">Fetching your generated Cypress tests...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Generated Cypress Code</h2>
          <p className="text-muted-foreground">
            {pagination.total > 0 
              ? `${pagination.total} generation${pagination.total !== 1 ? 's' : ''} found`
              : 'Generate Cypress test code from your uploaded test cases'
            }
          </p>
        </div>
        <div className="space-x-2">
          {selectedGeneration && (
            <>
              <Button 
                onClick={runTests} 
                disabled={executionLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {executionLoading ? 'Running Tests...' : 'Run Tests'}
              </Button>
              <Button onClick={downloadAllFiles} variant="outline">
                Download All Files
              </Button>
            </>
          )}
          <Button onClick={generateCode} variant="outline" disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate New Code'}
          </Button>
          {onBack && (
            <Button onClick={onBack} variant="outline">
              Back to Test Cases
            </Button>
          )}
        </div>
      </div>

      {/* Generation Progress */}
      {isGenerating && generationProgress && (
        <Card>
          <CardHeader>
            <CardTitle>🤖 Generating Cypress Code</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Stage: <span className="font-medium capitalize">{generationProgress.stage?.replace('_', ' ')}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-primary h-3 rounded-full transition-all duration-300" 
                  style={{ width: `${generationProgress.progress || 0}%` }}
                ></div>
              </div>
              <div className="text-sm font-medium">
                {generationProgress.progress || 0}% - {generationProgress.message}
              </div>
              {generationProgress.elapsedTime && (
                <div className="text-xs text-muted-foreground">
                  Elapsed: {Math.round(generationProgress.elapsedTime / 1000)}s
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Execution Progress */}
      {executionLoading && (
        <Card>
          <CardHeader>
            <CardTitle>🔄 Test Execution Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {executionProgress ? (
                <>
                  <div className="text-sm text-muted-foreground">
                    Stage: <span className="font-medium capitalize">{executionProgress.stage?.replace('_', ' ')}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-blue-500 h-3 rounded-full transition-all duration-500" 
                      style={{ width: `${executionProgress.progress || 0}%` }}
                    ></div>
                  </div>
                  <div className="text-sm font-medium">
                    {executionProgress.progress || 0}% - {executionProgress.message}
                  </div>
                  {executionProgress.elapsedTime && (
                    <div className="text-xs text-muted-foreground">
                      Elapsed: {Math.round(executionProgress.elapsedTime / 1000)}s
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Initializing Test Execution</p>
                    <p className="text-xs text-muted-foreground mt-1">Setting up test environment...</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error States */}
      {(listError || generationError) && (
        <Card>
          <CardContent className="p-6">
            <div className="text-red-600">
              <h3 className="font-medium mb-2">Error</h3>
              <p className="text-sm">{listError || generationError}</p>
              <Button onClick={() => loadGenerationsList()} className="mt-4" variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {executionError && (
        <Card>
          <CardContent className="p-6">
            <div className="text-red-600">
              <h3 className="font-medium mb-2">Execution Error</h3>
              <p className="text-sm">{executionError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Code State */}
      {!listLoading && generationsList.length === 0 && !listError && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="space-y-4">
              <div className="text-gray-500">
                <p className="text-lg font-medium">No Generated Code Available</p>
                <p className="text-sm mt-2">Click the button below to generate Cypress test code from your uploaded test cases.</p>
              </div>
              <Button onClick={generateCode} size="lg" className="px-8" disabled={isGenerating}>
                🚀 Generate Cypress Code
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Code List and Details */}
      {generationsList.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Generations List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Generated Code History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {generationsList.map((generation) => (
                  <div
                    key={generation.generationId}
                    className={`p-3 rounded-lg border transition-all ${
                      selectedGeneration?.generationId === generation.generationId
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div 
                      className="cursor-pointer"
                      onClick={() => loadGenerationDetail(generation.generationId)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-sm">
                          {generation.suiteName || `Generation ${generation.generationId.slice(-8)}`}
                        </h4>
                        <span className={`px-2 py-1 rounded text-xs ${
                          generation.status === 'completed' 
                            ? 'bg-green-100 text-green-800' 
                            : generation.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {generation.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        {generation.filesCount} files • {new Date(generation.createdAt).toLocaleDateString()}
                      </p>
                      {generation.description && (
                        <p className="text-xs text-gray-500 truncate">{generation.description}</p>
                      )}
                    </div>
                    <div className="flex justify-end mt-2 pt-2 border-t border-gray-100">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteGeneration(generation.generationId);
                        }}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
                      >
                        🗑️ Delete
                      </Button>
                    </div>
                  </div>
                ))}
                
                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex justify-between items-center pt-4 border-t">
                    <Button
                      onClick={() => loadGenerationsList(pagination.page - 1)}
                      disabled={!pagination.hasPrev}
                      variant="outline"
                      size="sm"
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-gray-500">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      onClick={() => loadGenerationsList(pagination.page + 1)}
                      disabled={!pagination.hasNext}
                      variant="outline"
                      size="sm"
                    >
                      Next
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Selected Generation Details */}
          <div className="lg:col-span-2">
            {generationLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading generation details...</p>
                </CardContent>
              </Card>
            ) : selectedGeneration ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedGeneration.suiteName || `Generation ${selectedGeneration.generationId.slice(-8)}`}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {selectedGeneration.filesGenerated} files • Created {new Date(selectedGeneration.createdAt).toLocaleString()}
                  </p>
                </CardHeader>
                <CardContent>
                  {selectedGeneration.files && selectedGeneration.files.length > 0 ? (
                    <Tabs defaultValue={selectedGeneration.files[0]?.fileName} className="w-full">
                      <TabsList className={`grid w-full ${
                        selectedGeneration.files.length === 1 ? 'grid-cols-1' : 
                        selectedGeneration.files.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                      }`}>
                        {selectedGeneration.files.map((file) => (
                          <TabsTrigger key={file.fileName} value={file.fileName}>
                            {file.fileName}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      
                      {selectedGeneration.files.map((file) => (
                        <TabsContent key={file.fileName} value={file.fileName} className="space-y-4">
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="text-lg font-medium">{file.fileName}</h3>
                              <p className="text-sm text-muted-foreground">
                                {file.type === 'test' ? '🧪 Test File' : 
                                 file.type === 'config' ? '⚙️ Configuration' : '🔧 Support File'} • 
                                {file.content.split('\n').length} lines • 
                                {Math.round(file.content.length / 1024)}KB
                              </p>
                            </div>
                            <div className="space-x-2">
                              <Button 
                                onClick={() => copyToClipboard(file.content, file.fileName)}
                                variant="outline" 
                                size="sm"
                              >
                                📋 Copy
                              </Button>
                              <Button 
                                onClick={() => downloadFile(file)}
                                variant="outline" 
                                size="sm"
                              >
                                💾 Download
                              </Button>
                            </div>
                          </div>
                          
                          <div className="border rounded-lg overflow-hidden">
                            <div className="bg-gray-100 px-4 py-2 border-b text-sm text-gray-600">
                              <span className="font-mono">{file.fileName}</span>
                            </div>
                            
                            <div className="relative">
                              <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm max-h-96 overflow-y-auto font-mono leading-relaxed">
                                <code>
                                  {file.content.split('\n').map((line, index) => (
                                    `${String(index + 1).padStart(3, ' ')} | ${line}`
                                  )).join('\n')}
                                </code>
                              </pre>
                            </div>
                            
                            {file.type === 'test' && (
                              <div className="bg-blue-50 p-3 border-t">
                                <p className="text-sm text-blue-700 font-medium mb-1">📊 Test File Analysis:</p>
                                <div className="text-xs text-blue-600 space-y-1">
                                  <p>• Tests: {(file.content.match(/it\(/g) || []).length}</p>
                                  <p>• Describe blocks: {(file.content.match(/describe\(/g) || []).length}</p>
                                  <p>• Assertions: {(file.content.match(/should\(/g) || []).length}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No files available for this generation</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-gray-500">
                    <p className="text-lg font-medium">Select a Generation</p>
                    <p className="text-sm mt-2">Choose a generated code version from the list to view its files.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Test Results */}
      {executionResult && executionResult.logs && (
        <Card>
          <CardHeader>
            <CardTitle>Test Execution Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Status</p>
                  <p className={`capitalize ${
                    executionResult.status === 'completed' ? 'text-green-600' :
                    executionResult.status === 'running' ? 'text-blue-600' :
                    'text-red-600'
                  }`}>
                    {executionResult.status}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Started</p>
                  <p>{executionResult.startedAt ? new Date(executionResult.startedAt).toLocaleString() : 'N/A'}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Execution ID</p>
                  <p className="font-mono text-xs">{executionResult.executionId}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Base URL</p>
                  <p className="truncate">{executionResult.baseUrl}</p>
                </div>
              </div>
              
              {executionResult.logs?.summary && (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-blue-50 rounded">
                    <div className="text-2xl font-bold text-blue-600">{executionResult.logs.summary.total || 0}</div>
                    <div className="text-sm text-blue-700">Total Tests</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <div className="text-2xl font-bold text-green-600">{executionResult.logs.summary.passed || 0}</div>
                    <div className="text-sm text-green-700">Passed</div>
                  </div>
                  <div className="p-3 bg-red-50 rounded">
                    <div className="text-2xl font-bold text-red-600">{executionResult.logs.summary.failed || 0}</div>
                    <div className="text-sm text-red-700">Failed</div>
                  </div>
                </div>
              )}
              
              {/* Status Message */}
              {executionResult.logs?.message && !executionResult.logs?.testResults && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">{executionResult.logs.message}</p>
                </div>
              )}
              
              {/* Test Results Details */}
              {executionResult.logs?.testResults && executionResult.logs.testResults.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-medium mb-4">Test Results</h4>
                  <div className="space-y-3">
                    {executionResult.logs.testResults.map((test, index) => (
                      <div key={index} className={`p-4 rounded-lg border ${
                        test.status === 'passed' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                test.status === 'passed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {test.status === 'passed' ? '✓' : '✗'} {test.status}
                              </span>
                              <span className="font-medium">{test.name}</span>
                            </div>
                            {test.error && (
                              <div className="mt-2 text-sm text-red-600">
                                <p className="font-medium">Error:</p>
                                <pre className="mt-1 p-2 bg-red-100 rounded text-xs overflow-x-auto">{test.error}</pre>
                              </div>
                            )}
                            
                            {test.codeFrame && (
                              <div className="mt-2 text-sm">
                                <p className="font-medium text-gray-700">Code Frame:</p>
                                <div className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                                  <pre className="font-mono">{test.codeFrame.frame}</pre>
                                  <p className="text-gray-600 mt-1">
                                    {test.codeFrame.originalFile}:{test.codeFrame.line}:{test.codeFrame.column}
                                  </p>
                                </div>
                              </div>
                            )}
                            
                            <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                              {test.duration && (
                                <span>Duration: {(test.duration / 1000).toFixed(2)}s</span>
                              )}
                              {test.retries && test.retries > 0 && (
                                <span>Retries: {test.retries}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cypress Logs */}
              {executionResult.logs?.cypressLogs && (
                <div className="mt-6">
                  <h4 className="text-lg font-medium mb-4">Cypress Output</h4>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">{executionResult.logs.cypressLogs}</pre>
                  </div>
                </div>
              )}

              {/* Screenshots and Videos */}
              {(executionResult.logs?.screenshots?.length > 0 || executionResult.logs?.videos?.length > 0) && (
                <div className="mt-6">
                  <h4 className="text-lg font-medium mb-4">Test Artifacts</h4>
                  
                  {/* Screenshots */}
                  {executionResult.logs?.screenshots?.length > 0 && (
                    <div className="mb-4">
                      <h5 className="text-md font-medium mb-2">📸 Screenshots</h5>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {executionResult.logs.screenshots.map((screenshotUrl: string, index: number) => (
                          <div key={index} className="border rounded-lg overflow-hidden">
                            <img 
                              src={screenshotUrl} 
                              alt={`Test screenshot ${index + 1}`}
                              className="w-full h-32 object-cover cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => window.open(screenshotUrl, '_blank')}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDNIOWMtMS4xIDAtMiAuOS0yIDJ2Nmg0di0yaDRWN2gzVjNaTTMgOWMtMS4xIDAtMiAuOS0yIDJ2Nmg0di0yaDRWMTFoM1Y5WiIgZmlsbD0iI2NjYyIvPgo8L3N2Zz4K';
                              }}
                            />
                            <div className="p-2 text-xs text-gray-600">
                              Screenshot {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Videos */}
                  {executionResult.logs?.videos?.length > 0 && (
                    <div className="mb-4">
                      <h5 className="text-md font-medium mb-2">🎥 Videos</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {executionResult.logs.videos.map((videoUrl: string, index: number) => (
                          <div key={index} className="border rounded-lg overflow-hidden">
                            <video 
                              controls 
                              className="w-full h-48"
                              preload="metadata"
                            >
                              <source src={videoUrl} type="video/mp4" />
                              Your browser does not support the video tag.
                            </video>
                            <div className="p-2 text-xs text-gray-600">
                              Test execution video {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};