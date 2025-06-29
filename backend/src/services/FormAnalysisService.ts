import { FormInfo, ElementInfo } from './PuppeteerService';

export interface FormAnalysisResult {
  formId: string;
  formInfo: FormInfo;
  formType: FormType;
  complexity: FormComplexity;
  fieldAnalysis: FieldAnalysis[];
  validationRules: ValidationRule[];
  interactionFlow: InteractionStep[];
  testStrategies: TestStrategy[];
  errors: string[];
}

export type FormType = 
  | 'login' 
  | 'registration' 
  | 'contact' 
  | 'search' 
  | 'payment' 
  | 'profile' 
  | 'feedback' 
  | 'newsletter' 
  | 'filter' 
  | 'generic';

export type FormComplexity = 
  | 'simple'     // 1-3 fields
  | 'medium'     // 4-8 fields
  | 'complex'    // 9+ fields or complex interactions
  | 'wizard';    // multi-step form

export interface FieldAnalysis {
  field: ElementInfo;
  fieldType: FieldType;
  isRequired: boolean;
  hasValidation: boolean;
  validationHints: string[];
  placeholderText?: string;
  labelText?: string;
  helpText?: string;
  constraints: FieldConstraints;
  testData: TestDataSuggestion[];
}

export type FieldType = 
  | 'text'
  | 'email'
  | 'password'
  | 'phone'
  | 'number'
  | 'date'
  | 'url'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'file'
  | 'hidden'
  | 'unknown';

export interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  step?: number;
  required: boolean;
  readonly: boolean;
  disabled: boolean;
}

export interface ValidationRule {
  field: string;
  rule: string;
  message?: string;
  trigger: 'blur' | 'change' | 'submit';
  pattern?: string;
}

export interface InteractionStep {
  stepNumber: number;
  description: string;
  action: 'fill' | 'select' | 'check' | 'uncheck' | 'click' | 'clear';
  target: string;
  value?: string;
  waitCondition?: string;
  dependencies: string[];
}

export interface TestStrategy {
  category: 'positive' | 'negative' | 'boundary' | 'usability';
  description: string;
  steps: string[];
  expectedResult: string;
  priority: 'high' | 'medium' | 'low';
}

export interface TestDataSuggestion {
  category: 'valid' | 'invalid' | 'boundary' | 'special';
  value: string;
  description: string;
  expectation: 'accept' | 'reject' | 'warning';
}

export class FormAnalysisService {
  private formPatterns: Map<FormType, RegExp[]> = new Map([
    ['login', [
      /login|signin|sign.in|auth/i,
      /username|email|password/i
    ]],
    ['registration', [
      /register|signup|sign.up|create.account/i,
      /confirm.password|terms|agree/i
    ]],
    ['contact', [
      /contact|message|inquiry/i,
      /name|email|subject|message/i
    ]],
    ['search', [
      /search|find|query/i,
      /keywords|terms/i
    ]],
    ['payment', [
      /payment|checkout|billing/i,
      /card|credit|cvv|expiry/i
    ]],
    ['profile', [
      /profile|account|settings/i,
      /name|bio|avatar/i
    ]],
    ['feedback', [
      /feedback|review|rating|comment/i,
      /rating|stars|comment/i
    ]],
    ['newsletter', [
      /newsletter|subscribe|email/i,
      /unsubscribe|frequency/i
    ]],
    ['filter', [
      /filter|sort|category/i,
      /price|date|type|status/i
    ]]
  ]);

  async analyzeForm(formInfo: FormInfo): Promise<FormAnalysisResult> {
    const formId = this.generateFormId(formInfo);
    const errors: string[] = [];

    try {
      // Analyze form type
      const formType = this.determineFormType(formInfo);
      
      // Assess complexity
      const complexity = this.assessComplexity(formInfo);
      
      // Analyze individual fields
      const fieldAnalysis = await this.analyzeFields(formInfo.fields);
      
      // Extract validation rules
      const validationRules = this.extractValidationRules(formInfo, fieldAnalysis);
      
      // Generate interaction flow
      const interactionFlow = this.generateInteractionFlow(formInfo, fieldAnalysis);
      
      // Create test strategies
      const testStrategies = this.generateTestStrategies(formType, complexity, fieldAnalysis);

      return {
        formId,
        formInfo,
        formType,
        complexity,
        fieldAnalysis,
        validationRules,
        interactionFlow,
        testStrategies,
        errors
      };
    } catch (error) {
      errors.push(`Form analysis failed: ${error}`);
      
      return {
        formId,
        formInfo,
        formType: 'generic',
        complexity: 'simple',
        fieldAnalysis: [],
        validationRules: [],
        interactionFlow: [],
        testStrategies: [],
        errors
      };
    }
  }

