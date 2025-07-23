import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TestCase } from '../types/api';

// Local interface for display purposes
interface DisplayTestCase {
  id: string;
  scenarioName: string;
  description: string;
  steps: string[];
  expectedResult: string;
  priority: string;
  status: string;
  createdAt: string;
  originalFilename: string;
}

// Helper function to convert API TestCase to DisplayTestCase
const convertToDisplayTestCase = (apiTestCase: TestCase): DisplayTestCase => {
  return {
    id: apiTestCase.id,
    scenarioName: apiTestCase.scenarioName || 'Unnamed Test',
    description: apiTestCase.description || 'No description',
    steps: apiTestCase.steps || [],
    expectedResult: apiTestCase.expectedResult || 'No expected result specified',
    priority: apiTestCase.priority || 'medium',
    status: apiTestCase.status,
    createdAt: apiTestCase.createdAt,
    originalFilename: apiTestCase.originalFilename || 'Unknown'
  };
};

interface TestCasesListProps {
  projectId: string;
  onBack?: () => void;
  onGenerateCypress?: () => void;
}

export const TestCasesList: React.FC<TestCasesListProps> = ({ projectId, onBack, onGenerateCypress }) => {
  const [testCases, setTestCases] = useState<DisplayTestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  const [downloading, setDownloading] = useState(false);
  const [deletingTestCase, setDeletingTestCase] = useState<string | null>(null);
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchTestCases = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      const response = await apiService.getTestCases({
        projectId,
        page,
        limit: 10,
        orderBy: 'created_at',
        order: 'DESC'
      });
      
      console.log('📋 Raw API response:', response);
      console.log('📋 Raw test cases data:', response.data);
      
      // Convert API test cases to display format
      const displayTestCases = response.data.map(convertToDisplayTestCase);
      console.log('📋 Converted display test cases:', displayTestCases);
      
      setTestCases(displayTestCases);
      setPagination(response.pagination);
    } catch (error: any) {
      console.error('Error fetching test cases:', error);
      toast({
        title: "Error",
        description: "Failed to load test cases",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    fetchTestCases();
  }, [fetchTestCases]);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await apiService.downloadTestCases(projectId);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `test-cases-${projectId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Test cases downloaded successfully"
      });
    } catch (error: any) {
      console.error('Error downloading test cases:', error);
      toast({
        title: "Error", 
        description: "Failed to download test cases",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    fetchTestCases(newPage);
  };

  const handleDeleteTestCase = async (testCaseId: string, testCaseName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${testCaseName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingTestCase(testCaseId);
      await apiService.deleteTestCase(testCaseId);
      
      // Remove test case from local state
      setTestCases(prev => prev.filter(tc => tc.id !== testCaseId));
      
      // Update pagination total
      setPagination(prev => ({
        ...prev,
        total: prev.total - 1
      }));

      toast({
        title: "Test Case Deleted",
        description: `"${testCaseName}" has been deleted successfully.`
      });
    } catch (error: any) {
      console.error('Failed to delete test case:', error);
      toast({
        title: "Error",
        description: "Failed to delete test case. Please try again.",
        variant: "destructive"
      });
    } finally {
      setDeletingTestCase(null);
    }
  };

  const toggleTestCaseExpansion = (testCaseId: string) => {
    setExpandedTestCases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testCaseId)) {
        newSet.delete(testCaseId);
      } else {
        newSet.add(testCaseId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p>Loading test cases...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Test Cases</h2>
          <p className="text-muted-foreground">
            {pagination.total} test case{pagination.total !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="space-x-2">
          <Button
            onClick={handleDownload}
            disabled={downloading || testCases.length === 0}
            variant="outline"
          >
            {downloading ? 'Downloading...' : 'Download CSV'}
          </Button>
          {onGenerateCypress && (
            <Button
              onClick={onGenerateCypress}
              disabled={testCases.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Generate Cypress Code
            </Button>
          )}
          {onBack && (
            <Button onClick={onBack} variant="outline">
              Back
            </Button>
          )}
        </div>
      </div>

      {testCases.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No test cases found for this project.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {testCases.map((testCase) => {
            const isExpanded = expandedTestCases.has(testCase.id);
            return (
              <Card key={testCase.id}>
                <CardHeader 
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleTestCaseExpansion(testCase.id)}
                >
                  <CardTitle className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">{testCase.scenarioName}</span>
                      <svg 
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'transform rotate-90' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div className="flex space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        testCase.priority === 'high' 
                          ? 'bg-red-100 text-red-800' 
                          : testCase.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {testCase.priority}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        testCase.status === 'pending'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {testCase.status}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTestCase(testCase.id, testCase.scenarioName);
                        }}
                        disabled={deletingTestCase === testCase.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 h-6"
                      >
                        {deletingTestCase === testCase.id ? '...' : '×'}
                      </Button>
                    </div>
                  </CardTitle>
                  {!isExpanded && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {testCase.description || 'Click to expand details...'}
                    </p>
                  )}
                </CardHeader>
                
                {isExpanded && (
                  <CardContent>
                    {testCase.description && (
                      <div className="mb-4">
                        <h4 className="font-medium text-sm text-muted-foreground mb-1">Description</h4>
                        <p>{testCase.description}</p>
                      </div>
                    )}
                    
                    {testCase.steps && testCase.steps.length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">Steps</h4>
                        <ol className="list-decimal list-inside space-y-1">
                          {testCase.steps.map((step, index) => (
                            <li key={index} className="text-sm">{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    
                    {testCase.expectedResult && (
                      <div className="mb-4">
                        <h4 className="font-medium text-sm text-muted-foreground mb-1">Expected Result</h4>
                        <p className="text-sm">{testCase.expectedResult}</p>
                      </div>
                    )}
                    
                    <div className="text-xs text-muted-foreground border-t pt-3">
                      <p>Source: {testCase.originalFilename}</p>
                      <p>Created: {new Date(testCase.createdAt).toLocaleString()}</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center space-x-2">
          <Button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={!pagination.hasPrev}
            variant="outline"
            size="sm"
          >
            Previous
          </Button>
          <span className="px-4 py-2 text-sm">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={!pagination.hasNext}
            variant="outline"
            size="sm"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};