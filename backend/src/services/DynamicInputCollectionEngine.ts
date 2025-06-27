import { WebSocketServerManager } from '../websocket/WebSocketServer';
import { MessageType } from '../websocket/MessageTypes';
import { InputRequest } from './InputCollectionService';
import { ElementDiscoveryEngine, DiscoveredElement } from './ElementDiscoveryEngine';
import { NavigationPlan } from './TestCaseParser';
import { PuppeteerService } from './PuppeteerService';

export interface DynamicInputContext {
  sessionId: string;
  testCaseId?: string;
  pageUrl: string;
  pageTitle: string;
  explorationStep: number;
  totalSteps: number;
  currentElement?: DiscoveredElement;
  navigationPlan?: NavigationPlan;
  relatedElements: DiscoveredElement[];
  formContext?: FormExplorationContext;
  previousInputs: CollectedInput[];
}

export interface FormExplorationContext {
  formSelector: string;
  formAction?: string;
  formMethod?: string;
  totalFields: number;
  completedFields: number;
  requiredFields: string[];
  optionalFields: string[];
  fieldTypes: Record<string, string>;
  validationRules: Record<string, any[]>;
}

export interface CollectedInput {
  elementSelector: string;
  fieldName: string;
  fieldType: string;
  value: any;
  timestamp: number;
  confidence: number;
  source: 'user' | 'default' | 'inferred' | 'fallback';
}

export interface InputAnalysisResult {
  requiredInputs: DynamicInputRequest[];
  optionalInputs: DynamicInputRequest[];
  inferredValues: Record<string, any>;
  validationErrors: string[];
  recommendations: InputRecommendation[];
  priority: 'immediate' | 'high' | 'medium' | 'low';
}

export interface DynamicInputRequest extends InputRequest {
  element: DiscoveredElement;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[]; // Other input IDs this depends on
  alternatives: InputAlternative[];
  smartDefaults: SmartDefault[];
  contextualHelp: ContextualHelp;
  explorationContext: DynamicInputContext;
}

export interface InputAlternative {
  type: 'skip' | 'default' | 'random' | 'pattern';
  description: string;
  value?: any;
  confidence: number;
  risks: string[];
}

export interface SmartDefault {
  value: any;
  source: 'element-analysis' | 'similar-elements' | 'user-history' | 'common-patterns';
  confidence: number;
  description: string;
}

export interface ContextualHelp {
  purpose: string;
  examples: string[];
  tips: string[];
  warnings: string[];
  relatedFields: string[];
  validationGuidance: string[];
}

export interface InputRecommendation {
  type: 'automation' | 'user-experience' | 'security' | 'performance';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
  impact: string;
}

export interface InputCollectionStrategy {
  name: string;
  description: string;
  conditions: StrategyCondition[];
  timeout: number;
  maxRetries: number;
  fallbackStrategy?: string;
  userPromptTemplate: string;
  validationRules: any[];
}

export interface StrategyCondition {
  type: 'element-type' | 'element-purpose' | 'form-context' | 'security-level' | 'user-preference';
  operator: 'equals' | 'contains' | 'matches' | 'greater-than' | 'less-than';
  value: any;
}

export interface InputQueueItem {
  request: DynamicInputRequest;
  priority: number;
  addedAt: number;
  attempts: number;
  maxAttempts: number;
  timeoutAt: number;
  dependencies: string[];
  status: 'pending' | 'waiting-dependencies' | 'active' | 'completed' | 'failed' | 'cancelled';
  clientId?: string;
}

export interface SessionMetrics {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  skippedRequests: number;
  averageResponseTime: number;
  userSatisfactionScore: number;
  automationCoverage: number;
  errorRate: number;
}

export interface DynamicInputCollectionOptions {
  enableSmartDefaults: boolean;
  enableIntelligentSkipping: boolean;
  enableContextualHelp: boolean;
  enableDependencyTracking: boolean;
  maxConcurrentRequests: number;
  defaultTimeout: number;
  priorityBatchSize: number;
  userExperienceMode: 'minimal' | 'guided' | 'comprehensive';
  securityMode: 'relaxed' | 'standard' | 'strict';
  automationPreference: 'maximize' | 'balanced' | 'user-controlled';
}

export class DynamicInputCollectionEngine {
  private wsManager: WebSocketServerManager;
  private elementDiscovery: ElementDiscoveryEngine;
  private puppeteerService: PuppeteerService;

  private activeSessions: Map<string, DynamicInputContext> = new Map();
  private inputQueue: Map<string, InputQueueItem[]> = new Map(); // sessionId -> queue
  private collectedInputs: Map<string, CollectedInput[]> = new Map(); // sessionId -> inputs
  private strategies: Map<string, InputCollectionStrategy> = new Map();
  private sessionMetrics: Map<string, SessionMetrics> = new Map();

  private readonly defaultOptions: DynamicInputCollectionOptions = {
    enableSmartDefaults: true,
    enableIntelligentSkipping: true,
    enableContextualHelp: true,
    enableDependencyTracking: true,
    maxConcurrentRequests: 3,
    defaultTimeout: 60000, // 1 minute
    priorityBatchSize: 5,
    userExperienceMode: 'guided',
    securityMode: 'standard',
    automationPreference: 'balanced'
  };

  constructor(
    wsManager: WebSocketServerManager,
    elementDiscovery: ElementDiscoveryEngine,
    puppeteerService: PuppeteerService
  ) {
    this.wsManager = wsManager;
    this.elementDiscovery = elementDiscovery;
    this.puppeteerService = puppeteerService;

    this.initializeStrategies();
    this.setupEventHandlers();
  }

