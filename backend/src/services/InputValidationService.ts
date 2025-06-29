import { ValidationRule, InputRequest } from './InputCollectionService';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  suggestions: string[];
  confidence: number; // 0-1 score of validation confidence
}

export interface ValidationError {
  rule: string;
  message: string;
  field?: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface CustomValidator {
  name: string;
  description: string;
  validate: (value: any, context?: any) => Promise<ValidationResult>;
  applicableTypes: string[];
  priority: number;
}

export interface ValidationContext {
  requestId: string;
  sessionId: string;
  testCaseId?: string;
  relatedInputs?: Record<string, any>;
  pageContext?: {
    url: string;
    title: string;
    formSelector?: string;
  };
}

export interface CrossFieldValidation {
  name: string;
  description: string;
  dependentFields: string[];
  validate: (values: Record<string, any>) => ValidationResult;
}

export class InputValidationService {
  private customValidators: Map<string, CustomValidator> = new Map();
  private crossFieldValidations: CrossFieldValidation[] = [];

  constructor() {
    this.initializeBuiltInValidators();
  }

  async validateInput(
    request: InputRequest,
    value: any,
    context?: ValidationContext
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      confidence: 1.0
    };

    // Run built-in validation rules
    for (const rule of request.validationRules) {
      const ruleResult = await this.validateRule(rule, value, request.type);
      this.mergeValidationResults(result, ruleResult);
    }

    // Run type-specific validators
    const typeValidators = this.getValidatorsForType(request.type);
    for (const validator of typeValidators) {
      try {
        const validatorResult = await validator.validate(value, context);
        this.mergeValidationResults(result, validatorResult);
      } catch (error) {
        result.warnings.push(`Validator ${validator.name} failed: ${error}`);
      }
    }

    // Run category-specific validation
    const categoryResult = await this.validateByCategory(request.category, value, context);
    this.mergeValidationResults(result, categoryResult);

    // Security level validation
    const securityResult = await this.validateSecurity(
      request.metadata.securityLevel,
      value,
      request.type
    );
    this.mergeValidationResults(result, securityResult);

    // Context-aware validation
    if (context) {
      const contextResult = await this.validateWithContext(request, value, context);
      this.mergeValidationResults(result, contextResult);
    }

    // Calculate final confidence score
    result.confidence = this.calculateConfidence(result);
    result.isValid = result.errors.filter(e => e.severity === 'error').length === 0;

    return result;
  }

  async validateMultipleInputs(
    requests: InputRequest[],
    values: Record<string, any>,
    context?: ValidationContext
  ): Promise<Record<string, ValidationResult>> {
    const results: Record<string, ValidationResult> = {};

    // Validate each input individually
    for (const request of requests) {
      const value = values[request.id];
      if (value !== undefined) {
        results[request.id] = await this.validateInput(request, value, context);
      }
    }

    // Run cross-field validations
    for (const crossValidation of this.crossFieldValidations) {
      const dependentValues: Record<string, any> = {};
      let hasAllDependencies = true;

      for (const fieldId of crossValidation.dependentFields) {
        if (values[fieldId] !== undefined) {
          dependentValues[fieldId] = values[fieldId];
        } else {
          hasAllDependencies = false;
          break;
        }
      }

      if (hasAllDependencies) {
        const crossResult = crossValidation.validate(dependentValues);
        
        // Apply cross-validation errors to all dependent fields
        for (const fieldId of crossValidation.dependentFields) {
          if (results[fieldId]) {
            this.mergeValidationResults(results[fieldId], crossResult);
          }
        }
      }
    }

    return results;
  }

  private async validateRule(
    rule: ValidationRule,
    value: any,
    inputType: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      confidence: 1.0
    };

    switch (rule.type) {
      case 'required':
        if (this.isEmpty(value)) {
          result.errors.push({
            rule: 'required',
            message: rule.message,
            code: 'REQUIRED_FIELD',
            severity: 'error',
            suggestion: 'This field must be filled out'
          });
        }
        break;

      case 'minLength':
        if (typeof value === 'string' && value.length < rule.value) {
          result.errors.push({
            rule: 'minLength',
            message: rule.message,
            code: 'MIN_LENGTH',
            severity: 'error',
            suggestion: `Enter at least ${rule.value} characters`
          });
        }
        break;

      case 'maxLength':
        if (typeof value === 'string' && value.length > rule.value) {
          result.errors.push({
            rule: 'maxLength',
            message: rule.message,
            code: 'MAX_LENGTH',
            severity: 'error',
            suggestion: `Enter no more than ${rule.value} characters`
          });
        }
        break;

      case 'pattern':
        if (typeof value === 'string' && !new RegExp(rule.value).test(value)) {
          result.errors.push({
            rule: 'pattern',
            message: rule.message,
            code: 'PATTERN_MISMATCH',
            severity: 'error',
            suggestion: this.getPatternSuggestion(rule.value, inputType)
          });
        }
        break;

      case 'custom':
        // Custom validation would be handled by registered validators
        break;
    }

