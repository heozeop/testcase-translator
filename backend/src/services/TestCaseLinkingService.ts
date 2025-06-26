import { InputRequest, InputResponse } from './InputCollectionService';
import { TestCase, TestStep } from '../types/TestCase';

export interface InputMapping {
  inputId: string;
  testCaseId: string;
  scenarioId?: string;
  stepNumber?: number;
  fieldMapping: {
    selector: string;
    action: 'fill' | 'select' | 'check' | 'click';
    preprocessor?: 'none' | 'encrypt' | 'hash' | 'format' | 'transform';
    validation?: string[];
  };
  conditions?: {
    dependsOn?: string[];
    requiredFor?: string[];
    skipIf?: string;
  };
}

export interface TestCaseContext {
  testCaseId: string;
  scenarioName: string;
  stepIndex: number;
  currentStep: TestStep;
  previousSteps: TestStep[];
  nextSteps: TestStep[];
  globalContext: Record<string, any>;
}

export interface InputPreprocessor {
  name: string;
  description: string;
  process: (value: any, context: TestCaseContext) => Promise<any>;
  applicableTypes: string[];
}

export interface LinkedTestData {
  testCaseId: string;
  scenarioId?: string;
  inputs: Record<string, {
    originalValue: any;
    processedValue: any;
    mapping: InputMapping;
    metadata: {
      collectedAt: Date;
      source: string;
      confidence: number;
    };
  }>;
  generatedSteps: TestStep[];
  executionPlan: {
    order: number[];
    dependencies: Record<number, number[]>;
    conditions: Record<number, string>;
  };
}

export interface TestDataTemplate {
  templateId: string;
  name: string;
  description: string;
  category: string;
  inputMappings: InputMapping[];
  testStepTemplate: string;
  variables: Record<string, any>;
}

export class TestCaseLinkingService {
  private inputMappings: Map<string, InputMapping> = new Map();
  private preprocessors: Map<string, InputPreprocessor> = new Map();
  private testDataTemplates: Map<string, TestDataTemplate> = new Map();
  private linkedTestData: Map<string, LinkedTestData> = new Map();

  constructor() {
    this.initializeDefaultPreprocessors();
    this.initializeDefaultTemplates();
  }

  async linkInputsToTestCase(
    testCase: TestCase,
    collectedInputs: Record<string, InputResponse>,
    inputRequests: Record<string, InputRequest>
  ): Promise<LinkedTestData> {
    const linkedData: LinkedTestData = {
      testCaseId: testCase.id,
      scenarioId: testCase.scenarios?.[0]?.id,
      inputs: {},
      generatedSteps: [],
      executionPlan: {
        order: [],
        dependencies: {},
        conditions: {}
      }
    };

    // Process each collected input
    for (const [inputId, response] of Object.entries(collectedInputs)) {
      const request = inputRequests[inputId];
      if (!request) continue;

      // Find or create input mapping
      let mapping = this.inputMappings.get(inputId);
      if (!mapping) {
        mapping = await this.createInputMapping(request, testCase);
        this.inputMappings.set(inputId, mapping);
      }

      // Preprocess the input value
      const processedValue = await this.preprocessInput(
        response.value,
        mapping,
        this.createTestContext(testCase, mapping)
      );

      linkedData.inputs[inputId] = {
        originalValue: response.value,
        processedValue,
        mapping,
        metadata: {
          collectedAt: new Date(response.timestamp),
          source: request.metadata.source,
          confidence: 1.0 // Could be calculated based on validation results
        }
      };
    }

    // Generate test steps from inputs
    linkedData.generatedSteps = await this.generateTestSteps(linkedData, testCase);

    // Create execution plan
    linkedData.executionPlan = await this.createExecutionPlan(linkedData);

    // Store linked data
    this.linkedTestData.set(testCase.id, linkedData);

    return linkedData;
  }

  async createInputMapping(
    request: InputRequest,
    testCase: TestCase
  ): Promise<InputMapping> {
    const mapping: InputMapping = {
      inputId: request.id,
      testCaseId: testCase.id,
      scenarioId: request.context.scenarioId,
      stepNumber: request.context.stepNumber,
      fieldMapping: {
        selector: request.context.elementSelector || this.inferSelector(request),
        action: this.inferAction(request),
        preprocessor: this.inferPreprocessor(request),
        validation: this.inferValidations(request)
      },
      conditions: {
        dependsOn: request.context.relatedInputs,
        requiredFor: this.findDependentInputs(request, testCase),
        skipIf: this.inferSkipCondition(request)
      }
    };

    return mapping;
  }

