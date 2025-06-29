export interface InputRequest {
  id: string;
  type: InputType;
  prompt: string;
  description?: string;
  required: boolean;
  category: InputCategory;
  context: InputContext;
  validationRules: ValidationRule[];
  options?: InputOption[];
  defaultValue?: any;
  metadata: InputMetadata;
  createdAt: number;
  expiresAt?: number;
}

export type InputType = 
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'select'
  | 'multi-select'
  | 'checkbox'
  | 'radio'
  | 'file'
  | 'date'
  | 'time'
  | 'url'
  | 'textarea'
  | 'json'
  | 'api-key';

export type InputCategory = 
  | 'authentication'
  | 'form-data'
  | 'api-parameter'
  | 'configuration'
  | 'test-data'
  | 'validation-data'
  | 'file-upload'
  | 'environment'
  | 'credential';

export interface InputContext {
  sessionId: string;
  testCaseId?: string;
  scenarioId?: string;
  formSelector?: string;
  elementSelector?: string;
  pageUrl?: string;
  stepNumber?: number;
  relatedInputs?: string[];
}

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message: string;
  errorCode?: string;
}

export interface InputOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

export interface InputMetadata {
  priority: 'high' | 'medium' | 'low';
  source: 'form-analysis' | 'user-request' | 'test-execution' | 'exploration';
  tags: string[];
  hints: string[];
  examples: string[];
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface InputResponse {
  requestId: string;
  value: any;
  timestamp: number;
  valid: boolean;
  validationErrors: string[];
  metadata?: {
    userAgent?: string;
    sessionDuration?: number;
    inputMethod?: 'manual' | 'paste' | 'autofill';
  };
}

export interface InputCollectionSession {
  sessionId: string;
  testCaseId?: string;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  startTime: number;
  endTime?: number;
  totalRequests: number;
  completedRequests: number;
  pendingRequests: string[];
  completedInputs: Map<string, InputResponse>;
  errors: string[];
  metadata: {
    userAgent?: string;
    browserInfo?: any;
    networkConditions?: string;
  };
}

export interface InputCollectionConfig {
  defaultTimeout: number;
  maxRetries: number;
  enableEncryption: boolean;
  requireConfirmation: boolean;
  allowSkip: boolean;
  sessionTimeout: number;
  validationMode: 'strict' | 'lenient';
  securityChecks: boolean;
}

export interface InputAnalysisResult {
  missingInputs: InputRequest[];
  suggestedInputs: InputRequest[];
  optionalInputs: InputRequest[];
  priorityLevel: 'critical' | 'important' | 'optional';
  estimatedTime: number;
  dependencies: string[];
}

export class InputCollectionService {
  private activeRequests: Map<string, InputRequest> = new Map();
  private activeSessions: Map<string, InputCollectionSession> = new Map();
  private config: InputCollectionConfig;
  private responseCallbacks: Map<string, (response: InputResponse) => void> = new Map();

  constructor(config: Partial<InputCollectionConfig> = {}) {
    this.config = {
      defaultTimeout: 300000, // 5 minutes
      maxRetries: 3,
      enableEncryption: true,
      requireConfirmation: false,
      allowSkip: true,
      sessionTimeout: 1800000, // 30 minutes
      validationMode: 'strict',
      securityChecks: true,
      ...config
    };
  }

  async analyzeInputRequirements(
    pageAnalysis: any,
    explorationResult: any,
    context: Partial<InputContext>
  ): Promise<InputAnalysisResult> {
    const missingInputs: InputRequest[] = [];
    const suggestedInputs: InputRequest[] = [];
    const optionalInputs: InputRequest[] = [];

    // Analyze forms for required inputs
    if (pageAnalysis.forms) {
      for (const form of pageAnalysis.forms) {
        const formInputs = await this.analyzeFormInputRequirements(form, context);
        missingInputs.push(...formInputs.required);
        suggestedInputs.push(...formInputs.suggested);
        optionalInputs.push(...formInputs.optional);
      }
    }

    // Analyze authentication requirements
    const authInputs = await this.analyzeAuthenticationRequirements(pageAnalysis, context);
    missingInputs.push(...authInputs);

    // Analyze API parameter requirements
    const apiInputs = await this.analyzeApiRequirements(explorationResult, context);
    suggestedInputs.push(...apiInputs);

    // Determine priority level
    const priorityLevel = this.calculatePriorityLevel(missingInputs, suggestedInputs);

    // Estimate completion time
    const estimatedTime = this.estimateCompletionTime(missingInputs, suggestedInputs, optionalInputs);

    // Calculate dependencies
    const dependencies = this.calculateDependencies(missingInputs, suggestedInputs);

    return {
      missingInputs,
      suggestedInputs,
      optionalInputs,
      priorityLevel,
      estimatedTime,
      dependencies
    };
  }

