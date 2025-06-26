import React from 'react';
import { ProcessingStatusComponent } from './ProcessingStatus';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

export const ProcessingDemo: React.FC = () => {
  const handleComplete = (status: any) => {
    console.log('Processing completed:', status);
  };

  const handleError = (error: string) => {
    console.error('Processing error:', error);
  };

  const handleCancel = () => {
    console.log('Processing cancelled');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Processing Status Demo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            This is a demo of the ProcessingStatus component with mock data.
            In a real application, this would connect to the backend API.
          </p>
          <p className="text-sm text-muted-foreground">
            The component shows simulated progress for AI processing of test cases.
          </p>
        </CardContent>
      </Card>

      <ProcessingStatusComponent
        projectId="demo-project-123"
        onComplete={handleComplete}
        onError={handleError}
        onCancel={handleCancel}
      />
    </div>
  );
};