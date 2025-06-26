import React from 'react';
import { useWebSocketStatus } from '../hooks/useWebSocket';

interface WebSocketStatusProps {
  showDetails?: boolean;
  className?: string;
}

export const WebSocketStatus: React.FC<WebSocketStatusProps> = ({
  showDetails = false,
  className = ''
}) => {
  const { connectionState, statusText, statusColor, isConnected, isConnecting } = useWebSocketStatus();

  const getIndicatorClass = () => {
    const baseClass = "inline-block w-2 h-2 rounded-full mr-2";
    switch (statusColor) {
      case 'green':
        return `${baseClass} bg-green-500`;
      case 'yellow':
        return `${baseClass} bg-yellow-500 animate-pulse`;
      case 'red':
        return `${baseClass} bg-red-500`;
      default:
        return `${baseClass} bg-gray-400`;
    }
  };

  const getTextClass = () => {
    switch (statusColor) {
      case 'green':
        return 'text-green-700';
      case 'yellow':
        return 'text-yellow-700';
      case 'red':
        return 'text-red-700';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className={`flex items-center ${className}`}>
      <span className={getIndicatorClass()}></span>
      <span className={`text-sm font-medium ${getTextClass()}`}>
        {statusText}
      </span>
      
      {showDetails && (
        <div className="ml-2 text-xs text-gray-500">
          {connectionState.clientId && (
            <span className="mr-2">ID: {connectionState.clientId.slice(-6)}</span>
          )}
          {connectionState.projectId && (
            <span className="mr-2">Project: {connectionState.projectId}</span>
          )}
          {connectionState.lastPing && (
            <span>Last ping: {new Date(connectionState.lastPing).toLocaleTimeString()}</span>
          )}
        </div>
      )}
    </div>
  );
};

interface WebSocketStatusBadgeProps {
  className?: string;
}

export const WebSocketStatusBadge: React.FC<WebSocketStatusBadgeProps> = ({
  className = ''
}) => {
  const { isConnected, isConnecting } = useWebSocketStatus();

  if (isConnected) {
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ${className}`}>
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1"></span>
        Connected
      </span>
    );
  }

  if (isConnecting) {
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 ${className}`}>
        <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full mr-1 animate-pulse"></span>
        Connecting
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ${className}`}>
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-1"></span>
      Disconnected
    </span>
  );
};