  private initializeStrategies(): void {
    // Authentication strategy
    this.strategies.set('authentication', {
      name: 'Authentication Input',
      description: 'Collect authentication credentials with security considerations',
      conditions: [
        { type: 'element-purpose', operator: 'equals', value: 'authentication' }
      ],
      timeout: 120000, // 2 minutes for auth
      maxRetries: 2,
      fallbackStrategy: 'skip-with-warning',
      userPromptTemplate: 'Authentication required: Please provide {fieldName} for login',
      validationRules: []
    });

    // Form data strategy
    this.strategies.set('form-data', {
      name: 'Form Data Input',
      description: 'Collect standard form field data',
      conditions: [
        { type: 'element-purpose', operator: 'equals', value: 'data-entry' }
      ],
      timeout: 45000,
      maxRetries: 3,
      fallbackStrategy: 'use-smart-default',
      userPromptTemplate: 'Form field required: Please provide {fieldName}',
      validationRules: []
    });

    // Navigation strategy
    this.strategies.set('navigation', {
      name: 'Navigation Choice',
      description: 'Collect navigation decisions and path choices',
      conditions: [
        { type: 'element-purpose', operator: 'equals', value: 'navigation' }
      ],
      timeout: 30000,
      maxRetries: 1,
      fallbackStrategy: 'skip',
      userPromptTemplate: 'Navigation choice: Please select {fieldName}',
      validationRules: []
    });

    // File upload strategy
    this.strategies.set('file-upload', {
      name: 'File Upload',
      description: 'Handle file upload requirements',
      conditions: [
        { type: 'element-type', operator: 'equals', value: 'file' }
      ],
      timeout: 180000, // 3 minutes for file selection
      maxRetries: 2,
      fallbackStrategy: 'skip',
      userPromptTemplate: 'File required: Please select a file for {fieldName}',
      validationRules: []
    });
  }

  private setupEventHandlers(): void {
    // Note: WebSocket message handling would need to be implemented
    // through the main WebSocket server setup, not directly here
    console.log('DynamicInputCollectionEngine initialized');
  }

  async startDynamicCollection(
    sessionId: string,
    pageId: string,
    url: string,
    navigationPlan?: NavigationPlan,
    options: Partial<DynamicInputCollectionOptions> = {}
  ): Promise<DynamicInputContext> {
    const finalOptions = { ...this.defaultOptions, ...options };

    // Initialize session context
    const context: DynamicInputContext = {
      sessionId,
      pageUrl: url,
      pageTitle: await this.getPageTitle(pageId),
      explorationStep: 0,
      totalSteps: navigationPlan?.navigationSequence.length || 0,
      navigationPlan,
      relatedElements: [],
      previousInputs: []
    };

    this.activeSessions.set(sessionId, context);
    this.inputQueue.set(sessionId, []);
    this.collectedInputs.set(sessionId, []);
    this.sessionMetrics.set(sessionId, {
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      skippedRequests: 0,
      averageResponseTime: 0,
      userSatisfactionScore: 0,
      automationCoverage: 0,
      errorRate: 0
    });

    // Discover elements and analyze input requirements
    const discoveryResult = await this.elementDiscovery.discoverElements(pageId, url, {
      includeHidden: false,
      generateXPath: true,
      analyzeAccessibility: true,
      capturePageState: true
    });

    // Analyze input requirements
    const analysisResult = await this.analyzeInputRequirements(
      discoveryResult.elements,
      context,
      finalOptions
    );

    // Add requests to queue
    await this.queueInputRequests(sessionId, analysisResult.requiredInputs, analysisResult.optionalInputs);

    // Start processing queue
    this.processInputQueue(sessionId, finalOptions);

    return context;
  }

  private async analyzeInputRequirements(
    elements: DiscoveredElement[],
    context: DynamicInputContext,
    options: DynamicInputCollectionOptions
  ): Promise<InputAnalysisResult> {
    const requiredInputs: DynamicInputRequest[] = [];
    const optionalInputs: DynamicInputRequest[] = [];
    const inferredValues: Record<string, any> = {};
    const validationErrors: string[] = [];
    const recommendations: InputRecommendation[] = [];

    // Filter form control elements
    const formElements = elements.filter(el => 
      el.classification.category === 'form-control' && 
      el.testability.canAutomate
    );

    for (const element of formElements) {
      const inputRequest = await this.createDynamicInputRequest(element, context, options);
      
      if (inputRequest) {
        // Determine if required based on element analysis
        if (this.isInputRequired(element, context)) {
          requiredInputs.push(inputRequest);
        } else {
          optionalInputs.push(inputRequest);
        }

        // Generate smart defaults if enabled
        if (options.enableSmartDefaults) {
          const smartDefaults = await this.generateSmartDefaults(element, context);
          if (smartDefaults.length > 0) {
            inferredValues[element.element.selector] = smartDefaults[0].value;
          }
        }
      }
    }

    // Generate recommendations
    recommendations.push(...this.generateInputRecommendations(formElements, context, options));

    // Determine overall priority
    const priority = this.calculateOverallPriority(requiredInputs, optionalInputs, context);

    return {
      requiredInputs,
      optionalInputs,
      inferredValues,
      validationErrors,
      recommendations,
      priority
    };
  }