  private generateFormId(formInfo: FormInfo): string {
    // Generate a unique ID based on form characteristics
    const actionHash = formInfo.action ? this.simpleHash(formInfo.action) : 'no-action';
    const fieldCount = formInfo.fields.length;
    const selectorHash = this.simpleHash(formInfo.selector);
    
    return `form-${actionHash}-${fieldCount}-${selectorHash}`;
  }

  private determineFormType(formInfo: FormInfo): FormType {
    const formText = [
      formInfo.action || '',
      formInfo.selector,
      ...formInfo.fields.map(f => [f.name, f.id, f.placeholder, f.type].join(' ')),
      ...formInfo.submitButtons.map(b => b.text || b.value || '')
    ].join(' ').toLowerCase();

    // Check each form type pattern
    for (const [type, patterns] of this.formPatterns) {
      if (patterns.some(pattern => pattern.test(formText))) {
        return type;
      }
    }

    return 'generic';
  }

  private assessComplexity(formInfo: FormInfo): FormComplexity {
    const fieldCount = formInfo.fields.length;
    const hasFileUpload = formInfo.fields.some(f => f.type === 'file');
    const hasSelectFields = formInfo.fields.some(f => f.tagName === 'select');
    const hasMultipleSteps = formInfo.fields.some(f => 
      f.className?.includes('step') || f.name?.includes('step')
    );

    if (hasMultipleSteps) {
      return 'wizard';
    }

    if (fieldCount >= 9 || hasFileUpload) {
      return 'complex';
    }

    if (fieldCount >= 4 || hasSelectFields) {
      return 'medium';
    }

    return 'simple';
  }

  private async analyzeFields(fields: ElementInfo[]): Promise<FieldAnalysis[]> {
    const analyses: FieldAnalysis[] = [];

    for (const field of fields) {
      const analysis = await this.analyzeField(field);
      analyses.push(analysis);
    }

    return analyses;
  }

  private async analyzeField(field: ElementInfo): Promise<FieldAnalysis> {
    const fieldType = this.determineFieldType(field);
    const constraints = this.extractConstraints(field);
    const validationHints = this.extractValidationHints(field);
    const testData = this.generateTestData(fieldType, constraints);

    return {
      field,
      fieldType,
      isRequired: constraints.required,
      hasValidation: validationHints.length > 0,
      validationHints,
      placeholderText: field.placeholder,
      labelText: this.findLabelText(field),
      helpText: this.findHelpText(field),
      constraints,
      testData
    };
  }

  private determineFieldType(field: ElementInfo): FieldType {
    const type = (field.type || '').toLowerCase();
    const name = (field.name || '').toLowerCase();
    const id = (field.id || '').toLowerCase();
    const placeholder = (field.placeholder || '').toLowerCase();

    // Direct type mapping
    if (type === 'email') return 'email';
    if (type === 'password') return 'password';
    if (type === 'number') return 'number';
    if (type === 'date') return 'date';
    if (type === 'url') return 'url';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'file') return 'file';
    if (type === 'hidden') return 'hidden';
    if (field.tagName === 'select') return 'select';
    if (field.tagName === 'textarea') return 'textarea';

    // Infer from name/id/placeholder
    const allText = [name, id, placeholder].join(' ');
    
    if (/email|e-mail/.test(allText)) return 'email';
    if (/password|pwd/.test(allText)) return 'password';
    if (/phone|tel|mobile/.test(allText)) return 'phone';
    if (/date|birthday|dob/.test(allText)) return 'date';
    if (/url|website|link/.test(allText)) return 'url';
    if (/number|age|quantity|count/.test(allText)) return 'number';

