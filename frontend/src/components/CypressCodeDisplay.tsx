import React, { useState, useEffect } from 'react';
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

  const generateCode = async () => {
    try {
      setLoading(true);
      setError(null);
      setGenerationProgress(null);
      
      const result = await apiService.generateCypressCode(projectId, (progress) => {
        setGenerationProgress(progress);
        console.log('Generation progress:', progress);
      });
      
      console.log('Final result received:', result);
      setGenerationResult(result);
      setGenerationProgress(null);
      
      toast({
        title: "Success",
        description: `Generated ${result.filesGenerated} Cypress files from ${result.testCasesCount} test cases using intelligent crawling`
      });
    } catch (error: any) {
      console.error('Error generating Cypress code:', error);
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
  };

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
      
      const result = await apiService.runCypressTests(projectId);
      setExecutionResult(result.data);
      
      toast({
        title: "Success",
        description: "Cypress tests execution started"
      });

      // Poll for execution status
      const executionId = result.data.executionId;
      if (executionId) {
        pollExecutionStatus(executionId);
      }
    } catch (error: any) {
      console.error('Error running Cypress tests:', error);
      const errorMessage = error.message || 'Failed to run Cypress tests';
      setExecutionError(errorMessage);
      toast({
        title: "Error",
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
        const status = await apiService.getCypressExecutionStatus(projectId, executionId);
        
        if (status.data.status === 'completed' || status.data.status === 'failed' || status.data.status === 'error') {
          setExecutionResult(prev => ({ ...prev, ...status.data }));
          
          toast({
            title: status.data.status === 'completed' ? "Tests Completed" : "Tests Failed",
            description: `Execution ${status.data.status}`,
            variant: status.data.status === 'completed' ? "default" : "destructive"
          });
          return;
        }
        
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          setExecutionError('Execution timed out');
        }
      } catch (error) {
        console.error('Error polling execution status:', error);
        setExecutionError('Failed to get execution status');
      }
    };
    
    poll();
  };

  // Auto-generate on component mount
  useEffect(() => {
    generateCode();
  }, [projectId]);

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
            <p>No generation result available</p>
            <Button onClick={generateCode}>
              Generate Cypress Code
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Generated Cypress Code</h2>
          <p className="text-muted-foreground">
            {generationResult.filesGenerated || 0} files generated from {generationResult.testCasesCount || 0} test cases
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
              <p>{generationResult.projectName || 'Unknown'}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Target URL</p>
              <p className="truncate">{generationResult.projectUrl || 'N/A'}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Test Cases</p>
              <p>{generationResult.testCasesCount || 0}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Generated</p>
              <p>{generationResult.createdAt ? new Date(generationResult.createdAt).toLocaleString() : 'N/A'}</p>
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
                          {test.screenshotUrl && (
                            <div className="mt-2">
                              <p className="text-sm text-muted-foreground mb-2">Screenshot:</p>
                              <img 
                                src={`http://localhost:8000${test.screenshotUrl}`}
                                alt={`Screenshot for ${test.name}`}
                                className="w-full rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(`http://localhost:8000${test.screenshotUrl}`, '_blank')}
                              />
                            </div>
                          )}
                          {test.error && (
                            <p className="text-sm text-red-600 mt-2">Error: {test.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {executionResult.logs && !executionResult.logs.testResults && (
                  <div>
                    <h4 className="font-medium mb-2">Execution Logs</h4>
                    <div className="bg-muted p-4 rounded-lg max-h-64 overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap">
                        {typeof executionResult.logs === 'string' 
                          ? executionResult.logs 
                          : JSON.stringify(executionResult.logs, null, 2)
                        }
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {generationResult.files && generationResult.files.length > 0 && (
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
                  <h3 className="text-lg font-medium">{file.fileName}</h3>
                  <div className="space-x-2">
                    <Button 
                      onClick={() => copyToClipboard(file.content, file.fileName)}
                      variant="outline" 
                      size="sm"
                    >
                      Copy
                    </Button>
                    <Button 
                      onClick={() => downloadFile(file)}
                      variant="outline" 
                      size="sm"
                    >
                      Download
                    </Button>
                  </div>
                </div>
                
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm max-h-96 overflow-y-auto">
                    <code>{file.content}</code>
                  </pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
        </Card>
      )}
    </div>
  );
};