import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { validateUrl, validateProjectName, debounce } from '../utils/validation';
import { apiService } from '../services/api';
import { useToast } from '../hooks/use-toast';

interface URLInputFormProps {
  onSuccess?: (projectId: string) => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export const URLInputForm: React.FC<URLInputFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    projectName: '',
    targetUrl: ''
  });
  const [validation, setValidation] = useState<{
    projectName: ValidationResult;
    targetUrl: ValidationResult;
  }>({
    projectName: { isValid: true, error: undefined },
    targetUrl: { isValid: true, error: undefined }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Debounced validation functions
  const debouncedValidateUrl = debounce((url: string) => {
    const result = validateUrl(url);
    setValidation(prev => ({
      ...prev,
      targetUrl: result
    }));
  }, 300);

  const debouncedValidateProjectName = debounce((name: string) => {
    const result = validateProjectName(name);
    setValidation(prev => ({
      ...prev,
      projectName: result
    }));
  }, 300);

  // Handle input changes with real-time validation
  const handleInputChange = (field: 'projectName' | 'targetUrl', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Trigger debounced validation
    if (field === 'targetUrl') {
      debouncedValidateUrl(value);
    } else if (field === 'projectName') {
      debouncedValidateProjectName(value);
    }
  };

  // Validate form before submission
  const validateForm = (): boolean => {
    const projectNameValidation = validateProjectName(formData.projectName);
    const urlValidation = validateUrl(formData.targetUrl);

    setValidation({
      projectName: projectNameValidation,
      targetUrl: urlValidation
    });

    return projectNameValidation.isValid && urlValidation.isValid;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form before submitting.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // First validate the URL with the backend
      const urlValidationResponse = await apiService.validateUrl({ url: formData.targetUrl });
      
      if (!urlValidationResponse.isValid) {
        const errorMessage = urlValidationResponse.accessibility?.error || 
                           urlValidationResponse.warnings?.[0] || 
                           "The URL could not be validated.";
        toast({
          title: "URL Validation Failed",
          description: errorMessage,
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Create the project
      const projectResponse = await apiService.createProject({
        name: formData.projectName,
        target_url: formData.targetUrl
      });

      toast({
        title: "Project Created",
        description: `Project "${formData.projectName}" has been created successfully.`
      });

      // Reset form
      setFormData({ projectName: '', targetUrl: '' });
      setValidation({
        projectName: { isValid: true, error: undefined },
        targetUrl: { isValid: true, error: undefined }
      });

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(projectResponse.id);
      }

    } catch (error: any) {
      console.error('Form submission error:', error);
      
      let errorMessage = 'An unexpected error occurred.';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = validation.projectName.isValid && 
                     validation.targetUrl.isValid && 
                     formData.projectName.trim() !== '' && 
                     formData.targetUrl.trim() !== '';

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Create New Project</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Name Field */}
          <div className="space-y-2">
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              type="text"
              placeholder="Enter project name"
              value={formData.projectName}
              onChange={(e) => handleInputChange('projectName', e.target.value)}
              className={`${
                !validation.projectName.isValid && formData.projectName 
                  ? 'border-destructive' 
                  : ''
              }`}
              disabled={isSubmitting}
            />
            {!validation.projectName.isValid && formData.projectName && (
              <p className="text-sm text-destructive">
                {validation.projectName.error}
              </p>
            )}
          </div>

          {/* Target URL Field */}
          <div className="space-y-2">
            <Label htmlFor="targetUrl">Target URL</Label>
            <Input
              id="targetUrl"
              type="url"
              placeholder="https://example.com"
              value={formData.targetUrl}
              onChange={(e) => handleInputChange('targetUrl', e.target.value)}
              className={`${
                !validation.targetUrl.isValid && formData.targetUrl 
                  ? 'border-destructive' 
                  : ''
              }`}
              disabled={isSubmitting}
            />
            {!validation.targetUrl.isValid && formData.targetUrl && (
              <p className="text-sm text-destructive">
                {validation.targetUrl.error}
              </p>
            )}
            {validation.targetUrl.isValid && formData.targetUrl && (
              <p className="text-sm text-muted-foreground">
                ✓ Valid URL format
              </p>
            )}
          </div>

          {/* Submit Button */}
          <Button 
            type="submit" 
            className="w-full" 
            disabled={!isFormValid || isSubmitting}
          >
            {isSubmitting ? 'Creating Project...' : 'Create Project'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};