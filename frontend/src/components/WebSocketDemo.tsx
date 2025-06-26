import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useWebSocket } from '../hooks/useWebSocket';
import { useNotifications } from './NotificationSystem';
import { WebSocketStatus } from './WebSocketStatus';

export const WebSocketDemo: React.FC = () => {
  const [projectId, setProjectId] = useState('demo-project-123');
  const [testMessage, setTestMessage] = useState('Hello WebSocket!');
  
  const webSocket = useWebSocket({
    autoConnect: true,
    projectId
  });
  
  const notifications = useNotifications();

  const handleConnect = () => {
    webSocket.connect(projectId);
  };

  const handleDisconnect = () => {
    webSocket.disconnect();
  };

  const handleJoinProject = () => {
    webSocket.joinProject(projectId);
  };

  const handleRequestStatus = () => {
    webSocket.requestStatus(projectId, 'current');
  };

  const handleSendNotification = () => {
    notifications.addInfoNotification('Demo Notification', testMessage);
  };

  const handleSendError = () => {
    notifications.addErrorNotification('Demo Error', 'This is a test error message');
  };

  const handleSendSuccess = () => {
    notifications.addSuccessNotification('Demo Success', 'Operation completed successfully!');
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          WebSocket Integration Demo
          <WebSocketStatus showDetails={true} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Controls */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Connection Controls</h3>
          <div className="flex space-x-2">
            <Button 
              onClick={handleConnect} 
              disabled={webSocket.isConnected}
              variant="outline"
            >
              Connect
            </Button>
            <Button 
              onClick={handleDisconnect} 
              disabled={!webSocket.isConnected}
              variant="outline"
            >
              Disconnect
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="projectId">Project ID</Label>
              <Input
                id="projectId"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Enter project ID"
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleJoinProject} 
                disabled={!webSocket.isConnected}
                className="w-full"
              >
                Join Project
              </Button>
            </div>
          </div>
        </div>

        {/* Message Testing */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Message Testing</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="testMessage">Test Message</Label>
              <Input
                id="testMessage"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Enter test message"
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleRequestStatus} 
                disabled={!webSocket.isConnected}
                className="w-full"
                variant="outline"
              >
                Request Status
              </Button>
            </div>
          </div>
        </div>

        {/* Notification Testing */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Notification Testing</h3>
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={handleSendNotification} size="sm">
              Info Notification
            </Button>
            <Button onClick={handleSendSuccess} size="sm" variant="outline">
              Success Notification
            </Button>
            <Button onClick={handleSendError} size="sm" variant="destructive">
              Error Notification
            </Button>
          </div>
        </div>

        {/* Connection State Display */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Connection State</h3>
          <div className="p-4 bg-muted rounded-lg">
            <pre className="text-sm">
              {JSON.stringify(webSocket.connectionState, null, 2)}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};