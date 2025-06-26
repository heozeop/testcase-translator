import React, { useState } from 'react';
import { URLInputForm } from './components/URLInputForm';
import { WebSocketFileUpload } from './components/WebSocketFileUpload';
import { ProjectDashboard } from './components/ProjectDashboard';
import { WebSocketProcessingStatus } from './components/WebSocketProcessingStatus';
import { UserInputModal } from './components/UserInputModal';
import { EnhancedNotificationSystem } from './components/NotificationSystem';
import { WebSocketStatusBadge } from './components/WebSocketStatus';
import { Toaster } from './components/ui/toaster';

type ViewMode = 'dashboard' | 'create-project' | 'upload-files' | 'processing';

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
    // Show processing status after successful upload
    setCurrentView('processing');
  };

  const handleUploadError = (error: string) => {
    console.error('Upload error:', error);
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  const handleProcessingComplete = (status: any) => {
    console.log('Processing completed:', status);
    // Go back to dashboard after processing is complete
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  const handleProcessingError = (error: string) => {
    console.error('Processing error:', error);
  };

  const handleProcessingCancel = () => {
    setCurrentView('dashboard');
    setCurrentProject(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="container mx-auto">
        <header className="text-center mb-8">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1"></div>
            <div className="text-center">
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Testcase Translator
              </h1>
              <p className="text-muted-foreground">
                Convert Excel test cases into automated Cypress test scripts
              </p>
            </div>
            <div className="flex-1 flex justify-end">
              <WebSocketStatusBadge />
            </div>
          </div>
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
                <WebSocketFileUpload
                  projectId={currentProject.id}
                  onUploadSuccess={handleUploadSuccess}
                  onUploadError={handleUploadError}
                />
              </div>
            </div>
          )}

          {currentView === 'processing' && currentProject && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold mb-2">
                  Processing Test Cases
                </h2>
                <p className="text-muted-foreground mb-2">
                  Project: <span className="font-medium">{currentProject.name}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Please wait while we process your test cases
                </p>
              </div>
              
              <div className="flex justify-center">
                <WebSocketProcessingStatus
                  projectId={currentProject.id}
                  onComplete={handleProcessingComplete}
                  onError={handleProcessingError}
                  onCancel={handleProcessingCancel}
                  showConnectionStatus={true}
                />
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* WebSocket-based components for real-time features */}
      <UserInputModal />
      <EnhancedNotificationSystem position="top-right" maxNotifications={5} />
      <Toaster />
    </div>
  );
}

export default App;