  async createInputRequest(
    type: InputType,
    prompt: string,
    context: InputContext,
    options: Partial<InputRequest> = {}
  ): Promise<InputRequest> {
    const request: InputRequest = {
      id: this.generateRequestId(),
      type,
      prompt,
      description: options.description,
      required: options.required ?? true,
      category: options.category ?? 'test-data',
      context,
      validationRules: options.validationRules ?? [],
      options: options.options,
      defaultValue: options.defaultValue,
      metadata: options.metadata ?? {
        priority: 'medium',
        source: 'test-execution',
        tags: [],
        hints: [],
        examples: [],
        securityLevel: 'internal'
      },
      createdAt: Date.now(),
      expiresAt: options.expiresAt ?? Date.now() + this.config.defaultTimeout
    };

    // Add default validation rules based on type
    request.validationRules = this.addDefaultValidationRules(request);

    // Store the request
    this.activeRequests.set(request.id, request);

    return request;
  }

  async requestUserInput(
    request: InputRequest,
    callback?: (response: InputResponse) => void
  ): Promise<InputResponse> {
    return new Promise((resolve, reject) => {
      // Store callback for when response is received
      if (callback) {
        this.responseCallbacks.set(request.id, callback);
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        this.cleanupRequest(request.id);
        reject(new Error(`Input request ${request.id} timed out`));
      }, request.expiresAt ? request.expiresAt - Date.now() : this.config.defaultTimeout);

      // Store resolve function to call when response is received
      this.responseCallbacks.set(request.id, (response: InputResponse) => {
        clearTimeout(timeout);
        this.cleanupRequest(request.id);
        if (callback) callback(response);
        resolve(response);
      });

      // Emit request to WebSocket clients (implementation depends on WebSocket service)
      this.emitInputRequest(request);
    });
  }

  async submitInputResponse(requestId: string, value: any, metadata?: any): Promise<boolean> {
    const request = this.activeRequests.get(requestId);
    if (!request) {
      throw new Error(`Input request ${requestId} not found or expired`);
    }

    // Create response object
    const response: InputResponse = {
      requestId,
      value,
      timestamp: Date.now(),
      valid: false,
      validationErrors: [],
      metadata
    };

    // Validate the response
    const validationResult = await this.validateInput(request, value);
    response.valid = validationResult.valid;
    response.validationErrors = validationResult.errors;

    if (!response.valid && this.config.validationMode === 'strict') {
      return false;
    }

    // Update session
    const session = this.getSessionByRequestId(requestId);
    if (session) {
      session.completedInputs.set(requestId, response);
      session.completedRequests++;
      session.pendingRequests = session.pendingRequests.filter(id => id !== requestId);
      
      if (session.pendingRequests.length === 0) {
        session.status = 'completed';
        session.endTime = Date.now();
      }
    }

    // Call callback if registered
    const callback = this.responseCallbacks.get(requestId);
    if (callback) {
      callback(response);
    }

    return true;
  }

  async createSession(
    sessionId: string,
    testCaseId?: string,
    metadata: any = {}
  ): Promise<InputCollectionSession> {
    const session: InputCollectionSession = {
      sessionId,
      testCaseId,
      status: 'active',
      startTime: Date.now(),
      totalRequests: 0,
      completedRequests: 0,
      pendingRequests: [],
      completedInputs: new Map(),
      errors: [],
      metadata
    };

    this.activeSessions.set(sessionId, session);

    // Set session timeout
    setTimeout(() => {
      this.expireSession(sessionId);
    }, this.config.sessionTimeout);

    return session;
  }

  async addRequestToSession(sessionId: string, requestId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    session.totalRequests++;
    session.pendingRequests.push(requestId);
    
    return true;
  }

