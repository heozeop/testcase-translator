import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { InfoIcon, AlertTriangleIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

interface InputRequest {
  id: string;
  type: string;
  prompt: string;
  description?: string;
  required: boolean;
  category: string;
  validationRules: ValidationRule[];
  options?: InputOption[];
  defaultValue?: any;
  metadata: InputMetadata;
  createdAt: number;
  expiresAt?: number;
}

interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message: string;
  errorCode?: string;
}

interface InputOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

interface InputMetadata {
  priority: 'high' | 'medium' | 'low';
  source: string;
  tags: string[];
  hints: string[];
  examples: string[];
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
}

interface InputCollectionSession {
  sessionId: string;
  status: 'started' | 'progress' | 'completed' | 'cancelled' | 'expired';
  progress: {
    total: number;
    completed: number;
    pending: number;
    percentage: number;
  };
  currentRequest?: InputRequest;
  estimatedTimeRemaining?: number;
}

interface InputCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: InputCollectionSession;
  onSubmitInput: (requestId: string, value: any) => void;
  onSkipInput: (requestId: string) => void;
  onCancelSession: (sessionId: string) => void;
}

export const InputCollectionModal: React.FC<InputCollectionModalProps> = ({
  isOpen,
  onClose,
  session,
  onSubmitInput,
  onSkipInput,
  onCancelSession
}) => {
  const [currentValue, setCurrentValue] = useState<any>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHints, setShowHints] = useState(false);

  useEffect(() => {
    if (session?.currentRequest) {
      setCurrentValue(session.currentRequest.defaultValue || '');
      setValidationErrors([]);
    }
  }, [session?.currentRequest]);

  const handleSubmit = async () => {
    if (!session?.currentRequest) return;

    setIsSubmitting(true);
    
    try {
      // Validate input locally first
      const errors = validateInput(session.currentRequest, currentValue);
      if (errors.length > 0) {
        setValidationErrors(errors);
        setIsSubmitting(false);
        return;
      }

      await onSubmitInput(session.currentRequest.id, currentValue);
      setCurrentValue('');
      setValidationErrors([]);
    } catch (error) {
      console.error('Error submitting input:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (!session?.currentRequest) return;
    onSkipInput(session.currentRequest.id);
    setCurrentValue('');
    setValidationErrors([]);
  };

  const handleCancel = () => {
    if (!session) return;
    onCancelSession(session.sessionId);
    onClose();
  };

  const validateInput = (request: InputRequest, value: any): string[] => {
    const errors: string[] = [];
    
    for (const rule of request.validationRules) {
      switch (rule.type) {
        case 'required':
          if (!value || (typeof value === 'string' && value.trim() === '')) {
            errors.push(rule.message);
          }
          break;
        case 'minLength':
          if (typeof value === 'string' && value.length < rule.value) {
            errors.push(rule.message);
          }
          break;
        case 'maxLength':
          if (typeof value === 'string' && value.length > rule.value) {
            errors.push(rule.message);
          }
          break;
        case 'pattern':
          if (typeof value === 'string' && !new RegExp(rule.value).test(value)) {
            errors.push(rule.message);
          }
          break;
      }
    }
    
    return errors;
  };

  const renderInputField = (request: InputRequest) => {
    const baseProps = {
      value: currentValue,
      onChange: (e: any) => setCurrentValue(e.target.value),
      disabled: isSubmitting,
      placeholder: request.metadata.examples[0] || request.prompt
    };

    switch (request.type) {
      case 'text':
      case 'email':
      case 'url':
        return (
          <Input
            {...baseProps}
            type={request.type}
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
          />
        );
      
      case 'password':
      case 'api-key':
        return (
          <Input
            {...baseProps}
            type="password"
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
          />
        );
      
      case 'number':
        return (
          <Input
            {...baseProps}
            type="number"
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
          />
        );
      
      case 'textarea':
        return (
          <Textarea
            {...baseProps}
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
            rows={4}
          />
        );
      
      case 'select':
        return (
          <Select 
            value={currentValue} 
            onValueChange={setCurrentValue}
            disabled={isSubmitting}
          >
            <SelectTrigger className={validationErrors.length > 0 ? 'border-red-500' : ''}>
              <SelectValue placeholder="Select an option..." />
            </SelectTrigger>
            <SelectContent>
              {request.options?.map((option) => (
                <SelectItem 
                  key={option.value} 
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                  {option.description && (
                    <span className="text-sm text-muted-foreground ml-2">
                      {option.description}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      
      case 'radio':
        return (
          <RadioGroup 
            value={currentValue} 
            onValueChange={setCurrentValue}
            disabled={isSubmitting}
          >
            {request.options?.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <RadioGroupItem value={option.value} id={option.value} />
                <Label htmlFor={option.value} className="text-sm">
                  {option.label}
                  {option.description && (
                    <span className="text-muted-foreground ml-2">
                      ({option.description})
                    </span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      
      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={currentValue}
              onCheckedChange={setCurrentValue}
              disabled={isSubmitting}
            />
            <Label className="text-sm">
              {request.prompt}
            </Label>
          </div>
        );
      
      case 'date':
        return (
          <Input
            {...baseProps}
            type="date"
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
          />
        );
      
      case 'time':
        return (
          <Input
            {...baseProps}
            type="time"
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
          />
        );
      
      case 'file':
        return (
          <Input
            type="file"
            onChange={(e) => setCurrentValue(e.target.files?.[0])}
            disabled={isSubmitting}
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
          />
        );
      
      default:
        return (
          <Input
            {...baseProps}
            className={validationErrors.length > 0 ? 'border-red-500' : ''}
          />
        );
    }
  };

  const formatTimeRemaining = (milliseconds: number): string => {
    const minutes = Math.ceil(milliseconds / 60000);
    if (minutes === 1) return '1 minute';
    return `${minutes} minutes`;
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertTriangleIcon className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <InfoIcon className="h-4 w-4 text-yellow-500" />;
      case 'low':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      default:
        return <InfoIcon className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      'authentication': 'bg-red-100 text-red-800',
      'form-data': 'bg-blue-100 text-blue-800',
      'api-parameter': 'bg-purple-100 text-purple-800',
      'configuration': 'bg-yellow-100 text-yellow-800',
      'test-data': 'bg-green-100 text-green-800',
      'file-upload': 'bg-orange-100 text-orange-800'
    };
    
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  if (!isOpen || !session) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Input Collection Required
              {session.currentRequest && getPriorityIcon(session.currentRequest.metadata.priority)}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress: {session.progress.completed} of {session.progress.total}</span>
              {session.estimatedTimeRemaining && (
                <span className="flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" />
                  {formatTimeRemaining(session.estimatedTimeRemaining)} remaining
                </span>
              )}
            </div>
            <Progress value={session.progress.percentage} className="w-full" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {session.currentRequest && (
            <>
              {/* Request Info */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className={getCategoryColor(session.currentRequest.category)}>
                    {session.currentRequest.category.replace('-', ' ')}
                  </Badge>
                  {session.currentRequest.required && (
                    <Badge variant="destructive">Required</Badge>
                  )}
                  <Badge variant="outline">
                    {session.currentRequest.metadata.priority} priority
                  </Badge>
                </div>

                <div>
                  <Label className="text-base font-medium">
                    {session.currentRequest.prompt}
                    {session.currentRequest.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {session.currentRequest.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.currentRequest.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Input Field */}
              <div className="space-y-2">
                {renderInputField(session.currentRequest)}
                
                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                  <Alert variant="destructive">
                    <XCircleIcon className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc list-inside">
                        {validationErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Hints and Examples */}
              {(session.currentRequest.metadata.hints.length > 0 || 
                session.currentRequest.metadata.examples.length > 0) && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHints(!showHints)}
                    className="p-0 h-auto text-sm text-muted-foreground hover:text-foreground"
                  >
                    {showHints ? 'Hide' : 'Show'} hints and examples
                  </Button>
                  
                  {showHints && (
                    <div className="bg-muted p-3 rounded-lg space-y-2 text-sm">
                      {session.currentRequest.metadata.hints.length > 0 && (
                        <div>
                          <p className="font-medium">Hints:</p>
                          <ul className="list-disc list-inside text-muted-foreground">
                            {session.currentRequest.metadata.hints.map((hint, index) => (
                              <li key={index}>{hint}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {session.currentRequest.metadata.examples.length > 0 && (
                        <div>
                          <p className="font-medium">Examples:</p>
                          <div className="flex flex-wrap gap-1">
                            {session.currentRequest.metadata.examples.map((example, index) => (
                              <code
                                key={index}
                                className="bg-background px-2 py-1 rounded text-xs cursor-pointer hover:bg-accent"
                                onClick={() => setCurrentValue(example)}
                              >
                                {example}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Security Notice */}
              {session.currentRequest.metadata.securityLevel === 'confidential' || 
               session.currentRequest.metadata.securityLevel === 'restricted' && (
                <Alert>
                  <InfoIcon className="h-4 w-4" />
                  <AlertDescription>
                    This information will be encrypted and stored securely. 
                    It will only be used for test execution and will not be shared.
                  </AlertDescription>
                </Alert>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between gap-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSubmitting}
                  >
                    Cancel Session
                  </Button>
                  
                  {!session.currentRequest.required && (
                    <Button
                      variant="ghost"
                      onClick={handleSkip}
                      disabled={isSubmitting}
                    >
                      Skip This Input
                    </Button>
                  )}
                </div>
                
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || (!currentValue && session.currentRequest.required)}
                  className="min-w-[100px]"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
              </div>
            </>
          )}

          {/* Session Status */}
          {session.status === 'completed' && (
            <Alert>
              <CheckCircleIcon className="h-4 w-4" />
              <AlertDescription>
                Input collection completed successfully! All required information has been gathered.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};