    return 'text';
  }

  private extractConstraints(field: ElementInfo): FieldConstraints {
    // This would typically extract from HTML attributes
    // For now, we'll use basic inference
    return {
      required: field.name?.includes('required') || field.id?.includes('required') || false,
      readonly: false,
      disabled: false,
      minLength: field.type === 'password' ? 8 : undefined,
      maxLength: field.type === 'text' ? 255 : undefined
    };
  }

  private extractValidationHints(field: ElementInfo): string[] {
    const hints: string[] = [];
    
    if (field.placeholder) {
      hints.push(`Placeholder: ${field.placeholder}`);
    }
    
    if (field.type === 'email') {
      hints.push('Must be valid email format');
    }
    
    if (field.type === 'password') {
      hints.push('Password field - likely has complexity requirements');
    }
    
    return hints;
  }

  private findLabelText(field: ElementInfo): string | undefined {
    // In a real implementation, this would search for associated label elements
    // For now, we'll use the field name or ID as a fallback
    return field.name || field.id;
  }

  private findHelpText(_field: ElementInfo): string | undefined {
    // In a real implementation, this would search for aria-describedby or help text
    return undefined;
  }

  private generateTestData(fieldType: FieldType, constraints: FieldConstraints): TestDataSuggestion[] {
    const suggestions: TestDataSuggestion[] = [];

    switch (fieldType) {
      case 'text':
        suggestions.push(
          { category: 'valid', value: 'Test User', description: 'Normal text input', expectation: 'accept' },
          { category: 'boundary', value: 'A', description: 'Single character', expectation: 'accept' },
          { category: 'boundary', value: 'A'.repeat(255), description: 'Maximum length', expectation: 'accept' },
          { category: 'invalid', value: '', description: 'Empty value', expectation: constraints.required ? 'reject' : 'accept' },
          { category: 'special', value: 'Test@#$%', description: 'Special characters', expectation: 'accept' }
        );
        break;

      case 'email':
        suggestions.push(
          { category: 'valid', value: 'test@example.com', description: 'Valid email', expectation: 'accept' },
          { category: 'valid', value: 'user.name+tag@domain.co.uk', description: 'Complex valid email', expectation: 'accept' },
          { category: 'invalid', value: 'invalid-email', description: 'Missing @ symbol', expectation: 'reject' },
          { category: 'invalid', value: 'test@', description: 'Missing domain', expectation: 'reject' },
          { category: 'invalid', value: '@example.com', description: 'Missing local part', expectation: 'reject' }
        );
        break;

      case 'password':
        suggestions.push(
          { category: 'valid', value: 'SecurePass123!', description: 'Strong password', expectation: 'accept' },
          { category: 'boundary', value: 'Pass123!', description: 'Minimum complexity', expectation: 'accept' },
          { category: 'invalid', value: 'weak', description: 'Too simple', expectation: 'reject' },
          { category: 'invalid', value: '123456', description: 'Only numbers', expectation: 'reject' },
          { category: 'invalid', value: '', description: 'Empty password', expectation: 'reject' }
        );
        break;

      case 'phone':
        suggestions.push(
          { category: 'valid', value: '+1-555-123-4567', description: 'International format', expectation: 'accept' },
          { category: 'valid', value: '(555) 123-4567', description: 'US format with parentheses', expectation: 'accept' },
          { category: 'valid', value: '555-123-4567', description: 'US format with dashes', expectation: 'accept' },
          { category: 'invalid', value: '123', description: 'Too short', expectation: 'reject' },
          { category: 'invalid', value: 'not-a-phone', description: 'Non-numeric', expectation: 'reject' }
        );
        break;

      case 'number':
        suggestions.push(
          { category: 'valid', value: '123', description: 'Positive integer', expectation: 'accept' },
          { category: 'valid', value: '0', description: 'Zero', expectation: 'accept' },
          { category: 'valid', value: '-123', description: 'Negative number', expectation: 'accept' },
          { category: 'boundary', value: '999999999', description: 'Large number', expectation: 'accept' },
          { category: 'invalid', value: 'abc', description: 'Non-numeric text', expectation: 'reject' }
        );
        break;

      default:
        suggestions.push(
          { category: 'valid', value: 'Test Value', description: 'Basic test value', expectation: 'accept' },
          { category: 'invalid', value: '', description: 'Empty value', expectation: constraints.required ? 'reject' : 'accept' }
        );
    }

    return suggestions;
  }

  private extractValidationRules(_formInfo: FormInfo, fieldAnalysis: FieldAnalysis[]): ValidationRule[] {
    const rules: ValidationRule[] = [];

    for (const analysis of fieldAnalysis) {
      const field = analysis.field;
      
      // Required field validation
      if (analysis.isRequired) {
        rules.push({
          field: field.selector,
          rule: 'required',
          message: `${analysis.labelText || 'Field'} is required`,
          trigger: 'blur'
        });
      }

      // Type-specific validation
      if (analysis.fieldType === 'email') {
        rules.push({
          field: field.selector,
          rule: 'email',
          message: 'Please enter a valid email address',
          trigger: 'blur',
          pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
        });
      }

      // Length constraints
      if (analysis.constraints.minLength) {
        rules.push({
          field: field.selector,
          rule: 'minLength',
          message: `Minimum length is ${analysis.constraints.minLength} characters`,
          trigger: 'blur'
        });
      }

      if (analysis.constraints.maxLength) {
        rules.push({
          field: field.selector,
          rule: 'maxLength',
          message: `Maximum length is ${analysis.constraints.maxLength} characters`,
          trigger: 'change'
        });
      }
    }

    return rules;
  }

  private generateInteractionFlow(formInfo: FormInfo, fieldAnalysis: FieldAnalysis[]): InteractionStep[] {
    const steps: InteractionStep[] = [];
    let stepNumber = 1;

    // Sort fields by likely tab order
    const sortedFields = fieldAnalysis.sort((a, b) => {
      const aOrder = this.getTabOrder(a.field);
      const bOrder = this.getTabOrder(b.field);
      return aOrder - bOrder;
    });

    // Generate steps for each field
    for (const analysis of sortedFields) {
      const field = analysis.field;
      
      if (analysis.fieldType === 'hidden') {
        continue; // Skip hidden fields
      }

      let action: InteractionStep['action'] = 'fill';
      let value = analysis.testData.find(d => d.category === 'valid')?.value || 'Test Value';

      if (analysis.fieldType === 'checkbox') {
        action = 'check';
        value = 'true';
      } else if (analysis.fieldType === 'radio') {
        action = 'check';
        value = 'true';
      } else if (analysis.fieldType === 'select') {
        action = 'select';
        value = 'First Option'; // Would need to extract actual options
      }

      steps.push({
        stepNumber: stepNumber++,
        description: `${action} ${analysis.labelText || field.name || field.id || 'field'}`,
        action,
        target: field.selector,
        value,
        dependencies: []
      });
    }

    // Add submit step
    if (formInfo.submitButtons.length > 0) {
      const submitButton = formInfo.submitButtons[0];
      steps.push({
        stepNumber: stepNumber++,
        description: 'Submit form',
        action: 'click',
        target: submitButton.selector,
        dependencies: sortedFields.map(f => f.field.selector)
      });
    }

    return steps;
  }

  private generateTestStrategies(
    _formType: FormType,
    complexity: FormComplexity,
    fieldAnalysis: FieldAnalysis[]
  ): TestStrategy[] {
    const strategies: TestStrategy[] = [];

    // Positive test cases
    strategies.push({
      category: 'positive',
      description: 'Complete form with valid data',
      steps: [
        'Fill all required fields with valid data',
        'Fill optional fields with valid data',
        'Submit the form',
        'Verify successful submission'
      ],
      expectedResult: 'Form should be submitted successfully',
      priority: 'high'
    });

    // Negative test cases
    strategies.push({
      category: 'negative',
      description: 'Submit form with missing required fields',
      steps: [
        'Leave required fields empty',
        'Attempt to submit the form',
        'Verify validation errors appear'
      ],
      expectedResult: 'Form should display validation errors',
      priority: 'high'
    });

    // Field-specific negative tests
    const emailFields = fieldAnalysis.filter(f => f.fieldType === 'email');
    if (emailFields.length > 0) {
      strategies.push({
        category: 'negative',
        description: 'Test email field with invalid format',
        steps: [
          'Enter invalid email format',
          'Attempt to submit or move focus',
          'Verify email validation error'
        ],
        expectedResult: 'Should display email format error',
        priority: 'medium'
      });
    }

    // Boundary tests
    const textFields = fieldAnalysis.filter(f => 
      f.fieldType === 'text' && f.constraints.maxLength
    );
    if (textFields.length > 0) {
      strategies.push({
        category: 'boundary',
        description: 'Test text fields with maximum length',
        steps: [
          'Fill text fields with maximum allowed characters',
          'Verify input is accepted',
          'Try to enter one more character',
          'Verify excess characters are rejected'
        ],
        expectedResult: 'Should enforce maximum length constraints',
        priority: 'medium'
      });
    }

    // Usability tests
    if (complexity === 'complex' || complexity === 'wizard') {
      strategies.push({
        category: 'usability',
        description: 'Test form navigation and user experience',
        steps: [
          'Navigate through form using Tab key',
          'Test form field focus indicators',
          'Verify form can be completed using keyboard only',
          'Test form behavior with screen readers'
        ],
        expectedResult: 'Form should be accessible and user-friendly',
        priority: 'low'
      });
    }

    return strategies;
  }

  private getTabOrder(field: ElementInfo): number {
    // Simple heuristic for tab order based on field position
    // In a real implementation, this would consider tabindex attributes
    const match = field.selector.match(/:nth-of-type\((\d+)\)/);
    return match ? parseInt(match[1]) : 999;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  async analyzeForms(forms: FormInfo[]): Promise<FormAnalysisResult[]> {
    const results: FormAnalysisResult[] = [];
    
    for (const form of forms) {
      try {
        const analysis = await this.analyzeForm(form);
        results.push(analysis);
      } catch (error) {
        console.error(`Failed to analyze form ${form.selector}:`, error);
      }
    }

    return results.sort((a, b) => {
      // Sort by complexity and field count
      const complexityOrder = { simple: 1, medium: 2, complex: 3, wizard: 4 };
      const aPriority = complexityOrder[a.complexity] + a.fieldAnalysis.length;
      const bPriority = complexityOrder[b.complexity] + b.fieldAnalysis.length;
      return bPriority - aPriority;
    });
  }
}