  private async analyzeFormInputRequirements(
    form: any,
    context: Partial<InputContext>
  ): Promise<{
    required: InputRequest[];
    suggested: InputRequest[];
    optional: InputRequest[];
  }> {
    const required: InputRequest[] = [];
    const suggested: InputRequest[] = [];
    const optional: InputRequest[] = [];

    if (!form.fields) return { required, suggested, optional };

    for (const field of form.fields) {
      const inputType = this.mapFieldTypeToInputType(field.type);
      const category = this.determineInputCategory(field, form);
      
      const request = await this.createInputRequest(
        inputType,
        this.generateFieldPrompt(field),
        {
          ...context,
          sessionId: context.sessionId || 'default',
          formSelector: form.selector,
          elementSelector: field.selector
        },
        {
          category,
          required: field.required || category === 'authentication',
          metadata: {
            priority: category === 'authentication' ? 'high' : 'medium',
            source: 'form-analysis',
            tags: [field.type, category],
            hints: this.generateFieldHints(field),
            examples: this.generateFieldExamples(field),
            securityLevel: category === 'authentication' ? 'confidential' : 'internal'
          }
        }
      );

      if (field.required || category === 'authentication') {
        required.push(request);
      } else if (this.isImportantField(field)) {
        suggested.push(request);
      } else {
        optional.push(request);
      }
    }

    return { required, suggested, optional };
  }

  private async analyzeAuthenticationRequirements(
    pageAnalysis: any,
    context: Partial<InputContext>
  ): Promise<InputRequest[]> {
    const authInputs: InputRequest[] = [];

    // Check for login forms
    const loginForms = pageAnalysis.forms?.filter((form: any) => 
      this.isLoginForm(form)
    ) || [];

    for (const form of loginForms) {
      const usernameField = form.fields?.find((f: any) => 
        this.isUsernameField(f)
      );
      const passwordField = form.fields?.find((f: any) => 
        this.isPasswordField(f)
      );

      if (usernameField) {
        const request = await this.createInputRequest(
          'email',
          'Enter your username or email address',
          { ...context, sessionId: context.sessionId || 'default', formSelector: form.selector, elementSelector: usernameField.selector },
          {
            category: 'authentication',
            required: true,
            metadata: {
              priority: 'high',
              source: 'form-analysis',
              tags: ['authentication', 'username', 'login'],
              hints: ['This will be used to log into the application'],
              examples: ['user@example.com', 'testuser'],
              securityLevel: 'confidential'
            }
          }
        );
        authInputs.push(request);
      }

      if (passwordField) {
        const request = await this.createInputRequest(
          'password',
          'Enter your password',
          { ...context, sessionId: context.sessionId || 'default', formSelector: form.selector, elementSelector: passwordField.selector },
          {
            category: 'authentication',
            required: true,
            metadata: {
              priority: 'high',
              source: 'form-analysis',
              tags: ['authentication', 'password', 'login'],
              hints: ['Your account password - will be encrypted'],
              examples: [],
              securityLevel: 'restricted'
            }
          }
        );
        authInputs.push(request);
      }
    }

    return authInputs;
  }

  private async analyzeApiRequirements(
    explorationResult: any,
    context: Partial<InputContext>
  ): Promise<InputRequest[]> {
    const apiInputs: InputRequest[] = [];

    // Look for API endpoints that might need configuration
    if (explorationResult.ajaxRequests) {
      const uniqueEndpoints = new Set<string>(
        explorationResult.ajaxRequests.map((req: any) => req.url as string)
      );

      for (const endpoint of uniqueEndpoints) {
        if (this.requiresApiKey(endpoint)) {
          const request = await this.createInputRequest(
            'api-key',
            `Enter API key for ${this.extractServiceName(endpoint)}`,
            { ...context, sessionId: context.sessionId || 'default' },
            {
              category: 'api-parameter',
              required: false,
              metadata: {
                priority: 'medium',
                source: 'exploration',
                tags: ['api', 'authentication', 'key'],
                hints: [`API key for accessing ${endpoint}`],
                examples: ['sk-1234567890abcdef'],
                securityLevel: 'confidential'
              }
            }
          );
          apiInputs.push(request);
        }
      }
    }

    return apiInputs;
  }

  private mapFieldTypeToInputType(fieldType: string): InputType {
    const mapping: Record<string, InputType> = {
      'text': 'text',
      'email': 'email',
      'password': 'password',
      'number': 'number',
      'select': 'select',
      'checkbox': 'checkbox',
      'radio': 'radio',
      'file': 'file',
      'date': 'date',
      'time': 'time',
      'url': 'url',
      'textarea': 'textarea'
    };

    return mapping[fieldType] || 'text';
  }