  private async preprocessInput(
    value: any,
    mapping: InputMapping,
    context: TestCaseContext
  ): Promise<any> {
    const preprocessorName = mapping.fieldMapping.preprocessor || 'none';
    
    if (preprocessorName === 'none') {
      return value;
    }

    const preprocessor = this.preprocessors.get(preprocessorName);
    if (!preprocessor) {
      console.warn(`Preprocessor ${preprocessorName} not found, using original value`);
      return value;
    }

    try {
      return await preprocessor.process(value, context);
    } catch (error) {
      console.error(`Preprocessing failed for ${preprocessorName}:`, error);
      return value;
    }
  }

  private async generateTestSteps(
    linkedData: LinkedTestData,
    testCase: TestCase
  ): Promise<TestStep[]> {
    const steps: TestStep[] = [];
    const inputsByStep = this.groupInputsByStep(linkedData);

    for (const [stepNumber, stepInputs] of inputsByStep) {
      // Find the original test step or create a new one
      const originalStep = testCase.steps?.find(s => s.step === stepNumber);
      
      if (originalStep) {
        // Enhance existing step with input data
        const enhancedStep = await this.enhanceStepWithInputs(originalStep, stepInputs);
        steps.push(enhancedStep);
      } else {
        // Create new step from inputs
        const newStep = await this.createStepFromInputs(stepNumber, stepInputs);
        if (newStep) steps.push(newStep);
      }
    }

    // Sort steps by step number
    return steps.sort((a, b) => a.step - b.step);
  }

  private async enhanceStepWithInputs(
    originalStep: TestStep,
    stepInputs: Array<{ inputId: string; data: any }>
  ): Promise<TestStep> {
    const enhancedStep: TestStep = { ...originalStep };

    // Replace placeholders in step description and action
    for (const { inputId, data } of stepInputs) {
      const placeholder = `{${inputId}}`;
      const value = data.processedValue;

      if (enhancedStep.description.includes(placeholder)) {
        enhancedStep.description = enhancedStep.description.replace(placeholder, value);
      }

      if (enhancedStep.action.includes(placeholder)) {
        enhancedStep.action = enhancedStep.action.replace(placeholder, value);
      }

      // Add to test data
      if (!enhancedStep.testData) {
        enhancedStep.testData = {};
      }
      enhancedStep.testData[inputId] = value;
    }

    return enhancedStep;
  }

  private async createStepFromInputs(
    stepNumber: number,
    stepInputs: Array<{ inputId: string; data: any }>
  ): Promise<TestStep | null> {
    if (stepInputs.length === 0) return null;

    // Group inputs by action type
    const fillInputs = stepInputs.filter(i => i.data.mapping.fieldMapping.action === 'fill');
    const clickInputs = stepInputs.filter(i => i.data.mapping.fieldMapping.action === 'click');
    const selectInputs = stepInputs.filter(i => i.data.mapping.fieldMapping.action === 'select');

    let description = '';
    let action = '';
    const testData: Record<string, any> = {};

    // Build step description and action
    if (fillInputs.length > 0) {
      const fieldNames = fillInputs.map(i => this.getFieldName(i.data.mapping));
      description += `Fill in ${fieldNames.join(', ')}`;
      
      for (const input of fillInputs) {
        const selector = input.data.mapping.fieldMapping.selector;
        action += `cy.get('${selector}').type('${input.data.processedValue}');\n`;
        testData[input.inputId] = input.data.processedValue;
      }
    }

    if (selectInputs.length > 0) {
      const fieldNames = selectInputs.map(i => this.getFieldName(i.data.mapping));
      if (description) description += ' and ';
      description += `Select ${fieldNames.join(', ')}`;
      
      for (const input of selectInputs) {
        const selector = input.data.mapping.fieldMapping.selector;
        action += `cy.get('${selector}').select('${input.data.processedValue}');\n`;
        testData[input.inputId] = input.data.processedValue;
      }
    }

    if (clickInputs.length > 0) {
      const fieldNames = clickInputs.map(i => this.getFieldName(i.data.mapping));
      if (description) description += ' and ';
      description += `Click ${fieldNames.join(', ')}`;
      
      for (const input of clickInputs) {
        const selector = input.data.mapping.fieldMapping.selector;
        action += `cy.get('${selector}').click();\n`;
        testData[input.inputId] = input.data.processedValue;
      }
    }

    return {
      step: stepNumber,
      description,
      action: action.trim(),
      expectedResult: 'Action should complete successfully',
      testData
    };
  }

