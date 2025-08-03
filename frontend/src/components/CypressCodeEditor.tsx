import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Save, Play, Download, Copy, Loader2, Eye, Edit3 } from 'lucide-react';
import CodeEditor from './CodeEditor';
import { MonacoErrorBoundary } from './MonacoErrorBoundary';

interface GeneratedFile {
  fileName: string;
  content: string;
  type: 'test' | 'config' | 'support';
  filePath?: string;
  fileSize?: number;
}

interface EditableFile extends GeneratedFile {
  originalContent: string;
  isModified: boolean;
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

interface CypressCodeEditorProps {
  projectId: string;
  generationId: string;
  onBack?: () => void;
}

export const CypressCodeEditor: React.FC<CypressCodeEditorProps> = ({ 
  projectId, 
  generationId, 
  onBack 
}) => {
  // State management for file editing
  const [generation, setGeneration] = useState<GenerationDetail | null>(null);
  const [editableFiles, setEditableFiles] = useState<EditableFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isEditorMode, setIsEditorMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Save states
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  
  // Execution states
  const [executionResult, setExecutionResult] = useState<TestExecutionResult | null>(null);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionProgress, setExecutionProgress] = useState<TestExecutionProgress | null>(null);
  
  const { toast } = useToast();
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load generation details and initialize editable files
  const loadGeneration = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Loading generation for editing:', generationId);
      
      const response = await apiService.getGeneratedCodeById(projectId, generationId);
      
