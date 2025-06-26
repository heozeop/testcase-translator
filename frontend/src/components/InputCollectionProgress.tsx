import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { 
  CheckCircleIcon, 
  ClockIcon, 
  AlertTriangleIcon, 
  XCircleIcon,
  PauseIcon,
  PlayIcon
} from 'lucide-react';

interface InputCollectionProgressProps {
  session: {
    sessionId: string;
    status: 'started' | 'progress' | 'completed' | 'cancelled' | 'expired';
    progress: {
      total: number;
      completed: number;
      pending: number;
      percentage: number;
    };
    estimatedTimeRemaining?: number;
  };
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  showControls?: boolean;
}

export const InputCollectionProgress: React.FC<InputCollectionProgressProps> = ({
  session,
  onPause,
  onResume,
  onCancel,
  showControls = true
}) => {
  const getStatusIcon = () => {
    switch (session.status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'cancelled':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'expired':
        return <AlertTriangleIcon className="h-5 w-5 text-orange-500" />;
      case 'started':
      case 'progress':
      default:
        return <ClockIcon className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStatusText = () => {
    switch (session.status) {
      case 'started':
        return 'Input collection started';
      case 'progress':
        return 'Collecting inputs...';
      case 'completed':
        return 'Input collection completed';
      case 'cancelled':
        return 'Input collection cancelled';
      case 'expired':
        return 'Input collection expired';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = () => {
    switch (session.status) {
      case 'completed':
        return 'text-green-600';
      case 'cancelled':
        return 'text-red-600';
      case 'expired':
        return 'text-orange-600';
      case 'started':
      case 'progress':
      default:
        return 'text-blue-600';
    }
  };

  const formatTimeRemaining = (milliseconds: number): string => {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const isActive = session.status === 'started' || session.status === 'progress';
  const isCompleted = session.status === 'completed';
  const isCancelled = session.status === 'cancelled';
  const isExpired = session.status === 'expired';

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className={getStatusColor()}>
              {getStatusText()}
            </span>
          </div>
          
          {showControls && isActive && (
            <div className="flex gap-2">
              {onPause && (
                <Button variant="outline" size="sm" onClick={onPause}>
                  <PauseIcon className="h-4 w-4 mr-1" />
                  Pause
                </Button>
              )}
              {onCancel && (
                <Button variant="destructive" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          )}
          
          {showControls && session.status === 'paused' && onResume && (
            <Button variant="outline" size="sm" onClick={onResume}>
              <PlayIcon className="h-4 w-4 mr-1" />
              Resume
            </Button>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Progress: {session.progress.completed} of {session.progress.total} inputs
            </span>
            <span className="font-medium">
              {Math.round(session.progress.percentage)}%
            </span>
          </div>
          
          <Progress 
            value={session.progress.percentage} 
            className="w-full h-2"
          />
        </div>

        {/* Status Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {session.progress.completed}
            </div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {session.progress.pending}
            </div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">
              {session.progress.total}
            </div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          
          {session.estimatedTimeRemaining && isActive && (
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {formatTimeRemaining(session.estimatedTimeRemaining)}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {isCompleted && (
          <Alert>
            <CheckCircleIcon className="h-4 w-4" />
            <AlertDescription>
              All inputs have been successfully collected. The test execution can now proceed 
              with the provided data.
            </AlertDescription>
          </Alert>
        )}

        {isCancelled && (
          <Alert variant="destructive">
            <XCircleIcon className="h-4 w-4" />
            <AlertDescription>
              Input collection was cancelled. Test execution may be limited without the 
              required input data.
            </AlertDescription>
          </Alert>
        )}

        {isExpired && (
          <Alert variant="destructive">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertDescription>
              Input collection session has expired. You may need to restart the collection 
              process to provide the required inputs.
            </AlertDescription>
          </Alert>
        )}

        {isActive && session.progress.pending > 0 && (
          <Alert>
            <ClockIcon className="h-4 w-4" />
            <AlertDescription>
              Waiting for {session.progress.pending} more input{session.progress.pending > 1 ? 's' : ''}. 
              Please provide the requested information to continue test execution.
            </AlertDescription>
          </Alert>
        )}

        {/* Session Info */}
        <div className="pt-2 border-t">
          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <span>Session ID: {session.sessionId.slice(-8)}</span>
            <div className="flex gap-4">
              <Badge variant="outline" className="text-xs">
                {session.status.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};