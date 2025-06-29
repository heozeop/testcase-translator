import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { formatDate, truncateText } from '../utils/validation';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Project } from '../types/api';

interface ProjectDashboardProps {
  onCreateProject?: () => void;
  onSelectProject?: (project: Project) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  onCreateProject,
  onSelectProject
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const { toast } = useToast();

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.getProjects(1, 50); // Get first 50 projects
      setProjects(response.data || []);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
      setError('Failed to load projects. Please try again.');
      
      toast({
        title: "Error",
        description: "Failed to load projects. Please check your connection and try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingProject(projectId);
      await apiService.deleteProject(projectId);
      
      // Remove project from local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
      
      toast({
        title: "Project Deleted",
        description: `"${projectName}" has been deleted successfully.`
      });
    } catch (error: any) {
      console.error('Failed to delete project:', error);
      toast({
        title: "Error",
        description: "Failed to delete project. Please try again.",
        variant: "destructive"
      });
    } finally {
      setDeletingProject(null);
    }
  };

  const handleViewProject = (project: Project) => {
    if (onSelectProject) {
      onSelectProject(project);
    } else {
      // Default behavior - could navigate to project details page
      console.log('Viewing project:', project);
      toast({
        title: "Project Selected",
        description: `Selected project: ${project.name}`
      });
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2 text-muted-foreground">Loading projects...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="space-y-4">
              <div className="text-destructive">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <h3 className="text-lg font-semibold mb-2">Failed to Load Projects</h3>
                <p className="text-muted-foreground">{error}</p>
              </div>
              <Button onClick={loadProjects} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your test automation projects
          </p>
        </div>
        <Button onClick={onCreateProject}>
          Create New Project
        </Button>
      </div>

      {/* Projects List */}
      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="space-y-4">
              <div className="text-muted-foreground">
                <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h3 className="text-lg font-semibold mb-2">No Projects Yet</h3>
                <p className="text-muted-foreground">
                  Create your first project to start automating your test cases.
                </p>
              </div>
              <Button onClick={onCreateProject}>
                Create Your First Project
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {truncateText(project.name, 40)}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {truncateText(project.target_url, 60)}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Project Stats */}
                <div className="flex justify-between text-sm">
                  <div className="text-center">
                    <p className="font-semibold">{project.test_case_count || 0}</p>
                    <p className="text-muted-foreground">Test Cases</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">{project.generated_code_count || 0}</p>
                    <p className="text-muted-foreground">Scripts</p>
                  </div>
                </div>

                {/* Project Details */}
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Created: {formatDate(project.created_at)}</p>
                  {project.updated_at !== project.created_at && (
                    <p>Updated: {formatDate(project.updated_at)}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => handleViewProject(project)}
                    className="flex-1"
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteProject(project.id, project.name)}
                    disabled={deletingProject === project.id}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {deletingProject === project.id ? '...' : 'Delete'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center pt-4">
        <Button variant="outline" onClick={loadProjects}>
          Refresh Projects
        </Button>
      </div>
    </div>
  );
};