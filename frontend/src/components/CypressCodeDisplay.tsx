import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface GeneratedFile {
  fileName: string;
  content: string;
  type: 'test' | 'config';
}

interface GenerationResult {
  generationId: string;
  projectId: string;
  projectName: string;
  projectUrl: string;
  testCasesCount: number;
  filesGenerated: number;
  files: GeneratedFile[];
  createdAt: string;
}

interface CypressCodeDisplayProps {
  projectId: string;
  onBack?: () => void;
}

export const CypressCodeDisplay: React.FC<CypressCodeDisplayProps> = ({ projectId, onBack }) => {
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<any>(null);
  const { toast } = useToast();

  const generateCode = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setGenerationProgress(null);
      
      console.log('🚀 Starting code generation for project:', projectId);
      
      const result = await apiService.generateCypressCode(projectId, (progress) => {
        setGenerationProgress(progress);
        console.log('Generation progress:', progress);
      });
      
      console.log('🎉 Final result received:', result);
      console.log('Result structure:', {
        files: result?.files?.length || 0,
        filesGenerated: result?.filesGenerated || 0,
        testCasesCount: result?.testCasesCount || 0,
        generationId: result?.generationId || 'missing',
        projectName: result?.projectName || 'missing'
      });
      
      console.log('About to setGenerationResult with:', result);
      console.log('Result has files?', !!result?.files);
      console.log('Result files length:', result?.files?.length || 0);
      console.log('Result files array:', result?.files);
      
      setGenerationResult(result);
      setGenerationProgress(null);
      
      console.log('✅ GenerationResult state set successfully');
      
      toast({
        title: "Success",
        description: `Generated ${result?.filesGenerated || 0} Cypress files from ${result?.testCasesCount || 0} test cases using intelligent crawling`
      });
    } catch (error: any) {
      console.error('❌ Error generating Cypress code:', error);
      console.error('Error stack:', error.stack);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        cause: error.cause
      });
      const errorMessage = error.message || 'Failed to generate Cypress code';
      setError(errorMessage);
      setGenerationProgress(null);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  const downloadFile = (file: GeneratedFile) => {
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
  };

  const downloadAllFiles = () => {
    if (!generationResult?.files) return;
    
    generationResult.files.forEach(file => {
      setTimeout(() => downloadFile(file), 100); // Small delay to avoid blocking
    });
  };

  const copyToClipboard = async (content: string, fileName: string) => {
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
  };

  const runTests = async () => {
    try {
      setExecutionLoading(true);
      setExecutionError(null);
      
      console.log('Starting test execution for project:', projectId);
      const result = await apiService.runCypressTests(projectId);
      console.log('Test execution API response:', result);
      
      // Handle different response structures
      const resultData = result.data || result;
      setExecutionResult(resultData);
      
      toast({
        title: "Success",
        description: "Test execution started successfully"
      });

      // Poll for execution status
      const executionId = resultData.executionId;
      if (executionId) {
        console.log('Starting polling for execution:', executionId);
        pollExecutionStatus(executionId);
      } else {
        console.warn('No executionId found in response:', resultData);
        setExecutionError('No execution ID received - cannot track progress');
      }
    } catch (error: any) {
      console.error('Error running tests:', error);
      let errorMessage = 'Failed to run tests';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setExecutionError(errorMessage);
      toast({
        title: "Test Execution Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setExecutionLoading(false);
    }
  };

  const pollExecutionStatus = async (executionId: string) => {
    const maxAttempts = 60; // Poll for up to 5 minutes
    let attempts = 0;
    
    const poll = async () => {
      try {
        attempts++;
        console.log(`Polling attempt ${attempts}/${maxAttempts} for execution:`, executionId);
        
        const response = await apiService.getCypressExecutionStatus(projectId, executionId);
        console.log('Poll response:', response);
        
        // Handle different response structures
        const statusData = response.data || response;
        const status = statusData.status;
        
        console.log('Current execution status:', status);
        
        if (status === 'completed' || status === 'failed' || status === 'error') {
          console.log('Execution finished with status:', status);
          console.log('Final execution data:', statusData);
          
          setExecutionResult(prev => ({ 
            ...prev, 
            ...statusData,
            // Ensure we preserve the execution metadata
            executionId: prev?.executionId || executionId,
            projectId: prev?.projectId || projectId
          }));
          
          toast({
            title: status === 'completed' ? "✅ Tests Completed" : "❌ Tests Failed",
            description: `Execution ${status}${statusData.logs?.summary ? ` - ${statusData.logs.summary.passed || 0}/${statusData.logs.summary.total || 0} passed` : ''}`,
            variant: status === 'completed' ? "default" : "destructive"
          });
          return;
        }
        
        // Update current status
        setExecutionResult(prev => ({ 
          ...prev, 
          ...statusData,
          executionId: prev?.executionId || executionId,
          projectId: prev?.projectId || projectId
        }));
        
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          console.error('Polling timed out after', maxAttempts, 'attempts');
          setExecutionError('Execution polling timed out - tests may still be running');
        }
      } catch (error: any) {
        console.error('Error polling execution status:', error);
        const errorMessage = error.response?.data?.message || error.message || 'Failed to get execution status';
        setExecutionError(errorMessage);
      }
    };
    
    poll();
  };

  // Auto-generate on component mount
  useEffect(() => {
    generateCode();
  }, [projectId, generateCode]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-lg font-semibold">Generating Intelligent Cypress Code</p>
            
            {generationProgress ? (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Stage: <span className="font-medium capitalize">{generationProgress.stage?.replace('_', ' ')}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${generationProgress.progress || 0}%` }}
                  ></div>
                </div>
                <div className="text-sm">
                  {generationProgress.progress || 0}% - {generationProgress.message}
                </div>
                {generationProgress.elapsedTime && (
                  <div className="text-xs text-muted-foreground">
                    Elapsed: {Math.round(generationProgress.elapsedTime / 1000)}s
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p>Initializing intelligent code generation...</p>
                <p className="text-sm text-muted-foreground">This process includes website crawling and analysis</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !generationResult) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <p className="text-destructive">{error}</p>
            <Button onClick={generateCode} variant="outline">
              Try Again
            </Button>
            {onBack && (
              <Button onClick={onBack} variant="outline">
                Back
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!generationResult) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="text-gray-500">
              <p className="text-lg font-medium">No Generated Code Available</p>
              <p className="text-sm mt-2">Click the button below to generate Cypress test code from your uploaded test cases.</p>
            </div>
            <Button onClick={generateCode} size="lg" className="px-8">
              🚀 Generate Cypress Code
            </Button>
            {onBack && (
              <Button onClick={onBack} variant="outline">
                ← Back to Project
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  console.log('Render - generationResult:', generationResult);
  console.log('Render - generationResult?.files:', generationResult?.files);
  console.log('Render - generationResult?.files?.length:', generationResult?.files?.length);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Generated Cypress Code</h2>
          <p className="text-muted-foreground">
            {generationResult?.filesGenerated || 0} files generated from {generationResult?.testCasesCount || 0} test cases
          </p>
        </div>
        <div className="space-x-2">
          <Button onClick={runTests} disabled={executionLoading}>
            {executionLoading ? 'Running Tests...' : 'Run Tests'}
          </Button>
          <Button onClick={downloadAllFiles} variant="outline">
            Download All Files
          </Button>
          <Button onClick={generateCode} variant="outline" disabled={loading}>
            Regenerate
          </Button>
          {onBack && (
            <Button onClick={onBack} variant="outline">
              Back to Test Cases
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Project</p>
              <p>{generationResult?.projectName || 'Unknown'}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Target URL</p>
              <p className="truncate">{generationResult?.projectUrl || 'N/A'}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Test Cases</p>
              <p>{generationResult?.testCasesCount || 0}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Generated</p>
              <p>{generationResult?.createdAt ? new Date(generationResult.createdAt).toLocaleString() : 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Execution Results */}
      {(executionResult || executionError) && (
        <Card>
          <CardHeader>
            <CardTitle>Test Execution Results</CardTitle>
          </CardHeader>
          <CardContent>
            {executionError && (
              <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                <p className="text-red-700">{executionError}</p>
              </div>
            )}
            
            {executionResult && (
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
                
                {executionResult.logs?.testResults && (
                  <div>
                    <h4 className="font-medium mb-2">Test Results</h4>
                    <div className="grid gap-4">
                      {executionResult.logs.testResults.map((test: any, index: number) => (
                        <div key={index} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium">{test.name}</h5>
                            <span className={`px-2 py-1 rounded text-sm ${
                              test.status === 'passed' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {test.status}
                            </span>
                          </div>
                          
                          {/* Test Details */}
                          {test.details && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                              <p className="font-medium text-gray-700 mb-1">Details:</p>
                              <p className="text-gray-600">{test.details}</p>
                            </div>
                          )}
                          
                          {/* Collapsible Screenshot */}
                          {test.screenshotUrl && (
                            <div className="mt-3">
                              <details className="group">
                                <summary className="flex items-center justify-between cursor-pointer p-2 bg-blue-50 rounded hover:bg-blue-100 transition-colors">
                                  <span className="text-sm font-medium text-blue-800">📸 View Screenshot</span>
                                  <span className="text-blue-600 group-open:rotate-90 transition-transform">▶</span>
                                </summary>
                                <div className="mt-2 p-2 border border-blue-200 rounded">
                                  <img 
                                    src={`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'}${test.screenshotUrl}`}
                                    alt={`Screenshot for ${test.name}`}
                                    className="w-full rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'}${test.screenshotUrl}`, '_blank')}
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const errorDiv = document.createElement('div');
                                      errorDiv.className = 'text-red-500 text-sm p-2';
                                      errorDiv.textContent = 'Screenshot failed to load';
                                      target.parentNode?.appendChild(errorDiv);
                                    }}
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Click to open in new tab</p>
                                </div>
                              </details>
                            </div>
                          )}
                          
                          {/* Collapsible Video */}
                          {test.video && (
                            <div className="mt-3">
                              <details className="group">
                                <summary className="flex items-center justify-between cursor-pointer p-2 bg-purple-50 rounded hover:bg-purple-100 transition-colors">
                                  <span className="text-sm font-medium text-purple-800">🎥 View Test Video</span>
                                  <span className="text-purple-600 group-open:rotate-90 transition-transform">▶</span>
                                </summary>
                                <div className="mt-2 p-2 border border-purple-200 rounded">
                                  <video 
                                    src={`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'}/api/projects/${executionResult.projectId}/executions/${executionResult.executionId}/videos/${test.video}`}
                                    controls
                                    className="w-full rounded-lg border"
                                    preload="metadata"
                                    onError={(e) => {
                                      const target = e.target as HTMLVideoElement;
                                      target.style.display = 'none';
                                      const errorDiv = document.createElement('div');
                                      errorDiv.className = 'text-red-500 text-sm p-2';
                                      errorDiv.textContent = 'Video failed to load';
                                      target.parentNode?.appendChild(errorDiv);
                                    }}
                                  >
                                    Your browser does not support the video tag.
                                  </video>
                                  <p className="text-xs text-gray-500 mt-1">MP4 video recording of test execution</p>
                                </div>
                              </details>
                            </div>
                          )}
                          
                          {/* Error Message */}
                          {test.error && (
                            <div className="mt-2 p-2 bg-red-50 rounded">
                              <p className="text-sm font-medium text-red-700 mb-1">Error:</p>
                              <p className="text-sm text-red-600 font-mono">{test.error}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Summary Section */}
                {executionResult.logs?.summary && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Test Summary</h4>
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
                  </div>
                )}

                {/* Raw Logs - Collapsible */}
                {executionResult.logs && (
                  <div className="mt-4">
                    <details className="group">
                      <summary className="flex items-center justify-between cursor-pointer p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                        <span className="font-medium text-gray-700">🔍 View Raw Execution Logs</span>
                        <span className="text-gray-500 group-open:rotate-90 transition-transform">▶</span>
                      </summary>
                      <div className="mt-2 bg-gray-900 text-green-400 p-4 rounded-lg max-h-96 overflow-y-auto font-mono text-sm">
                        <pre className="whitespace-pre-wrap">
                          {(() => {
                            try {
                              const logs = executionResult.logs;
                              
                              if (typeof logs === 'string') {
                                return logs;
                              }
                              
                              // Format the logs in a more readable way
                              let formatted = '';
                              
                              if (logs.testResults) {
                                formatted += '=== TEST EXECUTION RESULTS ===\n\n';
                                logs.testResults.forEach((test: any, index: number) => {
                                  formatted += `${index + 1}. ${test.name}\n`;
                                  formatted += `   Status: ${test.status}\n`;
                                  if (test.details) formatted += `   Details: ${test.details}\n`;
                                  if (test.error) formatted += `   Error: ${test.error}\n`;
                                  formatted += '\n';
                                });
                              }
                              
                              if (logs.summary) {
                                formatted += '=== SUMMARY ===\n';
                                formatted += `Total: ${logs.summary.total} | Passed: ${logs.summary.passed} | Failed: ${logs.summary.failed}\n\n`;
                              }
                              
                              if (logs.completedAt) {
                                formatted += `Completed at: ${logs.completedAt}\n\n`;
                              }
                              
                              // Add any additional log data
                              const additionalData = { ...logs };
                              delete additionalData.testResults;
                              delete additionalData.summary;
                              delete additionalData.completedAt;
                              delete additionalData.screenshots;
                              
                              if (Object.keys(additionalData).length > 0) {
                                formatted += '=== ADDITIONAL DATA ===\n';
                                formatted += JSON.stringify(additionalData, null, 2);
                              }
                              
                              return formatted || 'No execution logs available';
                            } catch (error) {
                              return `Error formatting logs: ${error}\n\nRaw data:\n${JSON.stringify(executionResult.logs, null, 2)}`;
                            }
                          })()}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generated Files or No Files Message */}
      {(() => {
        console.log('Render check - generationResult:', generationResult);
        console.log('Render check - files exists:', !!generationResult?.files);
        console.log('Render check - files length:', generationResult?.files?.length);
        console.log('Render check - condition result:', !!(generationResult?.files && generationResult.files.length > 0));
        return generationResult?.files && generationResult.files.length > 0;
      })() ? (
        <Card>
          <CardHeader>
            <CardTitle>Generated Files</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={generationResult.files[0]?.fileName || 'generated-tests.cy.js'} className="w-full">
            <TabsList className={`grid w-full ${generationResult.files.length === 1 ? 'grid-cols-1' : generationResult.files.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {generationResult.files.map((file) => (
                <TabsTrigger key={file.fileName} value={file.fileName}>
                  {file.fileName}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {generationResult.files.map((file) => (
              <TabsContent key={file.fileName} value={file.fileName} className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium">{file.fileName}</h3>
                    <p className="text-sm text-muted-foreground">
                      {file.type === 'test' ? '🧪 Test File' : '⚙️ Configuration'} • 
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
                
                {/* File Content */}
                <div className="border rounded-lg overflow-hidden">
                  {/* Header with file info */}
                  <div className="bg-gray-100 px-4 py-2 border-b text-sm text-gray-600">
                    <span className="font-mono">{file.fileName}</span>
                  </div>
                  
                  {/* Collapsible content for large files */}
                  {file.content.length > 5000 ? (
                    <details className="group">
                      <summary className="cursor-pointer p-4 bg-yellow-50 hover:bg-yellow-100 transition-colors">
                        <span className="font-medium">⚠️ Large file ({Math.round(file.content.length / 1024)}KB) - Click to view content</span>
                        <span className="float-right group-open:rotate-90 transition-transform">▶</span>
                      </summary>
                      <div className="relative">
                        <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm max-h-96 overflow-y-auto font-mono leading-relaxed">
                          <code className="language-javascript">
                            {(() => {
                              // Add line numbers and syntax highlighting hints
                              return file.content.split('\n').map((line, index) => (
                                `${String(index + 1).padStart(3, ' ')} | ${line}`
                              )).join('\n');
                            })()}
                          </code>
                        </pre>
                      </div>
                    </details>
                  ) : (
                    <div className="relative">
                      <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm max-h-96 overflow-y-auto font-mono leading-relaxed">
                        <code className="language-javascript">
                          {(() => {
                            // Add line numbers for better readability
                            return file.content.split('\n').map((line, index) => (
                              `${String(index + 1).padStart(3, ' ')} | ${line}`
                            )).join('\n');
                          })()}
                        </code>
                      </pre>
                    </div>
                  )}
                  
                  {/* Quick preview for test files */}
                  {file.type === 'test' && (
                    <div className="bg-blue-50 p-3 border-t">
                      <p className="text-sm text-blue-700 font-medium mb-1">📊 Test File Analysis:</p>
                      <div className="text-xs text-blue-600 space-y-1">
                        <p>• Tests: {(file.content.match(/it\(/g) || []).length}</p>
                        <p>• Describe blocks: {(file.content.match(/describe\(/g) || []).length}</p>
                        <p>• Assertions: {(file.content.match(/should\(/g) || []).length}</p>
                        <p>• Wait commands: {(file.content.match(/cy\.wait\(/g) || []).length}</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="space-y-4">
              <div className="text-gray-500">
                <p className="text-lg font-medium">⚠️ No Files Generated</p>
                <p className="text-sm mt-2">
                  The code generation completed but no files were created. This might be due to:
                </p>
                <ul className="text-sm mt-2 space-y-1 text-left max-w-md mx-auto">
                  <li>• No valid test cases found in uploaded file</li>
                  <li>• Test cases couldn't be parsed properly</li>
                  <li>• Generation process encountered an error</li>
                  <li>• Website crawling failed</li>
                </ul>
              </div>
              <div className="space-x-2">
                <Button onClick={generateCode} variant="outline">
                  🔄 Try Again
                </Button>
                {onBack && (
                  <Button onClick={onBack} variant="outline">
                    ← Back to Upload
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};