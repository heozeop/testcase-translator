import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { TestCase } from '../types/api';

interface SimpleTestCaseManagerProps {
  projectId: string;
}

interface TestCaseFormData {
  name: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  steps: string;
  expectedResults: string;
}

const initialFormData: TestCaseFormData = {
  name: '',
  description: '',
  priority: 'medium',
  category: '',
  steps: '',
  expectedResults: '',
};

export const SimpleTestCaseManager: React.FC<SimpleTestCaseManagerProps> = ({ projectId }) => {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
  const [formData, setFormData] = useState<TestCaseFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });

  const { toast } = useToast();

  const fetchTestCases = useCallback(async (page: number = 1) => {
    try {
      setLoading(true);
      const params = {
        projectId,
        page,
        limit: 10,
        ...(searchTerm && { search: searchTerm }),
        orderBy: 'created_at',
        order: 'DESC' as const,
      };

      const response = await apiService.getTestCases(params);
      setTestCases(response.data || []);
      setPagination(response.pagination || pagination);
    } catch (error: any) {
      console.error('Error fetching test cases:', error);
      toast({
        title: "Error",
        description: "Failed to load test cases",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, searchTerm, toast, pagination]);

  useEffect(() => {
    fetchTestCases();
  }, [fetchTestCases]);

  const handleCreateTestCase = async () => {
    try {
      setSubmitting(true);
      
      const steps = formData.steps
        ? formData.steps.split('\n').map((step, index) => ({
            action: 'step',
            description: step.trim(),
            order: index + 1,
          })).filter(step => step.description)
        : undefined;

      const expectedResults = formData.expectedResults
        ? formData.expectedResults.split('\n').map((result, index) => ({
            type: 'assertion',
            expected: result.trim(),
            order: index + 1,
          })).filter(result => result.expected)
        : undefined;

      await apiService.createTestCase({
        projectId,
        name: formData.name,
        description: formData.description || undefined,
        priority: formData.priority,
        category: formData.category || undefined,
        steps,
        expectedResults,
      });

      toast({
        title: "Success",
        description: "Test case created successfully",
      });

      setShowCreateForm(false);
      setFormData(initialFormData);
      fetchTestCases();
    } catch (error: any) {
      console.error('Error creating test case:', error);
      toast({
        title: "Error",
        description: "Failed to create test case",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTestCase = async (testCase: TestCase) => {
    if (!confirm(`Are you sure you want to delete "${testCase.name}"?`)) {
      return;
    }

    try {
      await apiService.deleteTestCase(testCase.id);
      toast({
        title: "Success",
        description: "Test case deleted successfully",
      });
      fetchTestCases();
    } catch (error: any) {
      console.error('Error deleting test case:', error);
      toast({
        title: "Error",
        description: "Failed to delete test case",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Test Cases</h2>
          <p className="text-muted-foreground">
            Manage your test cases for this project
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : '+ Create Test Case'}
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="search">Search</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search test cases..."
                  onKeyDown={(e) => e.key === 'Enter' && fetchTestCases(1)}
                />
                <Button onClick={() => fetchTestCases(1)} size="sm">
                  Search
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Test Case</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter test case name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter test case description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as 'low' | 'medium' | 'high' }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., authentication, navigation"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="steps">Steps (one per line)</Label>
              <textarea
                id="steps"
                value={formData.steps}
                onChange={(e) => setFormData(prev => ({ ...prev, steps: e.target.value }))}
                placeholder="Enter test steps, one per line"
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expectedResults">Expected Results (one per line)</Label>
              <textarea
                id="expectedResults"
                value={formData.expectedResults}
                onChange={(e) => setFormData(prev => ({ ...prev, expectedResults: e.target.value }))}
                placeholder="Enter expected results, one per line"
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData(initialFormData);
                }}
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTestCase}
                disabled={submitting || !formData.name}
              >
                {submitting ? 'Creating...' : 'Create Test Case'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Cases List */}
      <Card>
        <CardHeader>
          <CardTitle>Test Cases ({pagination.total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading test cases...</div>
          ) : testCases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No test cases found. Create your first test case to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {testCases.map((testCase) => (
                <div key={testCase.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium">{testCase.name}</h3>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs capitalize ${getPriorityColor(testCase.priority || 'medium')}`}>
                        {testCase.priority || 'medium'}
                      </span>
                      <Button
                        onClick={() => handleDeleteTestCase(testCase)}
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {testCase.description && (
                    <p className="text-sm text-muted-foreground mb-2">{testCase.description}</p>
                  )}
                  {testCase.category && (
                    <p className="text-xs text-muted-foreground mb-2">Category: {testCase.category}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created: {formatDate(testCase.createdAt)}
                  </p>
                </div>
              ))}

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTestCases(pagination.page - 1)}
                    disabled={!pagination.hasPrev}
                  >
                    Previous
                  </Button>
                  <span className="py-2 px-3 text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchTestCases(pagination.page + 1)}
                    disabled={!pagination.hasNext}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};