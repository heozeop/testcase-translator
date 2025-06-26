import React, { useState, useEffect } from 'react';
import { useWebSocketEvent, useWebSocket } from '../hooks/useWebSocket';
import { UserInputRequestPayload, InputFieldDefinition } from '../types/websocket';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface UserInputModalProps {
  onSubmit?: (requestId: string, inputs: { [fieldId: string]: any }) => void;
  onCancel?: (requestId: string) => void;
}

interface ActiveInputRequest extends UserInputRequestPayload {
  isVisible: boolean;
  timeoutRemaining?: number;
}

export const UserInputModal: React.FC<UserInputModalProps> = ({
  onSubmit,
  onCancel
}) => {
  const [activeRequest, setActiveRequest] = useState<ActiveInputRequest | null>(null);
  const [inputs, setInputs] = useState<{ [fieldId: string]: any }>({});
  const [errors, setErrors] = useState<{ [fieldId: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeoutRemaining, setTimeoutRemaining] = useState<number | null>(null);
  
  const webSocket = useWebSocket();

  // Listen for user input requests
  useWebSocketEvent('user-input-request', (request: UserInputRequestPayload) => {
    console.log('Received user input request:', request);
    
    // Initialize inputs with default values
    const initialInputs: { [fieldId: string]: any } = {};
    request.fields.forEach(field => {
      if (field.defaultValue !== undefined) {
        initialInputs[field.id] = field.defaultValue;
      } else {
        initialInputs[field.id] = field.type === 'checkbox' ? false : '';
      }
    });

    setInputs(initialInputs);
    setErrors({});
    setActiveRequest({
      ...request,
      isVisible: true
    });

    // Set up timeout countdown if specified
    if (request.timeout) {
      setTimeoutRemaining(request.timeout);
      const interval = setInterval(() => {
        setTimeoutRemaining(prev => {
          if (prev && prev <= 1) {
            clearInterval(interval);
            handleCancel(request.requestId);
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
    }
  }, []);

  // Listen for input request timeouts
  useWebSocketEvent('error', (error: any) => {
    if (error.code === 'INPUT_REQUEST_TIMEOUT' && activeRequest) {
      setActiveRequest(null);
      setTimeoutRemaining(null);
    }
  }, [activeRequest]);

  const validateInputs = (): boolean => {
    if (!activeRequest) return false;

    const newErrors: { [fieldId: string]: string } = {};

    activeRequest.fields.forEach(field => {
      const value = inputs[field.id];

      // Check required fields
      if (field.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
        newErrors[field.id] = `${field.label} is required`;
        return;
      }

      // Skip validation for empty optional fields
      if (!field.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
        return;
      }

      // Type-specific validation
      if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          newErrors[field.id] = 'Please enter a valid email address';
        }
      }

      if (field.type === 'number' && value !== '') {
        const numValue = Number(value);
        if (isNaN(numValue)) {
          newErrors[field.id] = 'Please enter a valid number';
        } else if (field.validation?.min !== undefined && numValue < field.validation.min) {
          newErrors[field.id] = `Value must be at least ${field.validation.min}`;
        } else if (field.validation?.max !== undefined && numValue > field.validation.max) {
          newErrors[field.id] = `Value must be at most ${field.validation.max}`;
        }
      }

      // String length validation
      if (typeof value === 'string' && field.validation) {
        if (field.validation.minLength && value.length < field.validation.minLength) {
          newErrors[field.id] = `Must be at least ${field.validation.minLength} characters`;
        }
        if (field.validation.maxLength && value.length > field.validation.maxLength) {
          newErrors[field.id] = `Must be at most ${field.validation.maxLength} characters`;
        }
        if (field.validation.pattern) {
          const regex = new RegExp(field.validation.pattern);
          if (!regex.test(value)) {
            newErrors[field.id] = 'Please enter a valid value';
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setInputs(prev => ({
      ...prev,
      [fieldId]: value
    }));

    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => ({
        ...prev,
        [fieldId]: ''
      }));
    }
  };

  const handleSubmit = async () => {
    if (!activeRequest || !validateInputs()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Send response through WebSocket
      const success = webSocket.respondToUserInputRequest(
        activeRequest.requestId,
        activeRequest.projectId,
        inputs
      );

      if (success) {
        onSubmit?.(activeRequest.requestId, inputs);
        setActiveRequest(null);
        setTimeoutRemaining(null);
      } else {
        throw new Error('Failed to send response');
      }
    } catch (error) {
      console.error('Failed to submit user input:', error);
      // Show error to user
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = (requestId: string) => {
    onCancel?.(requestId);
    setActiveRequest(null);
    setTimeoutRemaining(null);
    setTimeoutRemaining(null);
  };

  const renderField = (field: InputFieldDefinition) => {
    const value = inputs[field.id] || '';
    const error = errors[field.id];

    switch (field.type) {
      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <select
              id={field.id}
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required={field.required}
            >
              <option value="">Select an option</option>
              {field.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {field.helpText && (
              <p className="text-sm text-gray-600">{field.helpText}</p>
            )}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} className="space-y-2">
            <div className="flex items-center">
              <input
                id={field.id}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => handleInputChange(field.id, e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <Label htmlFor={field.id} className="ml-2">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
            </div>
            {field.helpText && (
              <p className="text-sm text-gray-600">{field.helpText}</p>
            )}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <textarea
              id={field.id}
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              rows={4}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required={field.required}
            />
            {field.helpText && (
              <p className="text-sm text-gray-600">{field.helpText}</p>
            )}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        );

      default:
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type={field.type}
              value={value}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              className={error ? "border-red-500" : ""}
            />
            {field.helpText && (
              <p className="text-sm text-gray-600">{field.helpText}</p>
            )}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>
        );
    }
  };

  if (!activeRequest?.isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {activeRequest.title}
              </h2>
              {activeRequest.description && (
                <p className="text-sm text-gray-600 mt-1">
                  {activeRequest.description}
                </p>
              )}
            </div>
            {timeoutRemaining && (
              <div className="text-sm text-orange-600 font-medium">
                {Math.floor(timeoutRemaining / 60)}:{(timeoutRemaining % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
            <div className="space-y-4">
              {activeRequest.fields.map(renderField)}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCancel(activeRequest.requestId)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};