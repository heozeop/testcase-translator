import React, { useState } from 'react';
import { URLInputForm } from './components/URLInputForm';
import { WebSocketFileUpload } from './components/WebSocketFileUpload';
import { SimpleFileUpload } from './components/SimpleFileUpload';
import { ProjectDashboard } from './components/ProjectDashboard';
import { WebSocketProcessingStatus } from './components/WebSocketProcessingStatus';
import { UserInputModal } from './components/UserInputModal';
import { EnhancedNotificationSystem } from './components/NotificationSystem';
import { WebSocketStatusBadge } from './components/WebSocketStatus';
import { Toaster } from './components/ui/toaster';
import { TestFileUpload } from './components/TestFileUpload';
import { TestCasesList } from './components/TestCasesList';
import { CypressCodeDisplay } from './components/CypressCodeDisplay';
import { ProjectDetail } from './components/ProjectDetail';
import { Project } from './types/api';

type ViewMode = 'dashboard' | 'create-project' | 'project-detail' | 'upload-files' | 'processing' | 'test-cases' | 'cypress-code';

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
    setCurrentView('project-detail');
  };

  const handleUploadSuccess = (testCases: any[]) => {
    console.log('Upload successful, test cases:', testCases);
    // Show test cases after successful upload
    setCurrentView('test-cases');
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

  const handleGenerateCypress = () => {
    setCurrentView('cypress-code');
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
              {/* <WebSocketStatusBadge /> */}
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

          {currentView === 'project-detail' && currentProject && (
            <ProjectDetail 
              project={currentProject}
              onBack={handleBackToDashboard}
            />
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
                <SimpleFileUpload
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
                {/* <WebSocketProcessingStatus
                  projectId={currentProject.id}
                  onComplete={handleProcessingComplete}
                  onError={handleProcessingError}
                  onCancel={handleProcessingCancel}
                  showConnectionStatus={true}
                /> */}
                <div className="text-center p-8">
                  <p className="text-lg mb-4">File uploaded successfully!</p>
                  <p className="text-muted-foreground mb-4">Your test cases have been processed.</p>
                  <button 
                    onClick={handleProcessingComplete}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentView === 'test-cases' && currentProject && (
            <div className="space-y-6">
              <TestCasesList 
                projectId={currentProject.id}
                onBack={handleBackToDashboard}
                onGenerateCypress={handleGenerateCypress}
              />
            </div>
          )}

          {currentView === 'cypress-code' && currentProject && (
            <div className="space-y-6">
              <CypressCodeDisplay 
                projectId={currentProject.id}
                onBack={() => setCurrentView('test-cases')}
              />
            </div>
          )}
        </main>
      </div>
      
      {/* WebSocket-based components for real-time features - temporarily disabled */}
      {/* <UserInputModal />
      <EnhancedNotificationSystem position="top-right" maxNotifications={5} /> */}
      <Toaster />
    </div>
  );
}

export default App;