      if (response) {
        console.log('📄 Generation loaded for editing:', response);
        setGeneration(response);
        
        // Convert files to editable format - API service returns the data object directly
        const files = response.files || [];
        console.log('🔍 Response structure:', { response, files: files.length, hasFiles: !!response.files });
        
        if (files.length === 0) {
          console.warn('⚠️ No files found in generation response');
          setError('No files available for editing in this generation');
          return;
        }
        
        // Validate that files have content
        const validFiles = files.filter((file: GeneratedFile) => file.content && file.content.trim().length > 0);
        if (validFiles.length === 0) {
          console.warn('⚠️ All files are empty or have no content');
          setError('All files in this generation appear to be empty');
          return;
        }
        
        if (validFiles.length !== files.length) {
          console.warn(`⚠️ ${files.length - validFiles.length} files were excluded due to empty content`);
        }
        
        const editableFiles = validFiles.map((file: GeneratedFile) => ({
          ...file,
          originalContent: file.content,
          isModified: false
        }));
        
        setEditableFiles(editableFiles);
        setActiveFileIndex(0);
        console.log('✅ Successfully loaded', editableFiles.length, 'editable files');
      } else {
        console.error('❌ No response data received');
        setError('Generated code not found - the generation may have been deleted or is corrupted');
      }
      
    } catch (error: any) {
      console.error('❌ Error loading generation for editing:', error);
      
      // Provide specific error messages based on error type
      let errorMessage = 'Failed to load generation details';
      
      if (error.response?.status === 404) {
        errorMessage = 'Generated code not found. The generation may have been deleted.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access denied. You may not have permission to edit this generation.';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server error occurred. Please try again in a few moments.';
      } else if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. The server may be busy, please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [projectId, generationId]);

  // Auto-save functionality (will be implemented after saveFiles)
  const autoSaveRef = useRef<(() => Promise<void>) | null>(null);

  // Handle code changes with auto-save debouncing
  const handleCodeChange = useCallback((newContent: string, fileIndex: number) => {
    setEditableFiles(prev => {
      const updated = [...prev];
      updated[fileIndex] = {
        ...updated[fileIndex],
        content: newContent,
        isModified: newContent !== updated[fileIndex].originalContent
      };
      return updated;
    });

    // Debounce auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    if (autoSaveEnabled && autoSaveRef.current) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSaveRef.current?.();
      }, 2000); // Auto-save after 2 seconds of inactivity
    }
  }, [autoSaveEnabled]);

  // Validate JavaScript syntax
  const validateSyntax = useCallback((code: string, fileName: string) => {
    try {
      // Basic syntax validation using Function constructor
      new Function(code);
      return { valid: true };
    } catch (error: any) {
      return { 
        valid: false, 
        error: `Syntax error in ${fileName}: ${error.message}` 
      };
    }
  }, []);

  // Save files to the backend with validation
  const saveFiles = useCallback(async (filesToSave?: EditableFile[], showToast = true) => {
    try {
      setIsSaving(true);
      
      const files = filesToSave || editableFiles.filter(file => file.isModified);
      if (files.length === 0) {
        if (showToast) {
          toast({
            title: "No Changes",
            description: "No modified files to save",
          });
        }
        return;
      }

      // Validate syntax for test files before saving
      const validationErrors: string[] = [];
      for (const file of files) {
        if (file.type === 'test' && file.fileName.endsWith('.js')) {
          const validation = validateSyntax(file.content, file.fileName);
          if (!validation.valid) {
            validationErrors.push(validation.error!);
          }
        }
      }

      if (validationErrors.length > 0 && showToast) {
        toast({
          title: "Syntax Validation Failed",
          description: validationErrors[0],
          variant: "destructive"
        });
        return;
      }

      console.log('💾 Saving files:', files.map(f => f.fileName));
      
      // Call the API to save the modified files
      await apiService.updateGeneratedCodeFiles(
        projectId,
        generation!.generationId,
        files.map(file => ({
          fileName: file.fileName,
          content: file.content,
          type: file.type
        }))
      );
      
      // Update the files to mark them as saved
      setEditableFiles(prev => prev.map(file => ({
        ...file,
        originalContent: file.content,
        isModified: false
      })));
      
      setLastSaved(new Date());
      
      if (showToast) {
        toast({
          title: "Success",
          description: `Saved ${files.length} file${files.length !== 1 ? 's' : ''} successfully`,
        });
      }
      
    } catch (error: any) {
      console.error('❌ Error saving files:', error);
      const errorMessage = error.response?.data?.message || error.message || "Failed to save files";
      
      if (showToast) {
        toast({
          title: "Save Failed",
          description: errorMessage,
          variant: "destructive"
        });
      }
      
      // Log detailed error for debugging
      if (error.response?.data) {
        console.error('API Error Details:', error.response.data);
      }
    } finally {
      setIsSaving(false);
    }
  }, [editableFiles, toast, validateSyntax, projectId, generation]);

  // Auto-save functionality (now implemented after saveFiles)
  const autoSave = useCallback(async () => {
    if (!autoSaveEnabled || editableFiles.length === 0) return;
    
    const modifiedFiles = editableFiles.filter(file => file.isModified);
    if (modifiedFiles.length === 0) return;
    
    try {
      console.log('💾 Auto-saving modified files...');
      await saveFiles(modifiedFiles, false);
    } catch (error) {
      console.error('❌ Auto-save failed:', error);
    }
  }, [editableFiles, autoSaveEnabled, saveFiles]);

  // Assign autoSave to ref for use in handleCodeChange
  autoSaveRef.current = autoSave;

  // Run tests with modified code
  const runTests = useCallback(async () => {
    if (!generation) {
      toast({
        title: "No Code Selected",
        description: "Please load code first before running tests",
        variant: "destructive"
      });
      return;
    }

    // Check if there are syntax errors before running tests
    const testFiles = editableFiles.filter(file => file.type === 'test' && file.fileName.endsWith('.js'));
    const syntaxErrors: string[] = [];
    
    for (const file of testFiles) {
      const validation = validateSyntax(file.content, file.fileName);
      if (!validation.valid) {
        syntaxErrors.push(validation.error!);
      }
    }

    if (syntaxErrors.length > 0) {
      toast({
        title: "Cannot Run Tests",
        description: `Please fix syntax errors first: ${syntaxErrors[0]}`,
        variant: "destructive"
      });
      return;
    }

    try {
      console.log('🏃 Running tests with modified code for generation:', generation.generationId);
      
      setExecutionLoading(true);
      setExecutionError(null);
      setExecutionResult(null);
      setExecutionProgress({
        stage: 'initializing',
        progress: 0,
        message: 'Initializing test execution with modified code...',
        elapsedTime: 0
      });
      
      // Save any modified files before running tests
      const modifiedFiles = editableFiles.filter(file => file.isModified);
      if (modifiedFiles.length > 0) {
        console.log('💾 Auto-saving modified files before test execution...');
        await saveFiles(modifiedFiles, false);
      }
      
      // Use the API method to run tests for the specific generation
      const result = await apiService.runCypressTestsForGeneration(
        projectId, 
        generation.generationId, 
        (progress) => {
          console.log('🔄 Test execution progress:', progress);
          setExecutionProgress(progress);
        }
      );
      
      console.log('✅ Test execution completed:', result);
      
      const resultData = result.data || result;
      setExecutionResult(resultData);
      
      // Provide more detailed feedback based on results
      if (resultData?.logs?.summary) {
        const { passed, failed, total } = resultData.logs.summary;
        const message = failed > 0 
          ? `${failed} of ${total} tests failed. Check results for details.`
          : `All ${passed} tests passed successfully!`;
        
        toast({
          title: failed > 0 ? "Tests Completed with Failures" : "All Tests Passed",
          description: message,
          variant: failed > 0 ? "destructive" : "default"
        });
      } else {
        toast({
          title: "Tests Completed",
          description: "Test execution finished. Check results for details.",
        });
      }
      
    } catch (error: any) {
      console.error('❌ Error running tests:', error);
      let errorMessage = 'Failed to run tests';
      
      // Provide more specific error messages
      if (error.message?.includes('timeout')) {
        errorMessage = 'Test execution timed out. Tests may be taking too long to complete.';
      } else if (error.message?.includes('Network error')) {
        errorMessage = 'Network error occurred. Please check your connection and try again.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setExecutionError(errorMessage);
      setExecutionProgress(null);
      
      toast({
        title: "Test Execution Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setExecutionLoading(false);
    }
  }, [projectId, generation, editableFiles, saveFiles, toast, validateSyntax]);

  // File operations
  const downloadFile = useCallback((file: EditableFile) => {
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

  // Load generation on mount
  useEffect(() => {
    loadGeneration();
  }, [loadGeneration]);

  // Cleanup auto-save timeout
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveFiles();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [saveFiles]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" />
            <p className="text-lg font-semibold">Loading Code Editor</p>
            <p className="text-sm text-muted-foreground">Preparing your Cypress test files for editing...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-red-600">
            <div className="flex items-center mb-3">
              <span className="text-2xl mr-2">⚠️</span>
              <h3 className="font-medium">Error Loading Code</h3>
            </div>
            <p className="text-sm mb-4 bg-red-50 p-3 rounded border border-red-200">{error}</p>
            <div className="flex space-x-2">
              <Button 
                onClick={loadGeneration} 
                className="bg-red-600 hover:bg-red-700 text-white" 
                disabled={loading}
              >
                {loading ? 'Retrying...' : 'Try Again'}
              </Button>
              {onBack && (
                <Button onClick={onBack} variant="outline">
                  Back to Code List
                </Button>
              )}
            </div>
            <div className="mt-4 text-xs text-gray-500">
              <details>
                <summary className="cursor-pointer hover:text-gray-700">Technical Details</summary>
                <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                  Project ID: {projectId}<br/>
                  Generation ID: {generationId}<br/>
                  Error occurred at: {new Date().toLocaleString()}
                </div>
              </details>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!generation || editableFiles.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-gray-500">
            <p className="text-lg font-medium">No Files Available</p>
            <p className="text-sm mt-2">This generation doesn't have any files to edit.</p>
            {onBack && (
              <Button onClick={onBack} className="mt-4" variant="outline">
                Back to Code List
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeFile = editableFiles[activeFileIndex];
  const hasModifiedFiles = editableFiles.some(file => file.isModified);

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center space-x-2 text-sm text-muted-foreground" aria-label="Breadcrumb navigation">
        <button 
          onClick={onBack}
          className="hover:text-primary transition-colors"
          aria-label="Go back to project overview"
        >
          Project
        </button>
        <span aria-hidden="true">/</span>
        <button 
          onClick={onBack}
          className="hover:text-primary transition-colors"
          aria-label="Go back to Cypress code list"
        >
          Cypress Code
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium" aria-current="page">Editor</span>
      </nav>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Code Editor</h2>
          <p className="text-muted-foreground">
            {generation.suiteName || `Generation ${generation.generationId.slice(-8)}`}
            {hasModifiedFiles && <span className="text-orange-600 ml-2">• Unsaved changes</span>}
            {lastSaved && <span className="text-green-600 ml-2">• Last saved: {lastSaved.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => setIsEditorMode(!isEditorMode)}
            variant="outline"
            size="sm"
            aria-label={isEditorMode ? 'Switch to preview mode' : 'Switch to edit mode'}
          >
            {isEditorMode ? <Eye className="w-4 h-4 mr-2" /> : <Edit3 className="w-4 h-4 mr-2" />}
            {isEditorMode ? 'Preview' : 'Edit'}
          </Button>
          
          <Button 
            onClick={() => saveFiles()} 
            disabled={isSaving || !hasModifiedFiles}
            variant="outline"
            size="sm"
            aria-label={`Save ${hasModifiedFiles ? editableFiles.filter(f => f.isModified).length : 'no'} modified files`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save {hasModifiedFiles ? `(${editableFiles.filter(f => f.isModified).length})` : ''}
          </Button>
          
          <Button 
            onClick={runTests} 
            disabled={executionLoading}
            className="bg-green-600 hover:bg-green-700 text-white"
            aria-label="Run Cypress tests with current code"
          >
            {executionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run Tests
          </Button>
          
          {onBack && (
            <Button onClick={onBack} variant="outline" aria-label="Return to code list">
              Back
            </Button>
          )}
        </div>
      </div>

      {/* Editor Settings Bar */}
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              id="auto-save"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="auto-save" className="text-muted-foreground cursor-pointer">
              Auto-save (2s delay)
            </label>
          </div>
          
          {hasModifiedFiles && (
            <div className="flex items-center space-x-2 text-sm text-orange-600">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              <span>Unsaved changes in {editableFiles.filter(f => f.isModified).length} file(s)</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
          <span>Files: {editableFiles.length}</span>
          <span>•</span>
          <span>Total Lines: {editableFiles.reduce((acc, file) => acc + file.content.split('\n').length, 0)}</span>
          <span>•</span>
          <span>Ctrl+S to save</span>
        </div>
      </div>


      {/* Main Editor/Preview Area */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex h-[800px]">
            {/* Left Panel - Editor */}
            <div className="flex-1 flex flex-col">
              <Tabs value={activeFile.fileName} onValueChange={(fileName) => {
                const index = editableFiles.findIndex(f => f.fileName === fileName);
                if (index !== -1) setActiveFileIndex(index);
              }} className="flex-1 flex flex-col">
                <div className="border-b bg-background">
                  <TabsList className="h-auto p-0 bg-transparent w-full justify-start overflow-x-auto">
                    {editableFiles.map((file) => (
                      <TabsTrigger 
                        key={file.fileName} 
                        value={file.fileName}
                        className="relative px-4 py-3 border-b-2 border-transparent data-[state=active]:border-blue-500 whitespace-nowrap"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-xs opacity-60">
                            {file.type === 'test' ? '🧪' : file.type === 'config' ? '⚙️' : '🔧'}
                          </span>
                          <span>{file.fileName}</span>
                          {file.isModified && (
                            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                          )}
                        </div>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {editableFiles.map((file, index) => (
                  <TabsContent key={file.fileName} value={file.fileName} className="mt-0 flex-1 flex flex-col">
                    <div className="p-3 border-b bg-muted/20">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-base font-medium flex items-center space-x-2">
                            <span>{file.fileName}</span>
                            {file.isModified && (
                              <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded-md">
                                Modified
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {file.type === 'test' ? '🧪 Test File' : 
                             file.type === 'config' ? '⚙️ Configuration' : '🔧 Support File'} • 
                            {file.content.split('\n').length} lines • 
                            {Math.round(file.content.length / 1024)}KB
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button 
                            onClick={() => copyToClipboard(file.content, file.fileName)}
                            variant="outline" 
                            size="sm"
                          >
                            <Copy className="w-3 h-3 mr-1" />
                            Copy
                          </Button>
                          <Button 
                            onClick={() => downloadFile(file)}
                            variant="outline" 
                            size="sm"
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </div>

                    {isEditorMode ? (
                      <div className="flex-1 min-h-0 h-full">
                        <MonacoErrorBoundary
                          fallback={
                            <div className="h-full w-full bg-gray-900 text-gray-100 p-4 overflow-y-auto">
                              <div className="mb-4 p-2 bg-yellow-900 border border-yellow-700 rounded text-yellow-100 text-sm">
                                ⚠️ Monaco Editor failed to load. Showing read-only view instead.
                              </div>
                              <pre className="text-sm font-mono leading-relaxed">
                                <code>
                                  {file.content.split('\n').map((line, lineIndex) => (
                                    `${String(lineIndex + 1).padStart(3, ' ')} | ${line}`
                                  )).join('\n')}
                                </code>
                              </pre>
                            </div>
                          }
                        >
                          <CodeEditor
                            value={file.content}
                            language="javascript"
                            theme="vs-dark"
                            height="calc(100vh - 300px)"
                            onCodeChange={(newContent) => handleCodeChange(newContent, index)}
                            showMinimap={true}
                            className="border-0"
                          />
                        </MonacoErrorBoundary>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto">
                        <pre className="bg-gray-900 text-gray-100 p-4 text-sm font-mono leading-relaxed h-full">
                          <code>
                            {file.content.split('\n').map((line, lineIndex) => (
                              `${String(lineIndex + 1).padStart(3, ' ')} | ${line}`
                            )).join('\n')}
                          </code>
                        </pre>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
            
            {/* Right Panel - Test Results */}
            {(executionResult || executionLoading || executionError) && (
              <div className="w-96 border-l bg-muted/10 flex flex-col">
                <div className="p-3 border-b bg-background">
                  <h3 className="font-medium text-sm">Test Results</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {executionLoading && executionProgress && (
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground">
                        Stage: <span className="font-medium capitalize">{executionProgress.stage?.replace('_', ' ')}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
                          style={{ width: `${executionProgress.progress || 0}%` }}
                        ></div>
                      </div>
                      <div className="text-xs">
                        {executionProgress.progress || 0}% - {executionProgress.message}
                      </div>
                      {executionProgress.elapsedTime && (
                        <div className="text-xs text-muted-foreground">
                          Elapsed: {Math.round(executionProgress.elapsedTime / 1000)}s
                        </div>
                      )}
                    </div>
                  )}
                  
                  {executionResult && (
                    <div className="space-y-3">
                      <div className="text-xs space-y-2">
                        <div>
                          <span className="text-muted-foreground">Status:</span>
                          <span className={`ml-2 capitalize ${
                            executionResult.status === 'completed' ? 'text-green-600' :
                            executionResult.status === 'running' ? 'text-blue-600' :
                            'text-red-600'
                          }`}>
                            {executionResult.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Started:</span>
                          <span className="ml-2 text-xs">{new Date(executionResult.startedAt).toLocaleString()}</span>
                        </div>
                      </div>
                      
                      {executionResult.logs?.summary && (
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="p-2 bg-blue-50 rounded">
                            <div className="font-bold text-blue-600">{executionResult.logs.summary.total || 0}</div>
                            <div className="text-blue-700">Total</div>
                          </div>
                          <div className="p-2 bg-green-50 rounded">
                            <div className="font-bold text-green-600">{executionResult.logs.summary.passed || 0}</div>
                            <div className="text-green-700">Passed</div>
                          </div>
                          <div className="p-2 bg-red-50 rounded">
                            <div className="font-bold text-red-600">{executionResult.logs.summary.failed || 0}</div>
                            <div className="text-red-700">Failed</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {executionError && (
                    <div className="text-red-600 text-xs">
                      <h4 className="font-medium mb-2">Error</h4>
                      <p>{executionError}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default CypressCodeEditor;