import React, { useState } from 'react';
import { URLInputForm } from './components/URLInputForm';
import { FileUploadComponent } from './components/FileUploadComponent';
import { ProjectDashboard } from './components/ProjectDashboard';
import { Toaster } from './components/ui/toaster';

type ViewMode = 'dashboard' | 'create-project' | 'upload-files';

interface Project {
  id: string;
  name: string;
  target_url: string;
  description?: string;
  created_at: string;
  updated_at: string;
  test_case_count?: number;
  generated_code_count?: number;
}

function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const handleCreateProject = () => {
    setCurrentView('create-project');
  };

  const handleProjectCreated = (projectId: string) => {
    console.log('Project created with ID:', projectId);
    // For now, just go back to dashboard - in a real app we'd fetch the project details
    setCurrentView('dashboard');
  };

  const handleSelectProject = (project: Project) => {
    console.log('Selected project:', project);
    setCurrentProject(project);
    setCurrentView('upload-files');
  };

  const handleUploadSuccess = (testCases: any[]) => {
    console.log('Upload successful, test cases:', testCases);
    // Go back to dashboard after successful upload
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error);
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Testcase Translator
          </h1>
          <p className="text-muted-foreground">
            Convert Excel test cases into automated Cypress test scripts
          </p>
        </header>

        <main className="space-y-8">
          {currentView === 'dashboard' && (
            <ProjectDashboard
              onCreateProject={handleCreateProject}
              onSelectProject={handleSelectProject}
            />
          )}

          {currentView === 'create-project' && (
            <div className="space-y-6">
              <div className="text-center">
                <button
                  onClick={handleBackToDashboard}
                  className="text-sm text-primary hover:underline mb-4 inline-block"
                >
                  ← Back to Projects
                </button>
                <h2 className="text-2xl font-semibold mb-2">
                  Create New Project
                </h2>
                <p className="text-muted-foreground">
                  Set up a new test automation project
                </p>
              </div>
              
              <div className="flex justify-center">
                <URLInputForm onSuccess={handleProjectCreated} />
              </div>
            </div>
          )}

          {currentView === 'upload-files' && currentProject && (
            <div className="space-y-6">
              <div className="text-center">
                <button
                  onClick={handleBackToDashboard}
                  className="text-sm text-primary hover:underline mb-4 inline-block"
                >
                  ← Back to Projects
                </button>
                <h2 className="text-2xl font-semibold mb-2">
                  Upload Test Cases
                </h2>
                <p className="text-muted-foreground mb-2">
                  Project: <span className="font-medium">{currentProject.name}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Upload your Excel file containing test cases to continue
                </p>
              </div>
              
              <div className="flex justify-center">
                <FileUploadComponent
                  projectId={currentProject.id}
                  onUploadSuccess={handleUploadSuccess}
                  onUploadError={handleUploadError}
                />
              </div>
            </div>
          )}
        </main>
      </div>
      
      <Toaster />
    </div>
  );
}

export default App;