  private async createExecutionPlan(linkedData: LinkedTestData): Promise<{
    order: number[];
    dependencies: Record<number, number[]>;
    conditions: Record<number, string>;
  }> {
    const plan = {
      order: [] as number[],
      dependencies: {} as Record<number, number[]>,
      conditions: {} as Record<number, string>
    };

    // Extract step numbers and sort them
    const stepNumbers = linkedData.generatedSteps.map(s => s.step).sort((a, b) => a - b);
    plan.order = stepNumbers;

    // Analyze dependencies between steps
    for (const step of linkedData.generatedSteps) {
      const stepDeps: number[] = [];
      
      // Find inputs that this step depends on
      const stepInputs = Object.values(linkedData.inputs).filter(
        input => input.mapping.stepNumber === step.step
      );

      for (const input of stepInputs) {
        if (input.mapping.conditions?.dependsOn) {
          for (const depInputId of input.mapping.conditions.dependsOn) {
            const depInput = linkedData.inputs[depInputId];
            if (depInput && depInput.mapping.stepNumber !== undefined) {
              stepDeps.push(depInput.mapping.stepNumber);
            }
          }
        }
      }

      if (stepDeps.length > 0) {
        plan.dependencies[step.step] = [...new Set(stepDeps)];
      }

      // Check for conditional execution
      const skipConditions = stepInputs
        .map(input => input.mapping.conditions?.skipIf)
        .filter(condition => condition);
      
      if (skipConditions.length > 0) {
        plan.conditions[step.step] = skipConditions.join(' || ');
      }
    }

    return plan;
  }

  private groupInputsByStep(linkedData: LinkedTestData): Map<number, Array<{ inputId: string; data: any }>> {
    const stepGroups = new Map<number, Array<{ inputId: string; data: any }>>();

    for (const [inputId, inputData] of Object.entries(linkedData.inputs)) {
      const stepNumber = inputData.mapping.stepNumber || 1;
      
      if (!stepGroups.has(stepNumber)) {
        stepGroups.set(stepNumber, []);
      }
      
      stepGroups.get(stepNumber)!.push({ inputId, data: inputData });
    }

    return stepGroups;
  }

  private createTestContext(testCase: TestCase, mapping: InputMapping): TestCaseContext {
    const stepIndex = mapping.stepNumber || 0;
    const currentStep = testCase.steps?.[stepIndex];
    
    return {
      testCaseId: testCase.id,
      scenarioName: testCase.scenario_name || 'Default Scenario',
      stepIndex,
      currentStep: currentStep || {
        step: stepIndex,
        description: 'Auto-generated step',
        action: '',
        expectedResult: ''
      },
      previousSteps: testCase.steps?.slice(0, stepIndex) || [],
      nextSteps: testCase.steps?.slice(stepIndex + 1) || [],
      globalContext: {}
    };
  }

  private inferSelector(request: InputRequest): string {
    if (request.context.elementSelector) {
      return request.context.elementSelector;
    }

    // Generate selector based on field information
    if (request.metadata.tags.includes('email')) {
      return 'input[type="email"], input[name*="email"], #email';
    }
    
    if (request.metadata.tags.includes('password')) {
      return 'input[type="password"], input[name*="password"], #password';
    }

    // Default selector
    return `input[name="${request.id}"]`;
  }

  private inferAction(request: InputRequest): 'fill' | 'select' | 'check' | 'click' {
    switch (request.type) {
      case 'select':
      case 'multi-select':
        return 'select';
      case 'checkbox':
      case 'radio':
        return 'check';
      case 'text':
      case 'email':
      case 'password':
      case 'number':
      case 'textarea':
        return 'fill';
      default:
        return 'fill';
    }
  }

