import React, { useState, useEffect } from 'react';
import { useWebSocketEvent } from '../hooks/useWebSocket';
import { NotificationPayload } from '../types/websocket';
import { Button } from './ui/button';

interface NotificationWithId extends NotificationPayload {
  timestamp: number;
  autoHideTimer?: NodeJS.Timeout;
}

interface NotificationSystemProps {
  maxNotifications?: number;
  defaultDuration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const NotificationSystem: React.FC<NotificationSystemProps> = ({
  maxNotifications = 5,
  defaultDuration = 5000,
  position = 'top-right'
}) => {
  const [notifications, setNotifications] = useState<NotificationWithId[]>([]);

  // Listen for WebSocket notifications
  useWebSocketEvent('notification', (notification: NotificationPayload) => {
    addNotification(notification);
  }, []);

  const addNotification = (notification: NotificationPayload) => {
    const notificationWithId: NotificationWithId = {
      ...notification,
      timestamp: Date.now()
    };

    setNotifications(prev => {
      const updated = [notificationWithId, ...prev];
      
      // Limit number of notifications
      if (updated.length > maxNotifications) {
        updated.splice(maxNotifications);
      }

      return updated;
    });

    // Set up auto-hide timer
    const duration = notification.duration || defaultDuration;
    if (duration > 0) {
      const timer = setTimeout(() => {
        removeNotification(notification.id);
      }, duration);

      notificationWithId.autoHideTimer = timer;
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id);
      if (notification?.autoHideTimer) {
        clearTimeout(notification.autoHideTimer);
      }
      return prev.filter(n => n.id !== id);
    });
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'top-4 right-4';
    }
  };

  const getNotificationClasses = (type: NotificationPayload['type']) => {
    const baseClasses = "mb-4 p-4 rounded-lg shadow-lg border-l-4 max-w-sm";
    
    switch (type) {
      case 'success':
        return `${baseClasses} bg-green-50 border-green-400 text-green-800`;
      case 'warning':
        return `${baseClasses} bg-yellow-50 border-yellow-400 text-yellow-800`;
      case 'error':
        return `${baseClasses} bg-red-50 border-red-400 text-red-800`;
      default:
        return `${baseClasses} bg-blue-50 border-blue-400 text-blue-800`;
    }
  };

  const getIcon = (type: NotificationPayload['type']) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={`fixed z-50 ${getPositionClasses()}`}>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`${getNotificationClasses(notification.type)} animate-in slide-in-from-right duration-300`}
        >
          <div className="flex items-start">
            <span className="text-lg mr-3 flex-shrink-0">
              {getIcon(notification.type)}
            </span>
            
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm">{notification.title}</h4>
              <p className="text-sm mt-1 break-words">{notification.message}</p>
              
              {notification.actions && notification.actions.length > 0 && (
                <div className="mt-3 flex space-x-2">
                  {notification.actions.map((action) => (
                    <Button
                      key={action.id}
                      size="sm"
                      variant={action.primary ? "default" : "outline"}
                      onClick={() => {
                        // Handle action click - this would typically send a WebSocket message
                        console.log('Notification action clicked:', action);
                        removeNotification(notification.id);
                      }}
                      className="text-xs"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={() => removeNotification(notification.id)}
              className="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <span className="sr-only">Close</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Hook for programmatically adding notifications
export const useNotifications = () => {
  const addNotification = (notification: {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
    projectId?: string;
    actions?: Array<{
      id: string;
      label: string;
      action: string;
      primary?: boolean;
    }>;
    data?: any;
  }) => {
    const notificationWithId: NotificationPayload = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...notification
    };

    // Dispatch custom event to trigger notification
    // This allows us to add notifications from anywhere in the app
    window.dispatchEvent(new CustomEvent('add-notification', { 
      detail: notificationWithId 
    }));
  };

  const addSuccessNotification = (title: string, message: string) => {
    addNotification({ title, message, type: 'success' });
  };

  const addErrorNotification = (title: string, message: string) => {
    addNotification({ title, message, type: 'error' });
  };

  const addWarningNotification = (title: string, message: string) => {
    addNotification({ title, message, type: 'warning' });
  };

  const addInfoNotification = (title: string, message: string) => {
    addNotification({ title, message, type: 'info' });
  };

  return {
    addNotification,
    addSuccessNotification,
    addErrorNotification,
    addWarningNotification,
    addInfoNotification
  };
};

// Enhanced NotificationSystem that also listens for custom events
export const EnhancedNotificationSystem: React.FC<NotificationSystemProps> = (props) => {
  const [notifications, setNotifications] = useState<NotificationWithId[]>([]);

  // Listen for WebSocket notifications
  useWebSocketEvent('notification', (notification: NotificationPayload) => {
    addNotification(notification);
  }, []);

  // Listen for custom notification events
  useEffect(() => {
    const handleCustomNotification = (event: CustomEvent) => {
      addNotification(event.detail);
    };

    window.addEventListener('add-notification', handleCustomNotification as EventListener);
    
    return () => {
      window.removeEventListener('add-notification', handleCustomNotification as EventListener);
    };
  }, []);

  const addNotification = (notification: NotificationPayload) => {
    const notificationWithId: NotificationWithId = {
      ...notification,
      timestamp: Date.now()
    };

    setNotifications(prev => {
      const updated = [notificationWithId, ...prev];
      
      if (updated.length > (props.maxNotifications || 5)) {
        updated.splice(props.maxNotifications || 5);
      }

      return updated;
    });

    const duration = notification.duration || props.defaultDuration || 5000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        removeNotification(notification.id);
      }, duration);

      notificationWithId.autoHideTimer = timer;
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id);
      if (notification?.autoHideTimer) {
        clearTimeout(notification.autoHideTimer);
      }
      return prev.filter(n => n.id !== id);
    });
  };

  const getPositionClasses = () => {
    switch (props.position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'top-4 right-4';
    }
  };

  const getNotificationClasses = (type: NotificationPayload['type']) => {
    const baseClasses = "mb-4 p-4 rounded-lg shadow-lg border-l-4 max-w-sm";
    
    switch (type) {
      case 'success':
        return `${baseClasses} bg-green-50 border-green-400 text-green-800`;
      case 'warning':
        return `${baseClasses} bg-yellow-50 border-yellow-400 text-yellow-800`;
      case 'error':
        return `${baseClasses} bg-red-50 border-red-400 text-red-800`;
      default:
        return `${baseClasses} bg-blue-50 border-blue-400 text-blue-800`;
    }
  };

  const getIcon = (type: NotificationPayload['type']) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={`fixed z-50 ${getPositionClasses()}`}>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`${getNotificationClasses(notification.type)} animate-in slide-in-from-right duration-300`}
        >
          <div className="flex items-start">
            <span className="text-lg mr-3 flex-shrink-0">
              {getIcon(notification.type)}
            </span>
            
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm">{notification.title}</h4>
              <p className="text-sm mt-1 break-words">{notification.message}</p>
              
              {notification.actions && notification.actions.length > 0 && (
                <div className="mt-3 flex space-x-2">
                  {notification.actions.map((action) => (
                    <Button
                      key={action.id}
                      size="sm"
                      variant={action.primary ? "default" : "outline"}
                      onClick={() => {
                        console.log('Notification action clicked:', action);
                        removeNotification(notification.id);
                      }}
                      className="text-xs"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={() => removeNotification(notification.id)}
              className="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              <span className="sr-only">Close</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};