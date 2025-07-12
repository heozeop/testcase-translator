import React, { useState, useEffect, useCallback } from 'react';
import { Project } from '../types/api';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { TestCasesList } from './TestCasesList';
import { CypressCodeDisplay } from './CypressCodeDisplay';
import { SimpleFileUpload } from './SimpleFileUpload';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

interface ProjectStats {
  testCasesCount: number;
  hasGeneratedCode: boolean;
  lastActivity: string;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<ProjectStats>({
    testCasesCount: 0,
    hasGeneratedCode: false,
    lastActivity: ''
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Define the callback before using it in useEffect
  const loadProjectStats = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get test cases to check count
      const testCasesResponse = await apiService.getTestCases(project.id, 1, 1);
      const testCasesCount = testCasesResponse.pagination.total;
      
      setStats({
        testCasesCount,
        hasGeneratedCode: testCasesCount > 0, // Assume we can generate if we have test cases
        lastActivity: new Date().toLocaleDateString()
      });

      // If we have test cases, automatically show test cases tab
      if (testCasesCount > 0 && activeTab === 'overview') {
        setActiveTab('test-cases');
      }
    } catch (error: any) {
      console.error('Error loading project stats:', error);
      toast({
        title: "Error",
        description: "Failed to load project statistics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [project.id, activeTab, toast]);

  // Use the callback in useEffect
  useEffect(() => {
    loadProjectStats();
  }, [loadProjectStats]);

  const handleUploadSuccess = (testCases: any[]) => {
    console.log('Upload successful, test cases:', testCases);
    // Refresh stats and switch to test cases tab
    loadProjectStats();
    setActiveTab('test-cases');
    
    toast({
      title: "Success",
      description: `Successfully uploaded ${testCases.length} test cases`
    });
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error);
    toast({
      title: "Error",
      description: error,
      variant: "destructive"
    });
  };

  const handleGenerateCypress = () => {
    setActiveTab('cypress-code');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p>Loading project details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-primary hover:underline mb-2 inline-block"
          >
            ← Back to Projects
          </button>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground mt-1">{project.description}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Target URL: <span className="font-mono">{project.target_url}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">
            Created: {new Date(project.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Test Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.testCasesCount}</div>
            <p className="text-xs text-muted-foreground">
              {stats.testCasesCount > 0 ? 'Ready for automation' : 'Upload CSV to get started'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cypress Code</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.hasGeneratedCode ? '✓' : '○'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.hasGeneratedCode ? 'Available to generate' : 'Upload test cases first'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Active</div>
            <p className="text-xs text-muted-foreground">
              Last activity: {stats.lastActivity}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Card>
        <CardHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="upload">Upload Files</TabsTrigger>
              <TabsTrigger value="test-cases" disabled={stats.testCasesCount === 0}>
                Test Cases ({stats.testCasesCount})
              </TabsTrigger>
              <TabsTrigger value="cypress-code" disabled={!stats.hasGeneratedCode}>
                Cypress Code
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">Project Overview</h3>
                
                {stats.testCasesCount === 0 ? (
                  <div className="text-center py-8 space-y-4">
                    <div className="text-6xl mb-4">📋</div>
                    <h4 className="text-xl font-semibold">Ready to Start Testing</h4>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Upload your CSV or Excel file containing test cases to begin generating automated Cypress tests.
                    </p>
                    <Button 
                      onClick={() => setActiveTab('upload')}
                      className="mt-4"
                    >
                      Upload Test Cases
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold mb-2">Next Steps</h4>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center space-x-2">
                            <span className="text-green-500">✓</span>
                            <span>Test cases uploaded ({stats.testCasesCount} found)</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <span className="text-blue-500">→</span>
                            <span>Review and organize test cases</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <span className="text-blue-500">→</span>
                            <span>Generate Cypress automation code</span>
                          </li>
                          <li className="flex items-center space-x-2">
                            <span className="text-gray-400">○</span>
                            <span>Download and run tests</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold mb-2">Quick Actions</h4>
                        <div className="space-y-2">
                          <Button 
                            onClick={() => setActiveTab('test-cases')}
                            variant="outline" 
                            className="w-full justify-start"
                          >
                            📝 View Test Cases
                          </Button>
                          <Button 
                            onClick={() => setActiveTab('cypress-code')}
                            variant="outline" 
                            className="w-full justify-start"
                          >
                            🔧 Generate Cypress Code
                          </Button>
                          <Button 
                            onClick={() => setActiveTab('upload')}
                            variant="outline" 
                            className="w-full justify-start"
                          >
                            📁 Upload More Files
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">Upload Test Cases</h3>
                <p className="text-muted-foreground mb-4">
                  Upload your Excel or CSV file containing test cases to continue with automation.
                </p>
                
                <div className="flex justify-center">
                  <SimpleFileUpload
                    projectId={project.id}
                    onUploadSuccess={handleUploadSuccess}
                    onUploadError={handleUploadError}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Test Cases Tab */}
            <TabsContent value="test-cases" className="space-y-4">
              {stats.testCasesCount > 0 ? (
                <TestCasesList
                  projectId={project.id}
                  onGenerateCypress={handleGenerateCypress}
                />
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No test cases found. Please upload a file first.</p>
                  <Button 
                    onClick={() => setActiveTab('upload')}
                    className="mt-4"
                  >
                    Upload Test Cases
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Cypress Code Tab */}
            <TabsContent value="cypress-code" className="space-y-4">
              {stats.hasGeneratedCode ? (
                <CypressCodeDisplay
                  projectId={project.id}
                  onBack={() => setActiveTab('test-cases')}
                />
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Upload test cases first to generate Cypress code.</p>
                  <Button 
                    onClick={() => setActiveTab('upload')}
                    className="mt-4"
                  >
                    Upload Test Cases
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};