  private async createDynamicInputRequest(
    element: DiscoveredElement,
    context: DynamicInputContext,
    options: DynamicInputCollectionOptions
  ): Promise<DynamicInputRequest | null> {
    try {
      const fieldName = this.extractFieldName(element);
      if (!fieldName) return null;

      const strategy = this.selectInputStrategy(element, context);
      const alternatives = await this.generateInputAlternatives(element, context, options);
      const smartDefaults = options.enableSmartDefaults 
        ? await this.generateSmartDefaults(element, context)
        : [];
      const contextualHelp = options.enableContextualHelp
        ? await this.generateContextualHelp(element, context)
        : this.getBasicHelp(element);

      const baseRequest: InputRequest = {
        id: `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: this.mapElementTypeToInputType(element),
        prompt: this.generateUserPrompt(element, strategy),
        description: this.generateInputDescription(element, context),
        required: this.isInputRequired(element, context),
        category: this.mapElementCategoryToInputCategory(element),
        context: {
          sessionId: context.sessionId,
          testCaseId: context.testCaseId,
          formSelector: element.context.form?.selector,
          elementSelector: element.element.selector,
          pageUrl: context.pageUrl,
          stepNumber: context.explorationStep
        },
        validationRules: this.extractValidationRules(element),
        options: this.generateInputOptions(element),
        defaultValue: smartDefaults[0]?.value,
        metadata: {
          priority: this.calculateInputPriority(element, context),
          source: 'exploration',
          tags: this.generateInputTags(element, context),
          hints: smartDefaults.map(d => d.description),
          examples: this.generateInputExamples(element),
          securityLevel: this.determineSecurityLevel(element, options)
        },
        createdAt: Date.now(),
        expiresAt: Date.now() + strategy.timeout
      };

      return {
        ...baseRequest,
        element,
        urgency: this.calculateInputUrgency(element, context),
        dependencies: this.findInputDependencies(element, context),
        alternatives,
        smartDefaults,
        contextualHelp,
        explorationContext: context
      };
    } catch (error) {
      console.error('Failed to create input request for element:', element.element.selector, error);
      return null;
    }
  }

  private extractFieldName(element: DiscoveredElement): string | null {
    // Try multiple sources for field name
    if (element.element.name) return element.element.name;
    if (element.element.id) return element.element.id;
    if (element.element.placeholder) return element.element.placeholder;
    
    // Extract from aria-label
    if (element.accessibility.ariaLabel) return element.accessibility.ariaLabel;
    
    // Extract from related label
    const labelElement = element.context.relatedElements.find(rel => rel.relationship === 'label');
    if (labelElement?.element.text) return labelElement.element.text;

    // Fallback to element type
    return element.classification.subType;
  }

  private selectInputStrategy(element: DiscoveredElement, context: DynamicInputContext): InputCollectionStrategy {
    // Find matching strategy based on element characteristics
    for (const [name, strategy] of this.strategies) {
      if (this.strategyMatches(strategy, element, context)) {
        return strategy;
      }
    }
    
    // Default strategy
    return this.strategies.get('form-data')!;
  }

  private strategyMatches(strategy: InputCollectionStrategy, element: DiscoveredElement, context: DynamicInputContext): boolean {
    return strategy.conditions.every(condition => {
      switch (condition.type) {
        case 'element-type':
          return this.evaluateCondition(element.classification.subType, condition.operator, condition.value);
        case 'element-purpose':
          return this.evaluateCondition(element.classification.purpose, condition.operator, condition.value);
        case 'form-context':
          return !!element.context.form && this.evaluateCondition(element.context.form.selector, condition.operator, condition.value);
        case 'security-level':
          return this.evaluateCondition(element.attributes.validation.rules.length > 0, condition.operator, condition.value);
        default:
          return true;
      }
    });
  }

  private evaluateCondition(actualValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals': return actualValue === expectedValue;
      case 'contains': return String(actualValue).includes(String(expectedValue));
      case 'matches': return new RegExp(expectedValue).test(String(actualValue));
      case 'greater-than': return Number(actualValue) > Number(expectedValue);
      case 'less-than': return Number(actualValue) < Number(expectedValue);
      default: return false;
    }
  }

  private async generateInputAlternatives(
    element: DiscoveredElement,
    context: DynamicInputContext,
    options: DynamicInputCollectionOptions
  ): Promise<InputAlternative[]> {
    const alternatives: InputAlternative[] = [];

    // Skip alternative
    if (options.enableIntelligentSkipping && !this.isInputRequired(element, context)) {
      alternatives.push({
        type: 'skip',
        description: 'Skip this optional field',
        confidence: 0.8,
        risks: ['May miss important test scenario']
      });
    }

    // Default value alternative
    if (element.attributes.defaultValue || element.element.placeholder) {
      alternatives.push({
        type: 'default',
        description: 'Use default or placeholder value',
        value: element.attributes.defaultValue || element.element.placeholder,
        confidence: 0.6,
        risks: ['May not represent realistic user input']
      });
    }

    // Random/pattern-based alternative
    if (element.classification.subType === 'email-input') {
      alternatives.push({
        type: 'pattern',
        description: 'Generate test email address',
        value: `test${Date.now()}@example.com`,
        confidence: 0.9,
        risks: ['Generated data may not trigger specific validation']
      });
    } else if (element.classification.subType === 'text-input') {
      alternatives.push({
        type: 'pattern',
        description: 'Generate test text',
        value: `Test ${this.extractFieldName(element) || 'Data'} ${Date.now()}`,
        confidence: 0.7,
        risks: ['Generic data may not reflect real usage patterns']
      });
    }

    return alternatives;
  }

  private async generateSmartDefaults(
    element: DiscoveredElement,
    context: DynamicInputContext
  ): Promise<SmartDefault[]> {
    const defaults: SmartDefault[] = [];

    // Element analysis based defaults
    if (element.attributes.defaultValue) {
      defaults.push({
        value: element.attributes.defaultValue,
        source: 'element-analysis',
        confidence: 0.8,
        description: 'Default value from element attributes'
      });
    }

    // Pattern-based defaults
    const fieldName = this.extractFieldName(element)?.toLowerCase() || '';
    
    if (fieldName.includes('email')) {
      defaults.push({
        value: 'test.user@example.com',
        source: 'common-patterns',
        confidence: 0.9,
        description: 'Standard test email address'
      });
    } else if (fieldName.includes('name')) {
      defaults.push({
        value: 'Test User',
        source: 'common-patterns',
        confidence: 0.8,
        description: 'Generic test name'
      });
    } else if (fieldName.includes('phone')) {
      defaults.push({
        value: '+1-555-0123',
        source: 'common-patterns',
        confidence: 0.8,
        description: 'Test phone number'
      });
    }

    // User history based defaults (simplified)
    const previousInputs = this.collectedInputs.get(context.sessionId) || [];
    const similarInput = previousInputs.find(input => 
      input.fieldType === element.classification.subType &&
      input.confidence > 0.7
    );
    
    if (similarInput) {
      defaults.push({
        value: similarInput.value,
        source: 'user-history',
        confidence: 0.9,
        description: 'Similar value used previously in this session'
      });
    }

    return defaults.sort((a, b) => b.confidence - a.confidence);
  }

  private async generateContextualHelp(
    element: DiscoveredElement,
    context: DynamicInputContext
  ): Promise<ContextualHelp> {
    const fieldName = this.extractFieldName(element) || 'this field';
    const purpose = this.generateHelpPurpose(element, context);
    const examples = this.generateInputExamples(element);
    const tips = this.generateInputTips(element, context);
    const warnings = this.generateInputWarnings(element, context);
    const relatedFields = this.findRelatedFields(element, context);
    const validationGuidance = this.generateValidationGuidance(element);

    return {
      purpose,
      examples,
      tips,
      warnings,
      relatedFields,
      validationGuidance
    };
  }

  private getBasicHelp(element: DiscoveredElement): ContextualHelp {
    return {
      purpose: `Enter value for ${this.extractFieldName(element) || 'this field'}`,
      examples: [],
      tips: [],
      warnings: [],
      relatedFields: [],
      validationGuidance: []
    };
  }

  private generateHelpPurpose(element: DiscoveredElement, context: DynamicInputContext): string {
    const fieldName = this.extractFieldName(element) || 'this field';
    const purpose = element.classification.purpose;
    
    switch (purpose) {
      case 'authentication':
        return `This field is required for authentication. Please provide your ${fieldName}.`;
      case 'data-entry':
        return `Please enter your ${fieldName} to continue with the form.`;
      case 'search':
        return `Enter your search terms in the ${fieldName} field.`;
      case 'navigation':
        return `Select an option from ${fieldName} to navigate.`;
      default:
        return `Please provide a value for ${fieldName}.`;
    }
  }

  private generateInputExamples(element: DiscoveredElement): string[] {
    const examples: string[] = [];
    
    switch (element.classification.subType) {
      case 'email-input':
        examples.push('user@example.com', 'test.email@domain.org');
        break;
      case 'password-input':
        examples.push('SecurePass123!', 'MyStr0ngP@ssw0rd');
        break;
      case 'text-input':
        const fieldName = this.extractFieldName(element)?.toLowerCase() || '';
        if (fieldName.includes('name')) {
          examples.push('John Doe', 'Jane Smith');
        } else if (fieldName.includes('address')) {
          examples.push('123 Main St', '456 Oak Avenue');
        } else {
          examples.push('Sample text', 'Example value');
        }
        break;
      case 'number-input':
        examples.push('123', '42', '100');
        break;
      case 'date-picker':
        examples.push('2024-01-15', '12/25/2023');
        break;
    }
    
    return examples;
  }

  private generateInputTips(element: DiscoveredElement, context: DynamicInputContext): string[] {
    const tips: string[] = [];
    
    if (element.attributes.required) {
      tips.push('This field is required and cannot be left empty');
    }
    
    if (element.attributes.pattern) {
      tips.push(`Input must match the pattern: ${element.attributes.pattern}`);
    }
    
    if (element.attributes.maxLength) {
      tips.push(`Maximum length: ${element.attributes.maxLength} characters`);
    }
    
    if (element.attributes.minLength) {
      tips.push(`Minimum length: ${element.attributes.minLength} characters`);
    }
    
    if (element.classification.subType === 'password-input') {
      tips.push('Use a strong password with mixed case, numbers, and symbols');
    }
    
    return tips;
  }

  private generateInputWarnings(element: DiscoveredElement, context: DynamicInputContext): string[] {
    const warnings: string[] = [];
    
    if (element.classification.purpose === 'authentication') {
      warnings.push('This is authentication data - use test credentials only');
    }
    
    if (element.accessibility.compliance.score < 50) {
      warnings.push('This element has accessibility issues that may affect automation');
    }
    
    if (element.selectors.reliability.score < 50) {
      warnings.push('Element selector may be unstable - consider improving test attributes');
    }
    
    return warnings;
  }

  private findRelatedFields(element: DiscoveredElement, context: DynamicInputContext): string[] {
    return element.context.relatedElements
      .filter(rel => rel.relationship === 'group-member')
      .map(rel => this.extractFieldName({ element: rel.element } as DiscoveredElement) || '')
      .filter(name => name);
  }

  private generateValidationGuidance(element: DiscoveredElement): string[] {
    return element.attributes.validation.rules.map(rule => {
      switch (rule.type) {
        case 'required':
          return 'This field cannot be empty';
        case 'email':
          return 'Must be a valid email address format';
        case 'pattern':
          return `Must match pattern: ${rule.value}`;
        case 'minLength':
          return `Must be at least ${rule.value} characters long`;
        case 'maxLength':
          return `Cannot exceed ${rule.value} characters`;
        default:
          return rule.message || 'Please enter a valid value';
      }
    });
  }

  private isInputRequired(element: DiscoveredElement, context: DynamicInputContext): boolean {
    // Check HTML required attribute
    if (element.attributes.required) return true;
    
    // Check ARIA required
    if (element.accessibility.ariaRequired) return true;
    
    // Check if it's critical for authentication
    if (element.classification.purpose === 'authentication') return true;
    
    // Check if it's a submit button (usually required for form completion)
    if (element.classification.subType === 'button' && 
        element.element.type === 'submit') return true;
    
    return false;
  }

  private mapElementTypeToInputType(element: DiscoveredElement): any {
    switch (element.classification.subType) {
      case 'email-input': return 'email';
      case 'password-input': return 'password';
      case 'number-input': return 'number';
      case 'textarea': return 'textarea';
      case 'select': return 'select';
      case 'multiselect': return 'multi-select';
      case 'checkbox': return 'checkbox';
      case 'radio-group': return 'radio';
      case 'file-upload': return 'file';
      case 'date-picker': return 'date';
      case 'time-picker': return 'time';
      default: return 'text';
    }
  }

  private mapElementCategoryToInputCategory(element: DiscoveredElement): any {
    switch (element.classification.purpose) {
      case 'authentication': return 'authentication';
      case 'data-entry': return 'form-data';
      case 'search': return 'test-data';
      case 'navigation': return 'configuration';
      default: return 'form-data';
    }
  }

  private generateUserPrompt(element: DiscoveredElement, strategy: InputCollectionStrategy): string {
    const fieldName = this.extractFieldName(element) || 'field';
    return strategy.userPromptTemplate.replace('{fieldName}', fieldName);
  }

  private generateInputDescription(element: DiscoveredElement, context: DynamicInputContext): string {
    const fieldName = this.extractFieldName(element) || 'field';
    const purpose = element.classification.purpose;
    
    let description = `${fieldName} (${element.classification.subType})`;
    
    if (element.attributes.required) {
      description += ' - Required';
    }
    
    if (purpose !== 'unknown') {
      description += ` - ${purpose}`;
    }
    
    return description;
  }

  private extractValidationRules(element: DiscoveredElement): any[] {
    return element.attributes.validation.rules.map(rule => ({
      type: rule.type,
      value: rule.value,
      message: rule.message || `Invalid ${rule.type}`
    }));
  }

  private generateInputOptions(element: DiscoveredElement): any[] | undefined {
    if (element.classification.subType === 'select' || element.classification.subType === 'radio-group') {
      // In a real implementation, you'd extract options from the element
      // For now, return some example options
      return [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
        { value: 'option3', label: 'Option 3' }
      ];
    }
    return undefined;
  }

  private calculateInputPriority(element: DiscoveredElement, context: DynamicInputContext): 'high' | 'medium' | 'low' {
    if (element.priority === 'critical' || element.priority === 'high') return 'high';
    if (element.attributes.required) return 'high';
    if (element.classification.purpose === 'authentication') return 'high';
    if (element.priority === 'medium') return 'medium';
    return 'low';
  }

  private generateInputTags(element: DiscoveredElement, context: DynamicInputContext): string[] {
    const tags: string[] = [];
    
    tags.push(element.classification.category);
    tags.push(element.classification.subType);
    tags.push(element.classification.purpose);
    
    if (element.attributes.required) tags.push('required');
    if (element.accessibility.compliance.score > 80) tags.push('accessible');
    if (element.testability.automationComplexity === 'simple') tags.push('easy-automation');
    
    return tags;
  }

  private determineSecurityLevel(element: DiscoveredElement, options: DynamicInputCollectionOptions): any {
    if (element.classification.purpose === 'authentication') {
      return options.securityMode === 'strict' ? 'restricted' : 'confidential';
    }
    
    if (element.classification.subType === 'password-input') {
      return 'confidential';
    }
    
    if (element.classification.businessFunction === 'security') {
      return 'internal';
    }
    
    return 'public';
  }

  private calculateInputUrgency(element: DiscoveredElement, context: DynamicInputContext): 'critical' | 'high' | 'medium' | 'low' {
    if (element.classification.purpose === 'authentication') return 'critical';
    if (element.attributes.required && element.priority === 'critical') return 'critical';
    if (element.attributes.required) return 'high';
    if (element.priority === 'high') return 'high';
    if (element.priority === 'medium') return 'medium';
    return 'low';
  }

  private findInputDependencies(element: DiscoveredElement, context: DynamicInputContext): string[] {
    const dependencies: string[] = [];
    
    // If this is a confirmation field (like confirm password)
    const fieldName = this.extractFieldName(element)?.toLowerCase() || '';
    if (fieldName.includes('confirm') || fieldName.includes('repeat')) {
      // Look for the original field
      const originalField = context.relatedElements.find(el => 
        this.extractFieldName(el)?.toLowerCase().includes(fieldName.replace(/confirm|repeat/, '').trim())
      );
      if (originalField) {
        dependencies.push(originalField.element.selector);
      }
    }
    
    return dependencies;
  }

  private generateInputRecommendations(
    elements: DiscoveredElement[],
    context: DynamicInputContext,
    options: DynamicInputCollectionOptions
  ): InputRecommendation[] {
    const recommendations: InputRecommendation[] = [];
    
    // Check for elements without test IDs
    const elementsWithoutTestIds = elements.filter(el => 
      !el.element.dataAttributes['data-testid'] && el.priority !== 'ignore'
    );
    
    if (elementsWithoutTestIds.length > 0) {
      recommendations.push({
        type: 'automation',
        priority: 'medium',
        message: `${elementsWithoutTestIds.length} elements lack data-testid attributes`,
        action: 'Add data-testid attributes to improve test reliability',
        impact: 'Better automation stability and maintainability'
      });
    }
    
    // Check for accessibility issues
    const a11yIssues = elements.flatMap(el => el.accessibility.issues);
    if (a11yIssues.length > 0) {
      recommendations.push({
        type: 'user-experience',
        priority: 'high',
        message: `Found ${a11yIssues.length} accessibility issues`,
        action: 'Fix accessibility issues to improve user experience',
        impact: 'Better accessibility and compliance'
      });
    }
    
    return recommendations;
  }

  private calculateOverallPriority(
    requiredInputs: DynamicInputRequest[],
    optionalInputs: DynamicInputRequest[],
    context: DynamicInputContext
  ): 'immediate' | 'high' | 'medium' | 'low' {
    const criticalInputs = requiredInputs.filter(input => input.urgency === 'critical');
    const highInputs = requiredInputs.filter(input => input.urgency === 'high');
    
    if (criticalInputs.length > 0) return 'immediate';
    if (highInputs.length > 2) return 'high';
    if (requiredInputs.length > 0) return 'medium';
    return 'low';
  }

  private async queueInputRequests(
    sessionId: string,
    requiredInputs: DynamicInputRequest[],
    optionalInputs: DynamicInputRequest[]
  ): Promise<void> {
    const queue = this.inputQueue.get(sessionId) || [];
    
    // Add required inputs with higher priority
    for (const input of requiredInputs) {
      queue.push({
        request: input,
        priority: this.calculateQueuePriority(input, true),
        addedAt: Date.now(),
        attempts: 0,
        maxAttempts: 3,
        timeoutAt: input.expiresAt || Date.now() + 60000,
        dependencies: input.dependencies,
        status: input.dependencies.length > 0 ? 'waiting-dependencies' : 'pending'
      });
    }
    
    // Add optional inputs with lower priority
    for (const input of optionalInputs) {
      queue.push({
        request: input,
        priority: this.calculateQueuePriority(input, false),
        addedAt: Date.now(),
        attempts: 0,
        maxAttempts: 2,
        timeoutAt: input.expiresAt || Date.now() + 30000,
        dependencies: input.dependencies,
        status: input.dependencies.length > 0 ? 'waiting-dependencies' : 'pending'
      });
    }
    
    // Sort by priority
    queue.sort((a, b) => b.priority - a.priority);
    
    this.inputQueue.set(sessionId, queue);
  }

  private calculateQueuePriority(input: DynamicInputRequest, isRequired: boolean): number {
    let priority = isRequired ? 100 : 50;
    
    // Urgency bonus
    switch (input.urgency) {
      case 'critical': priority += 50; break;
      case 'high': priority += 30; break;
      case 'medium': priority += 10; break;
      case 'low': break;
    }
    
    // Purpose bonus
    if (input.element.classification.purpose === 'authentication') priority += 25;
    
    // Testability penalty
    if (input.element.testability.automationComplexity === 'complex') priority -= 10;
    
    return priority;
  }

  private async processInputQueue(
    sessionId: string,
    options: DynamicInputCollectionOptions
  ): Promise<void> {
    const queue = this.inputQueue.get(sessionId);
    if (!queue) return;
    
    const activeTasks = queue.filter(item => item.status === 'active');
    const pendingTasks = queue.filter(item => item.status === 'pending');
    
    // Process up to maxConcurrentRequests
    const slotsAvailable = options.maxConcurrentRequests - activeTasks.length;
    const tasksToProcess = pendingTasks.slice(0, slotsAvailable);
    
    for (const task of tasksToProcess) {
      task.status = 'active';
      this.processInputRequest(sessionId, task, options);
    }
    
    // Schedule next processing
    setTimeout(() => this.processInputQueue(sessionId, options), 1000);
  }

  private async processInputRequest(
    sessionId: string,
    queueItem: InputQueueItem,
    options: DynamicInputCollectionOptions
  ): Promise<void> {
    try {
      // Find connected client for this session
      const clientId = this.findClientForSession(sessionId);
      if (!clientId) {
        queueItem.status = 'failed';
        return;
      }
      
      queueItem.clientId = clientId;
      
      // Send input request to client
      await this.sendInputRequest(clientId, queueItem.request);
      
      // Set timeout
      setTimeout(() => {
        if (queueItem.status === 'active') {
          this.handleInputTimeout(sessionId, queueItem, options);
        }
      }, queueItem.timeoutAt - Date.now());
      
    } catch (error) {
      console.error('Failed to process input request:', error);
      queueItem.status = 'failed';
    }
  }

  private findClientForSession(sessionId: string): string | null {
    // Find connected WebSocket client for this session
    // This is a simplified implementation
    const clients = Array.from((this.wsManager as any).clients.values());
    return clients.find((client: any) => client.sessionId === sessionId)?.id || null;
  }

  private async sendInputRequest(clientId: string, request: DynamicInputRequest): Promise<void> {
    const message = {
      type: MessageType.INPUT_REQUEST,
      payload: {
        request: {
          id: request.id,
          type: request.type,
          prompt: request.prompt,
          description: request.description,
          required: request.required,
          category: request.category,
          validationRules: request.validationRules,
          options: request.options,
          defaultValue: request.defaultValue,
          metadata: request.metadata,
          // Dynamic extensions
          urgency: request.urgency,
          alternatives: request.alternatives,
          smartDefaults: request.smartDefaults,
          contextualHelp: request.contextualHelp,
          element: {
            selector: request.element.element.selector,
            type: request.element.classification.subType,
            purpose: request.element.classification.purpose
          }
        },
        context: request.explorationContext
      },
      timestamp: Date.now()
    };
    
    this.wsManager.sendToClient(clientId, message);
  }

  private async handleInputResponse(clientId: string, message: any): Promise<void> {
    const { requestId, value, metadata } = message.payload;
    
    // Find the session and queue item
    let sessionId: string | null = null;
    let queueItem: InputQueueItem | null = null;
    
    for (const [sid, queue] of this.inputQueue) {
      const item = queue.find(item => item.request.id === requestId);
      if (item) {
        sessionId = sid;
        queueItem = item;
        break;
      }
    }
    
    if (!sessionId || !queueItem) {
      console.error('Input response for unknown request:', requestId);
      return;
    }
    
    // Validate the input
    const validationResult = await this.validateInputResponse(queueItem.request, value);
    
    if (validationResult.valid) {
      // Store the collected input
      const collectedInput: CollectedInput = {
        elementSelector: queueItem.request.element.element.selector,
        fieldName: this.extractFieldName(queueItem.request.element) || '',
        fieldType: queueItem.request.type,
        value,
        timestamp: Date.now(),
        confidence: 1.0,
        source: 'user'
      };
      
      const sessionInputs = this.collectedInputs.get(sessionId) || [];
      sessionInputs.push(collectedInput);
      this.collectedInputs.set(sessionId, sessionInputs);
      
      // Mark as completed
      queueItem.status = 'completed';
      
      // Update metrics
      this.updateSessionMetrics(sessionId, 'completed', Date.now() - queueItem.addedAt);
      
      // Send confirmation
      this.sendInputConfirmation(clientId, requestId, validationResult);
      
      // Check for dependent inputs
      this.resolveDependencies(sessionId, queueItem.request.element.element.selector);
      
    } else {
      // Send validation error
      this.sendValidationError(clientId, requestId, validationResult.errors);
      queueItem.attempts++;
      
      if (queueItem.attempts >= queueItem.maxAttempts) {
        queueItem.status = 'failed';
        this.updateSessionMetrics(sessionId, 'failed', 0);
      } else {
        queueItem.status = 'pending'; // Retry
      }
    }
  }

  private async validateInputResponse(request: DynamicInputRequest, value: any): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    // Required check
    if (request.required && (value === null || value === undefined || value === '')) {
      errors.push('This field is required');
    }
    
    // Type-specific validation
    switch (request.type) {
      case 'email':
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push('Please enter a valid email address');
        }
        break;
      case 'number':
        if (value && isNaN(Number(value))) {
          errors.push('Please enter a valid number');
        }
        break;
    }
    
    // Custom validation rules
    for (const rule of request.validationRules) {
      if (rule.type === 'pattern' && value && !new RegExp(rule.value).test(value)) {
        errors.push(rule.message || 'Invalid format');
      }
      if (rule.type === 'minLength' && value && String(value).length < rule.value) {
        errors.push(rule.message || `Minimum length is ${rule.value}`);
      }
      if (rule.type === 'maxLength' && value && String(value).length > rule.value) {
        errors.push(rule.message || `Maximum length is ${rule.value}`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  private sendInputConfirmation(clientId: string, requestId: string, validation: any): void {
    const message = {
      type: 'INPUT_CONFIRMATION',
      payload: {
        requestId,
        success: true,
        message: 'Input received and validated successfully'
      },
      timestamp: Date.now()
    };
    
    this.wsManager.sendToClient(clientId, message);
  }

  private sendValidationError(clientId: string, requestId: string, errors: string[]): void {
    const message = {
      type: MessageType.INPUT_VALIDATION_ERROR,
      payload: {
        requestId,
        errors,
        suggestions: ['Please correct the input and try again']
      },
      timestamp: Date.now()
    };
    
    this.wsManager.sendToClient(clientId, message);
  }

  private resolveDependencies(sessionId: string, completedElementSelector: string): void {
    const queue = this.inputQueue.get(sessionId) || [];
    
    // Find items waiting on this dependency
    const dependentItems = queue.filter(item => 
      item.status === 'waiting-dependencies' && 
      item.dependencies.includes(completedElementSelector)
    );
    
    for (const item of dependentItems) {
      // Remove this dependency
      item.dependencies = item.dependencies.filter(dep => dep !== completedElementSelector);
      
      // If no more dependencies, mark as pending
      if (item.dependencies.length === 0) {
        item.status = 'pending';
      }
    }
  }

  private async handleInputSkip(clientId: string, message: any): Promise<void> {
    const { requestId, reason } = message.payload;
    
    // Find and mark request as skipped
    for (const [sessionId, queue] of this.inputQueue) {
      const item = queue.find(item => item.request.id === requestId);
      if (item) {
        item.status = 'completed'; // Treat skip as completion
        this.updateSessionMetrics(sessionId, 'skipped', 0);
        break;
      }
    }
  }

  private async handleInputAlternative(clientId: string, message: any): Promise<void> {
    const { requestId, alternativeType, value } = message.payload;
    
    // Process the alternative selection
    for (const [sessionId, queue] of this.inputQueue) {
      const item = queue.find(item => item.request.id === requestId);
      if (item) {
        const alternative = item.request.alternatives.find(alt => alt.type === alternativeType);
        if (alternative) {
          // Use the alternative value
          await this.handleInputResponse(clientId, {
            payload: {
              requestId,
              value: value || alternative.value,
              metadata: { source: 'alternative', alternativeType }
            }
          });
        }
        break;
      }
    }
  }

  private handleInputTimeout(
    sessionId: string,
    queueItem: InputQueueItem,
    options: DynamicInputCollectionOptions
  ): void {
    const strategy = this.selectInputStrategy(queueItem.request.element, queueItem.request.explorationContext);
    
    // Apply fallback strategy
    switch (strategy.fallbackStrategy) {
      case 'use-smart-default':
        if (queueItem.request.smartDefaults.length > 0) {
          const defaultValue = queueItem.request.smartDefaults[0].value;
          this.applyFallbackValue(sessionId, queueItem, defaultValue, 'default');
        } else {
          this.markInputAsSkipped(sessionId, queueItem, 'timeout-no-default');
        }
        break;
        
      case 'skip':
        this.markInputAsSkipped(sessionId, queueItem, 'timeout-skip');
        break;
        
      case 'skip-with-warning':
        this.markInputAsSkipped(sessionId, queueItem, 'timeout-warning');
        // Send warning to client
        if (queueItem.clientId) {
          this.sendTimeoutWarning(queueItem.clientId, queueItem.request);
        }
        break;
        
      default:
        queueItem.status = 'failed';
        this.updateSessionMetrics(sessionId, 'failed', 0);
    }
  }

  private applyFallbackValue(sessionId: string, queueItem: InputQueueItem, value: any, source: string): void {
    const collectedInput: CollectedInput = {
      elementSelector: queueItem.request.element.element.selector,
      fieldName: this.extractFieldName(queueItem.request.element) || '',
      fieldType: queueItem.request.type,
      value,
      timestamp: Date.now(),
      confidence: 0.6,
      source: source as any
    };
    
    const sessionInputs = this.collectedInputs.get(sessionId) || [];
    sessionInputs.push(collectedInput);
    this.collectedInputs.set(sessionId, sessionInputs);
    
    queueItem.status = 'completed';
    this.updateSessionMetrics(sessionId, 'completed', 0);
  }

  private markInputAsSkipped(sessionId: string, queueItem: InputQueueItem, reason: string): void {
    queueItem.status = 'completed'; // Treat as completed
    this.updateSessionMetrics(sessionId, 'skipped', 0);
  }

  private sendTimeoutWarning(clientId: string, request: DynamicInputRequest): void {
    const message = {
      type: 'INPUT_TIMEOUT_WARNING',
      payload: {
        requestId: request.id,
        message: `Input request timed out for ${this.extractFieldName(request.element)}`,
        fallbackApplied: true
      },
      timestamp: Date.now()
    };
    
    this.wsManager.sendToClient(clientId, message);
  }

  private handleClientDisconnection(clientId: string): void {
    // Handle disconnected clients
    for (const [sessionId, queue] of this.inputQueue) {
      const activeItems = queue.filter(item => item.clientId === clientId && item.status === 'active');
      for (const item of activeItems) {
        item.status = 'pending'; // Reset to pending for reconnection
        item.clientId = undefined;
      }
    }
  }

  private updateSessionMetrics(sessionId: string, type: 'completed' | 'failed' | 'skipped', responseTime: number): void {
    const metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) return;
    
    switch (type) {
      case 'completed':
        metrics.completedRequests++;
        break;
      case 'failed':
        metrics.failedRequests++;
        break;
      case 'skipped':
        metrics.skippedRequests++;
        break;
    }
    
    if (responseTime > 0) {
      metrics.averageResponseTime = (metrics.averageResponseTime + responseTime) / 2;
    }
    
    metrics.errorRate = metrics.failedRequests / Math.max(1, metrics.totalRequests);
    metrics.automationCoverage = (metrics.completedRequests + metrics.skippedRequests) / Math.max(1, metrics.totalRequests);
  }

  private async getPageTitle(pageId: string): Promise<string> {
    try {
      return await this.puppeteerService.evaluateScript(pageId, 'document.title') || 'Page';
    } catch (error) {
      return 'Page';
    }
  }

  // Public API methods
  async getCollectedInputs(sessionId: string): Promise<CollectedInput[]> {
    return this.collectedInputs.get(sessionId) || [];
  }

  async getSessionContext(sessionId: string): Promise<DynamicInputContext | null> {
    return this.activeSessions.get(sessionId) || null;
  }

  async getSessionMetrics(sessionId: string): Promise<SessionMetrics | null> {
    return this.sessionMetrics.get(sessionId) || null;
  }

  async cancelSession(sessionId: string): Promise<void> {
    // Cancel all pending requests
    const queue = this.inputQueue.get(sessionId) || [];
    queue.forEach(item => {
      if (item.status === 'active' || item.status === 'pending') {
        item.status = 'cancelled';
      }
    });

    // Clean up
    this.activeSessions.delete(sessionId);
    this.inputQueue.delete(sessionId);
    // Keep collected inputs and metrics for later analysis
  }

  async updateSessionContext(sessionId: string, updates: Partial<DynamicInputContext>): Promise<void> {
    const context = this.activeSessions.get(sessionId);
    if (context) {
      Object.assign(context, updates);
      this.activeSessions.set(sessionId, context);
    }
  }
}