  private determineInputCategory(field: any, form: any): InputCategory {
    const fieldInfo = `${field.name} ${field.id} ${field.placeholder}`.toLowerCase();
    const formInfo = `${form.action} ${form.selector}`.toLowerCase();

    if (this.matchesPatterns(fieldInfo, ['username', 'email', 'password', 'login'])) {
      return 'authentication';
    }

    if (this.matchesPatterns(formInfo, ['api', 'key', 'token'])) {
      return 'api-parameter';
    }

    if (field.type === 'file') {
      return 'file-upload';
    }

    if (this.matchesPatterns(fieldInfo, ['config', 'setting', 'environment'])) {
      return 'configuration';
    }

    return 'form-data';
  }

  private generateFieldPrompt(field: any): string {
    const fieldName = field.name || field.id || 'field';
    const placeholder = field.placeholder ? ` (${field.placeholder})` : '';
    
    return `Enter value for ${fieldName}${placeholder}`;
  }

  private generateFieldHints(field: any): string[] {
    const hints: string[] = [];
    
    if (field.placeholder) {
      hints.push(`Placeholder: ${field.placeholder}`);
    }
    
    if (field.required) {
      hints.push('This field is required');
    }
    
    if (field.type === 'email') {
      hints.push('Must be a valid email address');
    }
    
    if (field.type === 'password') {
      hints.push('Password will be encrypted for security');
    }
    
    return hints;
  }

  private generateFieldExamples(field: any): string[] {
    const examples: string[] = [];
    
    switch (field.type) {
      case 'email':
        examples.push('user@example.com', 'test.user@domain.co.uk');
        break;
      case 'text':
        if (field.name?.toLowerCase().includes('name')) {
          examples.push('John Doe', 'Test User');
        } else {
          examples.push('Sample text', 'Example value');
        }
        break;
      case 'number':
        examples.push('123', '42');
        break;
      case 'date':
        examples.push('2023-12-25', '01/15/2024');
        break;
    }
    
    return examples;
  }

  private addDefaultValidationRules(request: InputRequest): ValidationRule[] {
    const rules = [...request.validationRules];
    
    if (request.required) {
      rules.push({
        type: 'required',
        message: 'This field is required'
      });
    }
    
    switch (request.type) {
      case 'email':
        rules.push({
          type: 'pattern',
          value: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
          message: 'Please enter a valid email address'
        });
        break;
      case 'password':
        rules.push({
          type: 'minLength',
          value: 8,
          message: 'Password must be at least 8 characters long'
        });
        break;
      case 'url':
        rules.push({
          type: 'pattern',
          value: '^https?:\\/\\/.+',
          message: 'Please enter a valid URL'
        });
        break;
    }
    
    return rules;
  }

  private async validateInput(request: InputRequest, value: any): Promise<{valid: boolean, errors: string[]}> {
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
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  private calculatePriorityLevel(
    missingInputs: InputRequest[],
    _suggestedInputs: InputRequest[]
  ): 'critical' | 'important' | 'optional' {
    const hasAuth = missingInputs.some(input => input.category === 'authentication');
    const hasRequired = missingInputs.length > 0;
    
    if (hasAuth) return 'critical';
    if (hasRequired) return 'important';
    return 'optional';
  }

  private estimateCompletionTime(
    missingInputs: InputRequest[],
    suggestedInputs: InputRequest[],
    optionalInputs: InputRequest[]
  ): number {
    const baseTime = 30000; // 30 seconds base
    const perInputTime = 15000; // 15 seconds per input
    
    const totalInputs = missingInputs.length + suggestedInputs.length + optionalInputs.length;
    return baseTime + (totalInputs * perInputTime);
  }

  private calculateDependencies(
    missingInputs: InputRequest[],
    _suggestedInputs: InputRequest[]
  ): string[] {
    const dependencies: string[] = [];
    
    // Auth inputs are typically dependencies for other inputs
    const authInputs = missingInputs.filter(input => input.category === 'authentication');
    dependencies.push(...authInputs.map(input => input.id));
    
    return dependencies;
  }

  private isLoginForm(form: any): boolean {
    const formText = `${form.action} ${form.selector}`.toLowerCase();
    return this.matchesPatterns(formText, ['login', 'signin', 'auth']);
  }

  private isUsernameField(field: any): boolean {
    const fieldText = `${field.name} ${field.id} ${field.placeholder}`.toLowerCase();
    return this.matchesPatterns(fieldText, ['username', 'email', 'user']);
  }

  private isPasswordField(field: any): boolean {
    return field.type === 'password' || 
           this.matchesPatterns(`${field.name} ${field.id}`.toLowerCase(), ['password', 'pwd']);
  }

  private isImportantField(field: any): boolean {
    const fieldText = `${field.name} ${field.id} ${field.placeholder}`.toLowerCase();
    return this.matchesPatterns(fieldText, ['name', 'phone', 'address', 'company']);
  }

  private requiresApiKey(endpoint: string): boolean {
    return endpoint.includes('/api/') && 
           (endpoint.includes('key') || endpoint.includes('auth') || endpoint.includes('token'));
  }

  private extractServiceName(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      return url.hostname.split('.')[0];
    } catch {
      return 'service';
    }
  }