    return result;
  }

  private async validateByCategory(
    category: string,
    value: any,
    context?: ValidationContext
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      confidence: 1.0
    };

    switch (category) {
      case 'authentication':
        await this.validateAuthenticationInput(value, result);
        break;

      case 'api-parameter':
        await this.validateApiParameter(value, result);
        break;

      case 'form-data':
        await this.validateFormData(value, result, context);
        break;

      case 'file-upload':
        await this.validateFileUpload(value, result);
        break;

      case 'configuration':
        await this.validateConfiguration(value, result);
        break;
    }

    return result;
  }

  private async validateSecurity(
    securityLevel: string,
    value: any,
    inputType: string
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      confidence: 1.0
    };

    // Check for common security issues
    if (typeof value === 'string') {
      // SQL injection patterns
      if (this.containsSqlInjection(value)) {
        result.errors.push({
          rule: 'security',
          message: 'Input contains potentially harmful SQL patterns',
          code: 'SQL_INJECTION',
          severity: 'error',
          suggestion: 'Remove SQL keywords and special characters'
        });
      }

      // XSS patterns
      if (this.containsXss(value)) {
        result.errors.push({
          rule: 'security',
          message: 'Input contains potentially harmful script patterns',
          code: 'XSS_DETECTED',
          severity: 'error',
          suggestion: 'Remove HTML tags and script elements'
        });
      }

      // Check for exposed secrets
      if (this.containsSecret(value)) {
        result.warnings.push('Input appears to contain sensitive information');
        result.suggestions.push('Consider using environment variables or secure storage');
      }
    }

    // Security level specific validation
    switch (securityLevel) {
      case 'restricted':
        if (inputType === 'password' && !this.isStrongPassword(value)) {
          result.errors.push({
            rule: 'security',
            message: 'Password does not meet security requirements',
            code: 'WEAK_PASSWORD',
            severity: 'error',
            suggestion: 'Use a password with at least 12 characters, including uppercase, lowercase, numbers, and symbols'
          });
        }
        break;

      case 'confidential':
        if (typeof value === 'string' && value.length < 8) {
          result.warnings.push('Short inputs may not be secure for confidential data');
        }
        break;
    }

    return result;
  }

  private async validateWithContext(
    request: InputRequest,
    value: any,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      confidence: 1.0
    };

    // URL context validation
    if (context.pageContext?.url) {
      const domain = this.extractDomain(context.pageContext.url);
      
      // Email domain validation for login forms
      if (request.type === 'email' && request.category === 'authentication') {
        if (typeof value === 'string' && value.includes('@')) {
          const emailDomain = value.split('@')[1];
          if (this.isCommonEmailProvider(emailDomain) && this.isBusinessDomain(domain)) {
            result.warnings.push('Using personal email for business application');
            result.suggestions.push(`Consider using an email with domain ${domain}`);
          }
        }
      }
    }

    // Related inputs validation
    if (context.relatedInputs) {
      // Password confirmation
      if (request.type === 'password' && request.id.includes('confirm')) {
        const originalPassword = Object.entries(context.relatedInputs).find(
          ([key, _]) => key.includes('password') && !key.includes('confirm')
        )?.[1];
        
        if (originalPassword && originalPassword !== value) {
          result.errors.push({
            rule: 'confirmation',
            message: 'Passwords do not match',
            code: 'PASSWORD_MISMATCH',
            severity: 'error',
            suggestion: 'Enter the same password in both fields'
          });
        }
      }
    }

    return result;
  }

  private async validateAuthenticationInput(
    value: any,
    result: ValidationResult
  ): Promise<void> {
    if (typeof value !== 'string') return;

    // Common username/email patterns
    if (value.includes('@')) {
      // Email validation
      if (!this.isValidEmail(value)) {
        result.errors.push({
          rule: 'authentication',
          message: 'Invalid email format',
          code: 'INVALID_EMAIL',
          severity: 'error',
          suggestion: 'Enter a valid email address'
        });
      }
    } else {
      // Username validation
      if (value.length < 3) {
        result.errors.push({
          rule: 'authentication',
          message: 'Username too short',
          code: 'USERNAME_TOO_SHORT',
          severity: 'error',
          suggestion: 'Username must be at least 3 characters'
        });
      }

      if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
        result.errors.push({
          rule: 'authentication',
          message: 'Username contains invalid characters',
          code: 'INVALID_USERNAME_CHARS',
          severity: 'error',
          suggestion: 'Use only letters, numbers, dots, hyphens, and underscores'
        });
      }
    }
  }

  private async validateApiParameter(
    value: any,
    result: ValidationResult
  ): Promise<void> {
    if (typeof value !== 'string') return;

    // API key format validation
    if (value.startsWith('sk-') || value.startsWith('pk-')) {
      if (value.length < 20) {
        result.warnings.push('API key appears to be too short');
      }
    }

    // Bearer token validation
    if (value.startsWith('Bearer ')) {
      const token = value.substring(7);
      if (token.length < 10) {
        result.warnings.push('Bearer token appears to be too short');
      }
    }
  }

  private async validateFormData(
    value: any,
    result: ValidationResult,
    _context?: ValidationContext
  ): Promise<void> {
    // Generic form data validation
    if (typeof value === 'string') {
      // Check for reasonable length
      if (value.length > 1000) {
        result.warnings.push('Input is very long - consider breaking into smaller fields');
      }

      // Check for unusual characters
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
        result.warnings.push('Input contains unusual control characters');
      }
    }
  }

  private async validateFileUpload(
    value: any,
    result: ValidationResult
  ): Promise<void> {
    if (!(value instanceof File)) {
      result.errors.push({
        rule: 'file',
        message: 'Expected a file upload',
        code: 'INVALID_FILE',
        severity: 'error'
      });
      return;
    }

    // File size validation (10MB limit)
    if (value.size > 10 * 1024 * 1024) {
      result.errors.push({
        rule: 'file',
        message: 'File is too large',
        code: 'FILE_TOO_LARGE',
        severity: 'error',
        suggestion: 'Upload a file smaller than 10MB'
      });
    }

    // File type validation
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'text/csv',
      'application/json',
      'text/plain'
    ];

    if (!allowedTypes.includes(value.type)) {
      result.errors.push({
        rule: 'file',
        message: 'File type not supported',
        code: 'INVALID_FILE_TYPE',
        severity: 'error',
        suggestion: 'Upload an Excel (.xlsx, .xls), CSV, JSON, or text file'
      });
    }
  }

  private async validateConfiguration(
    value: any,
    result: ValidationResult
  ): Promise<void> {
    if (typeof value === 'string') {
      // URL validation for configuration
      if (value.startsWith('http://') || value.startsWith('https://')) {
        try {
          new URL(value);
        } catch {
          result.errors.push({
            rule: 'configuration',
            message: 'Invalid URL format',
            code: 'INVALID_URL',
            severity: 'error',
            suggestion: 'Enter a valid URL starting with http:// or https://'
          });
        }
      }

      // JSON validation for configuration
      if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
        try {
          JSON.parse(value);
        } catch {
          result.errors.push({
            rule: 'configuration',
            message: 'Invalid JSON format',
            code: 'INVALID_JSON',
            severity: 'error',
            suggestion: 'Check JSON syntax and fix any errors'
          });
        }
      }
    }
  }

  // Utility methods for validation
  private isEmpty(value: any): boolean {
    return value === null || 
           value === undefined || 
           (typeof value === 'string' && value.trim() === '') ||
           (Array.isArray(value) && value.length === 0);
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private containsSqlInjection(value: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|\*\/|\/\*)/,
      /(\b(OR|AND)\b.*=.*)/i,
      /'.*OR.*'/i,
      /;\s*(DROP|DELETE|INSERT|UPDATE)/i
    ];
    
    return sqlPatterns.some(pattern => pattern.test(value));
  }

  private containsXss(value: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe\b/i,
      /<object\b/i,
      /<embed\b/i
    ];
    
    return xssPatterns.some(pattern => pattern.test(value));
  }

  private containsSecret(value: string): boolean {
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,  // API keys
      /pk-[a-zA-Z0-9]{20,}/,  // Public keys
      /[A-Za-z0-9]{32,}/,     // Long hex strings
      /password/i,
      /secret/i,
      /token/i,
      /key/i
    ];
    
    return secretPatterns.some(pattern => pattern.test(value));
  }

  private isStrongPassword(password: string): boolean {
    return password.length >= 12 &&
           /[a-z]/.test(password) &&
           /[A-Z]/.test(password) &&
           /[0-9]/.test(password) &&
           /[^a-zA-Z0-9]/.test(password);
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private isCommonEmailProvider(domain: string): boolean {
    const commonProviders = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'protonmail.com'
    ];
    return commonProviders.includes(domain.toLowerCase());
  }

  private isBusinessDomain(domain: string): boolean {
    const businessTlds = ['.com', '.org', '.net', '.co', '.io'];
    return businessTlds.some(tld => domain.endsWith(tld)) && 
           !this.isCommonEmailProvider(domain);
  }

  private getPatternSuggestion(_pattern: string, inputType: string): string {
    if (inputType === 'email') {
      return 'Enter a valid email address (e.g., user@example.com)';
    }
    if (inputType === 'url') {
      return 'Enter a valid URL (e.g., https://example.com)';
    }
    if (inputType === 'phone') {
      return 'Enter a valid phone number (e.g., +1-555-123-4567)';
    }
    return 'Enter a value that matches the required format';
  }

  private getValidatorsForType(inputType: string): CustomValidator[] {
    return Array.from(this.customValidators.values())
      .filter(validator => validator.applicableTypes.includes(inputType))
      .sort((a, b) => b.priority - a.priority);
  }

  private mergeValidationResults(target: ValidationResult, source: ValidationResult): void {
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
    target.suggestions.push(...source.suggestions);
    target.confidence = Math.min(target.confidence, source.confidence);
  }

  private calculateConfidence(result: ValidationResult): number {
    let confidence = 1.0;
    
    // Reduce confidence for each error
    confidence -= result.errors.length * 0.2;
    
    // Reduce confidence for warnings
    confidence -= result.warnings.length * 0.1;
    
    // Ensure confidence stays between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  private initializeBuiltInValidators(): void {
    // Email validator
    this.customValidators.set('email', {
      name: 'Email Validator',
      description: 'Validates email addresses with advanced rules',
      applicableTypes: ['email'],
      priority: 10,
      validate: async (value: any) => {
        const result: ValidationResult = {
          isValid: true,
          errors: [],
          warnings: [],
          suggestions: [],
          confidence: 1.0
        };

        if (typeof value === 'string') {
          if (!this.isValidEmail(value)) {
            result.errors.push({
              rule: 'email',
              message: 'Invalid email format',
              code: 'INVALID_EMAIL_FORMAT',
              severity: 'error',
              suggestion: 'Enter a valid email address'
            });
          }

          // Check for disposable email domains
          const domain = value.split('@')[1];
          if (this.isDisposableEmailDomain(domain)) {
            result.warnings.push('Email appears to be from a disposable email service');
            result.suggestions.push('Consider using a permanent email address');
          }
        }

        return result;
      }
    });

    // Phone number validator
    this.customValidators.set('phone', {
      name: 'Phone Number Validator',
      description: 'Validates phone numbers in various formats',
      applicableTypes: ['text', 'phone'],
      priority: 8,
      validate: async (value: any) => {
        const result: ValidationResult = {
          isValid: true,
          errors: [],
          warnings: [],
          suggestions: [],
          confidence: 1.0
        };

        if (typeof value === 'string') {
          const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
          const cleanPhone = value.replace(/[\s\-\(\)\.]/g, '');
          
          if (!phoneRegex.test(cleanPhone)) {
            result.errors.push({
              rule: 'phone',
              message: 'Invalid phone number format',
              code: 'INVALID_PHONE',
              severity: 'error',
              suggestion: 'Enter a valid phone number (e.g., +1-555-123-4567)'
            });
          }
        }

        return result;
      }
    });
  }

  private isDisposableEmailDomain(domain: string): boolean {
    const disposableDomains = [
      '10minutemail.com', 'mailinator.com', 'guerrillamail.com',
      'temp-mail.org', 'yopmail.com'
    ];
    return disposableDomains.includes(domain.toLowerCase());
  }

  // Public API methods
  registerCustomValidator(validator: CustomValidator): void {
    this.customValidators.set(validator.name, validator);
  }

  removeCustomValidator(name: string): boolean {
    return this.customValidators.delete(name);
  }

  addCrossFieldValidation(validation: CrossFieldValidation): void {
    this.crossFieldValidations.push(validation);
  }

  getValidationSummary(results: Record<string, ValidationResult>): {
    totalFields: number;
    validFields: number;
    fieldsWithErrors: number;
    fieldsWithWarnings: number;
    overallValid: boolean;
    confidence: number;
  } {
    const totalFields = Object.keys(results).length;
    const validFields = Object.values(results).filter(r => r.isValid).length;
    const fieldsWithErrors = Object.values(results).filter(r => 
      r.errors.some(e => e.severity === 'error')
    ).length;
    const fieldsWithWarnings = Object.values(results).filter(r => 
      r.warnings.length > 0
    ).length;
    
    const overallValid = fieldsWithErrors === 0;
    const confidence = Object.values(results).reduce((sum, r) => sum + r.confidence, 0) / totalFields;

    return {
      totalFields,
      validFields,
      fieldsWithErrors,
      fieldsWithWarnings,
      overallValid,
      confidence
    };
  }
}