  private inferPreprocessor(request: InputRequest): 'none' | 'encrypt' | 'hash' | 'format' | 'transform' {
    if (request.metadata.securityLevel === 'restricted') {
      return 'encrypt';
    }
    
    if (request.type === 'password') {
      return 'hash';
    }
    
    if (request.type === 'email' || request.type === 'phone') {
      return 'format';
    }
    
    return 'none';
  }

  private inferValidations(request: InputRequest): string[] {
    const validations: string[] = [];
    
    if (request.required) {
      validations.push('should.not.be.empty');
    }
    
    if (request.type === 'email') {
      validations.push('should.contain', '@');
    }
    
    return validations;
  }

  private findDependentInputs(request: InputRequest, testCase: TestCase): string[] {
    // Simple heuristic: find inputs that might depend on this one
    const dependents: string[] = [];
    
    if (request.category === 'authentication' && request.type === 'password') {
      // Password confirmation might depend on this
      dependents.push('password-confirm');
    }
    
    return dependents;
  }

  private inferSkipCondition(request: InputRequest): string | undefined {
    if (!request.required) {
      return 'optional-field-skip';
    }
    
    return undefined;
  }

  private getFieldName(mapping: InputMapping): string {
    // Extract field name from selector
    const selector = mapping.fieldMapping.selector;
    
    // Try to extract from name attribute
    const nameMatch = selector.match(/name="([^"]+)"/);
    if (nameMatch) return nameMatch[1];
    
