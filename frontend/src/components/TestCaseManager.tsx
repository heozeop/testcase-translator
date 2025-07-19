import React, { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { TestCase } from '../types/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { MoreHorizontal, Plus, Search, Filter, Edit, Trash2, Copy } from 'lucide-react';

interface TestCaseManagerProps {
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

export const TestCaseManager: React.FC<TestCaseManagerProps> = ({ projectId }) => {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
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
        ...(priorityFilter && { priority: priorityFilter }),
        ...(categoryFilter && { category: categoryFilter }),
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
  }, [projectId, searchTerm, priorityFilter, categoryFilter, toast, pagination]);

  useEffect(() => {
    fetchTestCases();
  }, [fetchTestCases]);

  const handleSearch = () => {
    fetchTestCases(1);
  };

  const handleCreateTestCase = async () => {
    try {
      setSubmitting(true);
      
      // Parse steps and expected results
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

      setIsCreateDialogOpen(false);
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

  const handleEditTestCase = async () => {
    if (!editingTestCase) return;

    try {
      setSubmitting(true);
      
      // Parse steps and expected results
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

      await apiService.updateTestCase(editingTestCase.id, {
        name: formData.name,
        description: formData.description || undefined,
        priority: formData.priority,
        category: formData.category || undefined,
        steps,
        expectedResults,
      });

      toast({
        title: "Success",
        description: "Test case updated successfully",
      });

      setIsEditDialogOpen(false);
      setEditingTestCase(null);
      setFormData(initialFormData);
      fetchTestCases();
    } catch (error: any) {
      console.error('Error updating test case:', error);
      toast({
        title: "Error",
        description: "Failed to update test case",
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

  const handleDuplicateTestCase = async (testCase: TestCase) => {
    try {
      await apiService.duplicateTestCase(testCase.id, `${testCase.name} (Copy)`);
      toast({
        title: "Success",
        description: "Test case duplicated successfully",
      });
      fetchTestCases();
    } catch (error: any) {
      console.error('Error duplicating test case:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate test case",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (testCase: TestCase) => {
    setEditingTestCase(testCase);
    setFormData({
      name: testCase.name || '',
      description: testCase.description || '',
      priority: (testCase.priority as 'low' | 'medium' | 'high') || 'medium',
      category: testCase.category || '',
      steps: testCase.steps
        ? testCase.steps.map((step: any) => step.description || step.action).join('\n')
        : '',
      expectedResults: testCase.expectedResults
        ? testCase.expectedResults.map((result: any) => result.expected).join('\n')
        : '',
    });
    setIsEditDialogOpen(true);
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
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Test Case
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Test Case</DialogTitle>
              <DialogDescription>
                Add a new test case to your project
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
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
                  <Select value={formData.priority} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as 'low' | 'medium' | 'high' }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
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
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setFormData(initialFormData);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateTestCase}
                disabled={submitting || !formData.name}
              >
                {submitting ? 'Creating...' : 'Create Test Case'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
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
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} size="sm">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="priority-filter">Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="category-filter">Category</Label>
              <Input
                id="category-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                placeholder="Filter by category"
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Cases Table */}
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
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testCases.map((testCase) => (
                    <TableRow key={testCase.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{testCase.name}</div>
                          {testCase.description && (
                            <div className="text-sm text-muted-foreground">
                              {testCase.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`capitalize ${getPriorityColor(testCase.priority || 'medium')}`}>
                          {testCase.priority || 'medium'}
                        </span>
                      </TableCell>
                      <TableCell>{testCase.category || '-'}</TableCell>
                      <TableCell>
                        <span className="capitalize">{testCase.status || 'active'}</span>
                      </TableCell>
                      <TableCell>{formatDate(testCase.createdAt)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(testCase)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicateTestCase(testCase)}>
                              <Copy className="w-4 h-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteTestCase(testCase)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

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
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Test Case</DialogTitle>
            <DialogDescription>
              Update the test case details
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter test case name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter test case description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as 'low' | 'medium' | 'high' }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="e.g., authentication, navigation"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-steps">Steps (one per line)</Label>
              <textarea
                id="edit-steps"
                value={formData.steps}
                onChange={(e) => setFormData(prev => ({ ...prev, steps: e.target.value }))}
                placeholder="Enter test steps, one per line"
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-expectedResults">Expected Results (one per line)</Label>
              <textarea
                id="edit-expectedResults"
                value={formData.expectedResults}
                onChange={(e) => setFormData(prev => ({ ...prev, expectedResults: e.target.value }))}
                placeholder="Enter expected results, one per line"
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingTestCase(null);
                setFormData(initialFormData);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEditTestCase}
              disabled={submitting || !formData.name}
            >
              {submitting ? 'Updating...' : 'Update Test Case'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};