  private matchesPatterns(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  private getSessionByRequestId(requestId: string): InputCollectionSession | undefined {
    const request = this.activeRequests.get(requestId);
    if (!request) return undefined;
    
    return this.activeSessions.get(request.context.sessionId);
  }

  private emitInputRequest(request: InputRequest): void {
    // This will be implemented when we integrate with WebSocket service
    console.log(`Emitting input request: ${request.id}`);
  }

  private cleanupRequest(requestId: string): void {
    this.activeRequests.delete(requestId);
    this.responseCallbacks.delete(requestId);
  }

  private expireSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session && session.status === 'active') {
      session.status = 'expired';
      session.endTime = Date.now();
      
      // Clean up pending requests
      for (const requestId of session.pendingRequests) {
        this.cleanupRequest(requestId);
      }
    }
  }

  private generateRequestId(): string {
    return `input-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods
  getActiveRequests(): InputRequest[] {
    return Array.from(this.activeRequests.values());
  }

  getSession(sessionId: string): InputCollectionSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getActiveSessions(): InputCollectionSession[] {
    return Array.from(this.activeSessions.values());
  }

  async cancelRequest(requestId: string): Promise<boolean> {
    const request = this.activeRequests.get(requestId);
    if (!request) return false;
    
    this.cleanupRequest(requestId);
    
    // Update session
    const session = this.getSessionByRequestId(requestId);
    if (session) {
      session.pendingRequests = session.pendingRequests.filter(id => id !== requestId);
    }
    
    return true;
  }

  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    
    session.status = 'cancelled';
    session.endTime = Date.now();
    
    // Clean up all pending requests
    for (const requestId of session.pendingRequests) {
      this.cleanupRequest(requestId);
    }
    
    return true;
  }

  getConfig(): InputCollectionConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<InputCollectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  async analyzeTestCaseInputs(testCase: any): Promise<InputAnalysisResult> {
    const context: Partial<InputContext> = {
      sessionId: this.generateRequestId(),
      testCaseId: testCase.id
    };

    // Mock page analysis based on test case data
    const pageAnalysis = {
      forms: testCase.test_data?.steps?.filter((step: any) => 
        step.action === 'input' || step.action === 'type'
      ).map((step: any) => ({
        selector: step.target,
        elements: [{
          name: step.target,
          type: 'text',
          required: true,
          value: step.value
        }]
      })) || []
    };

    // Mock exploration result
    const explorationResult = {
      discoveredInputs: testCase.test_data?.inputs || {}
    };

    return this.analyzeInputRequirements(pageAnalysis, explorationResult, context);
  }

  async getTestCaseInputs(testCaseId: string): Promise<InputRequest[]> {
    const requests: InputRequest[] = [];
    
    // Find all requests for this test case
    for (const [_requestId, request] of this.activeRequests) {
      if (request.context.testCaseId === testCaseId) {
        requests.push(request);
      }
    }
    
    return requests;
  }

  async submitTestCaseInputs(testCaseId: string, inputs: Record<string, any>): Promise<{
    success: boolean;
    submittedCount: number;
    errors: string[];
  }> {
    const requests = await this.getTestCaseInputs(testCaseId);
    const errors: string[] = [];
    let submittedCount = 0;

    for (const request of requests) {
      const inputKey = request.context.elementSelector || request.prompt;
      const value = inputs[inputKey] || inputs[request.id];
      
      if (value !== undefined) {
        try {
          const success = await this.submitInputResponse(request.id, value);
          if (success) {
            submittedCount++;
          } else {
            errors.push(`Failed to submit input for ${request.prompt}`);
          }
        } catch (error: any) {
          errors.push(`Error submitting ${request.prompt}: ${error.message}`);
        }
      } else if (request.required) {
        errors.push(`Required input missing: ${request.prompt}`);
      }
    }

    return {
      success: errors.length === 0,
      submittedCount,
      errors
    };
  }
}