    // Try to extract from id
    const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) return idMatch[1];
    
    // Default
    return 'field';
  }

  private initializeDefaultPreprocessors(): void {
    // None preprocessor
    this.preprocessors.set('none', {
      name: 'None',
      description: 'No preprocessing applied',
      applicableTypes: ['*'],
      process: async (value: any) => value
    });

    // Format preprocessor
    this.preprocessors.set('format', {
      name: 'Format',
      description: 'Apply standard formatting',
      applicableTypes: ['email', 'phone', 'text'],
      process: async (value: any) => {
        if (typeof value === 'string') {
          return value.trim().toLowerCase();
        }
        return value;
      }
    });

    // Hash preprocessor (for passwords)
    this.preprocessors.set('hash', {
      name: 'Hash',
      description: 'Hash sensitive values',
      applicableTypes: ['password'],
      process: async (value: any) => {
        // In a real implementation, you'd use a proper hashing function
        // For test data, we might want to keep it as-is or use a reversible encoding
        return value; // Keep original for test execution
      }
    });

    // Transform preprocessor
    this.preprocessors.set('transform', {
      name: 'Transform',
      description: 'Apply custom transformations',
      applicableTypes: ['*'],
      process: async (value: any, context: TestCaseContext) => {
        // Apply context-specific transformations
        if (context.testCaseId.includes('admin') && typeof value === 'string') {
          return `admin_${value}`;
        }
        return value;
      }
    });
  }

  private initializeDefaultTemplates(): void {
    // Login form template
    this.testDataTemplates.set('login-form', {
      templateId: 'login-form',
      name: 'Login Form',
      description: 'Standard login form with username/email and password',
      category: 'authentication',
      inputMappings: [
        {
          inputId: 'username',
          testCaseId: '{testCaseId}',
          fieldMapping: {
            selector: 'input[name="username"], input[type="email"]',
            action: 'fill',
            preprocessor: 'format'
          }
        },
        {
          inputId: 'password',
          testCaseId: '{testCaseId}',
          fieldMapping: {
            selector: 'input[type="password"]',
            action: 'fill',
            preprocessor: 'none'
          }
        }
      ],
      testStepTemplate: 'Fill in login credentials and submit',
      variables: {
        submitSelector: 'button[type="submit"], input[type="submit"]'
      }
    });

    // Contact form template
    this.testDataTemplates.set('contact-form', {
      templateId: 'contact-form',
      name: 'Contact Form',
      description: 'Standard contact form with name, email, and message',
      category: 'form-data',
      inputMappings: [
        {
          inputId: 'name',
          testCaseId: '{testCaseId}',
          fieldMapping: {
            selector: 'input[name="name"], #name',
            action: 'fill',
            preprocessor: 'format'
          }
        },
        {
          inputId: 'email',
          testCaseId: '{testCaseId}',
          fieldMapping: {
            selector: 'input[type="email"], input[name="email"]',
            action: 'fill',
            preprocessor: 'format'
          }
        },
        {
          inputId: 'message',
          testCaseId: '{testCaseId}',
          fieldMapping: {
            selector: 'textarea[name="message"], #message',
            action: 'fill',
            preprocessor: 'none'
          }
        }
      ],
      testStepTemplate: 'Fill out contact form and submit',
      variables: {
        submitSelector: 'button[type="submit"]'
      }
    });
  }

  // Public API methods
  getLinkedTestData(testCaseId: string): LinkedTestData | undefined {
    return this.linkedTestData.get(testCaseId);
  }

  getAllLinkedTestData(): Map<string, LinkedTestData> {
    return new Map(this.linkedTestData);
  }

  generateCypressScript(testCaseId: string): string {
    const linkedData = this.linkedTestData.get(testCaseId);
    if (!linkedData) {
      throw new Error(`No linked test data found for test case ${testCaseId}`);
    }

    let script = `describe('Test Case ${testCaseId}', () => {\n`;
    script += `  it('should execute test scenario', () => {\n`;

    for (const step of linkedData.generatedSteps) {
      script += `    // Step ${step.step}: ${step.description}\n`;
      script += `    ${step.action.split('\n').map(line => '    ' + line).join('\n')}\n`;
      script += `    // Expected: ${step.expectedResult}\n\n`;
    }

    script += `  });\n`;
    script += `});\n`;

    return script;
  }

  exportTestData(testCaseId: string, format: 'json' | 'csv' | 'yaml' = 'json'): string {
    const linkedData = this.linkedTestData.get(testCaseId);
    if (!linkedData) {
      throw new Error(`No linked test data found for test case ${testCaseId}`);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(linkedData, null, 2);
      
      case 'csv':
        // Convert to CSV format
        let csv = 'Input ID,Original Value,Processed Value,Step Number,Action,Selector\n';
        for (const [inputId, inputData] of Object.entries(linkedData.inputs)) {
          csv += `"${inputId}","${inputData.originalValue}","${inputData.processedValue}",`;
          csv += `"${inputData.mapping.stepNumber}","${inputData.mapping.fieldMapping.action}",`;
          csv += `"${inputData.mapping.fieldMapping.selector}"\n`;
        }
        return csv;
      
      case 'yaml':
        // Simple YAML conversion (would use a proper YAML library in production)
        let yaml = `testCaseId: ${linkedData.testCaseId}\n`;
        yaml += `inputs:\n`;
        for (const [inputId, inputData] of Object.entries(linkedData.inputs)) {
          yaml += `  ${inputId}:\n`;
          yaml += `    originalValue: "${inputData.originalValue}"\n`;
          yaml += `    processedValue: "${inputData.processedValue}"\n`;
          yaml += `    stepNumber: ${inputData.mapping.stepNumber}\n`;
        }
        return yaml;
      
      default:
        return JSON.stringify(linkedData, null, 2);
    }
  }

  registerPreprocessor(preprocessor: InputPreprocessor): void {
    this.preprocessors.set(preprocessor.name, preprocessor);
  }

  registerTestDataTemplate(template: TestDataTemplate): void {
    this.testDataTemplates.set(template.templateId, template);
  }

  applyTemplate(templateId: string, testCaseId: string): InputMapping[] {
    const template = this.testDataTemplates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return template.inputMappings.map(mapping => ({
      ...mapping,
      testCaseId: mapping.testCaseId.replace('{testCaseId}', testCaseId)
    }));
  }

  getInputMappings(testCaseId: string): InputMapping[] {
    return Array.from(this.inputMappings.values())
      .filter(mapping => mapping.testCaseId === testCaseId);
  }

  updateInputMapping(inputId: string, updates: Partial<InputMapping>): boolean {
    const existing = this.inputMappings.get(inputId);
    if (!existing) return false;

    this.inputMappings.set(inputId, { ...existing, ...updates });
    return true;
  }

  removeInputMapping(inputId: string): boolean {
    return this.inputMappings.delete(inputId);
  }
}