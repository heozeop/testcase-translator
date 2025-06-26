import { TestCase } from '../types/TestCase';
import { LinkedTestData } from './TestCaseLinkingService';
import { PageAnalysis } from './PuppeteerService';
import { ExplorationResult } from './PageExplorationService';

export interface CypressGenerationOptions {
  includeSetup?: boolean;
  includeTeardown?: boolean;
  usePageObjects?: boolean;
  includeDataTables?: boolean;
  includeAssertions?: boolean;
  targetDirectory?: string;
  fileNaming?: 'kebab-case' | 'camelCase' | 'snake_case';
  includeComments?: boolean;
  cypressVersion?: '12' | '13' | 'latest';
  customCommands?: string[];
  viewport?: { width: number; height: number };
  baseUrl?: string;
}

export interface GeneratedScript {
  fileName: string;
  filePath: string;
  content: string;
  metadata: {
    testCaseId: string;
    generatedAt: Date;
    testSteps: number;
    assertions: number;
    pageObjects?: string[];
    dependencies: string[];
  };
}

export interface ScriptTemplate {
  name: string;
  description: string;
  template: string;
  variables: Record<string, any>;
  requiredData: string[];
}

export interface CypressCommand {
  command: string;
  target?: string;
  value?: string;
  options?: Record<string, any>;
  description?: string;
  timeout?: number;
}

export interface PageObjectModel {
  className: string;
  fileName: string;
  selectors: Record<string, string>;
  methods: Record<string, string>;
  properties: Record<string, any>;
}

export class CypressScriptGenerator {
  private templates: Map<string, ScriptTemplate> = new Map();
  private pageObjects: Map<string, PageObjectModel> = new Map();
  private customCommands: Map<string, string> = new Map();
  private generatedScripts: Map<string, GeneratedScript> = new Map();
  private options: Required<CypressGenerationOptions>;

  constructor(options: CypressGenerationOptions = {}) {
    this.options = {
      includeSetup: true,
      includeTeardown: true,
      usePageObjects: false,
      includeDataTables: true,
      includeAssertions: true,
      targetDirectory: './cypress/e2e',
      fileNaming: 'kebab-case',
      includeComments: true,
      cypressVersion: 'latest',
      customCommands: [],
      viewport: { width: 1280, height: 720 },
      baseUrl: undefined,
      ...options
    };

    this.initializeDefaultTemplates();
    this.initializeCustomCommands();
  }

  async generateScript(
    testCase: TestCase,
    linkedData: LinkedTestData,
    explorationResult: ExplorationResult,
    pageAnalysis: PageAnalysis
  ): Promise<GeneratedScript> {
    const fileName = this.generateFileName(testCase);
    const filePath = `${this.options.targetDirectory}/${fileName}`;

    // Generate script content
    const content = await this.buildScriptContent(
      testCase,
      linkedData,
      explorationResult,
      pageAnalysis
    );

    // Create metadata
    const metadata = {
      testCaseId: testCase.id,
      generatedAt: new Date(),
      testSteps: linkedData.generatedSteps.length,
      assertions: this.countAssertions(content),
      pageObjects: this.options.usePageObjects ? this.extractPageObjects(pageAnalysis) : undefined,
      dependencies: this.extractDependencies(content)
    };

    const script: GeneratedScript = {
      fileName,
      filePath,
      content,
      metadata
    };

    // Store generated script
    this.generatedScripts.set(testCase.id, script);

    return script;
  }

  async generateMultipleScripts(
    testCases: TestCase[],
    linkedDataMap: Map<string, LinkedTestData>,
    explorationResults: Map<string, ExplorationResult>,
    pageAnalyses: Map<string, PageAnalysis>
  ): Promise<GeneratedScript[]> {
    const scripts: GeneratedScript[] = [];

    for (const testCase of testCases) {
      const linkedData = linkedDataMap.get(testCase.id);
      const explorationResult = explorationResults.get(testCase.id);
      const pageAnalysis = pageAnalyses.get(testCase.id);

      if (linkedData && explorationResult && pageAnalysis) {
        try {
          const script = await this.generateScript(
            testCase,
            linkedData,
            explorationResult,
            pageAnalysis
          );
          scripts.push(script);
        } catch (error) {
          console.error(`Failed to generate script for test case ${testCase.id}:`, error);
        }
      }
    }

    return scripts;
  }

  private async buildScriptContent(
    testCase: TestCase,
    linkedData: LinkedTestData,
    explorationResult: ExplorationResult,
    pageAnalysis: PageAnalysis
  ): Promise<string> {
    let content = '';

    // Add file header
    content += this.generateFileHeader(testCase);

    // Add imports and dependencies
    content += this.generateImports(linkedData, pageAnalysis);

    // Add test data
    if (this.options.includeDataTables) {
      content += this.generateTestData(linkedData);
    }

    // Add main describe block
    content += this.generateDescribeBlock(testCase, linkedData, explorationResult, pageAnalysis);

    // Add helper functions if needed
    content += this.generateHelperFunctions(linkedData, pageAnalysis);

    return content;
  }

  private generateFileHeader(testCase: TestCase): string {
    if (!this.options.includeComments) return '';

    return `/**
 * Cypress Test: ${testCase.scenario_name || testCase.id}
 * Generated: ${new Date().toISOString()}
 * Description: ${testCase.description || 'Auto-generated test case'}
 * 
 * This file was automatically generated by the Testcase Translator.
 * Manual modifications may be overwritten on regeneration.
 */

`;
  }

  private generateImports(linkedData: LinkedTestData, pageAnalysis: PageAnalysis): string {
    let imports = '';

    // Custom commands
    if (this.options.customCommands.length > 0) {
      imports += `// Custom commands\n`;
      imports += `import '../support/commands';\n\n`;
    }

    // Page objects
    if (this.options.usePageObjects) {
      const pageObjectNames = this.extractPageObjects(pageAnalysis);
      for (const pageObjectName of pageObjectNames) {
        imports += `import { ${pageObjectName} } from '../support/pageObjects/${pageObjectName.toLowerCase()}';\n`;
      }
      if (pageObjectNames.length > 0) imports += '\n';
    }

    // Test data imports
    if (this.options.includeDataTables && Object.keys(linkedData.inputs).length > 0) {
      imports += `// Test data\n`;
      imports += `import testData from '../fixtures/${this.generateTestDataFileName(linkedData.testCaseId)}';\n\n`;
    }

    return imports;
  }

  private generateTestData(linkedData: LinkedTestData): string {
    if (Object.keys(linkedData.inputs).length === 0) return '';

    let testData = `// Test Data\n`;
    testData += `const testData = {\n`;

    for (const [inputId, inputData] of Object.entries(linkedData.inputs)) {
      const cleanInputId = this.cleanVariableName(inputId);
      testData += `  ${cleanInputId}: '${this.escapeString(inputData.processedValue)}',\n`;
    }

    testData += `};\n\n`;
    return testData;
  }

  private generateDescribeBlock(
    testCase: TestCase,
    linkedData: LinkedTestData,
    explorationResult: ExplorationResult,
    pageAnalysis: PageAnalysis
  ): string {
    const testName = testCase.scenario_name || `Test Case ${testCase.id}`;
    let content = `describe('${testName}', () => {\n`;

    // Add setup
    if (this.options.includeSetup) {
      content += this.generateSetup(pageAnalysis);
    }

    // Add main test
    content += this.generateMainTest(testCase, linkedData, explorationResult, pageAnalysis);

    // Add teardown
    if (this.options.includeTeardown) {
      content += this.generateTeardown();
    }

    content += `});\n`;
    return content;
  }

  private generateSetup(pageAnalysis: PageAnalysis): string {
    let setup = `\n  beforeEach(() => {\n`;
    
    // Set viewport
    setup += `    cy.viewport(${this.options.viewport.width}, ${this.options.viewport.height});\n`;
    
    // Visit page
    if (this.options.baseUrl) {
      setup += `    cy.visit('${pageAnalysis.url.replace(this.options.baseUrl, '')}');\n`;
    } else {
      setup += `    cy.visit('${pageAnalysis.url}');\n`;
    }
    
    // Wait for page load
    setup += `    cy.get('body').should('be.visible');\n`;
    
    // Additional setup based on page analysis
    if (pageAnalysis.forms.length > 0) {
      setup += `    // Wait for forms to load\n`;
      setup += `    cy.get('form').should('be.visible');\n`;
    }
    
    setup += `  });\n`;
    return setup;
  }

  private generateMainTest(
    testCase: TestCase,
    linkedData: LinkedTestData,
    explorationResult: ExplorationResult,
    pageAnalysis: PageAnalysis
  ): string {
    const testDescription = testCase.description || 'should execute test scenario successfully';
    let test = `\n  it('${testDescription}', () => {\n`;

    // Generate steps from linked data
    for (const step of linkedData.generatedSteps) {
      test += this.generateTestStep(step, linkedData, pageAnalysis);
    }

    // Add final assertions
    if (this.options.includeAssertions) {
      test += this.generateFinalAssertions(testCase, pageAnalysis);
    }

    test += `  });\n`;
    return test;
  }

  private generateTestStep(
    step: any,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis
  ): string {
    let stepCode = `\n    // Step ${step.step}: ${step.description}\n`;

    // Add step-specific inputs
    const stepInputs = Object.entries(linkedData.inputs).filter(
      ([_, inputData]) => inputData.mapping.stepNumber === step.step
    );

    for (const [inputId, inputData] of stepInputs) {
      stepCode += this.generateInputAction(inputData, pageAnalysis);
    }

    // Add step assertions
    if (step.expectedResult && this.options.includeAssertions) {
      stepCode += this.generateStepAssertion(step);
    }

    // Add wait conditions
    stepCode += this.generateWaitConditions(step, pageAnalysis);

    return stepCode;
  }

  private generateInputAction(inputData: any, pageAnalysis: PageAnalysis): string {
    const mapping = inputData.mapping;
    const selector = mapping.fieldMapping.selector;
    const action = mapping.fieldMapping.action;
    const value = inputData.processedValue;

    let actionCode = '';

    // Add element visibility check
    actionCode += `    cy.get('${selector}').should('be.visible');\n`;

    switch (action) {
      case 'fill':
        if (mapping.fieldMapping.preprocessor === 'clear-first') {
          actionCode += `    cy.get('${selector}').clear();\n`;
        }
        actionCode += `    cy.get('${selector}').type('${this.escapeString(value)}');\n`;
        break;

      case 'select':
        actionCode += `    cy.get('${selector}').select('${this.escapeString(value)}');\n`;
        break;

      case 'check':
        if (value === true || value === 'true') {
          actionCode += `    cy.get('${selector}').check();\n`;
        } else {
          actionCode += `    cy.get('${selector}').uncheck();\n`;
        }
        break;

      case 'click':
        actionCode += `    cy.get('${selector}').click();\n`;
        break;

      default:
        actionCode += `    // Unknown action: ${action}\n`;
        actionCode += `    cy.get('${selector}').type('${this.escapeString(value)}');\n`;
    }

    // Add field-specific validation
    if (mapping.fieldMapping.validation && mapping.fieldMapping.validation.length > 0) {
      for (const validation of mapping.fieldMapping.validation) {
        actionCode += `    cy.get('${selector}').${validation};\n`;
      }
    }

    return actionCode;
  }

  private generateStepAssertion(step: any): string {
    let assertion = `    // Verify: ${step.expectedResult}\n`;
    
    // Generate appropriate assertion based on step type
    if (step.description.toLowerCase().includes('submit')) {
      assertion += `    cy.url().should('not.contain', 'error');\n`;
    } else if (step.description.toLowerCase().includes('login')) {
      assertion += `    cy.url().should('not.contain', 'login');\n`;
    } else {
      assertion += `    cy.get('body').should('contain', 'success').or('not.contain', 'error');\n`;
    }

    return assertion;
  }

  private generateWaitConditions(step: any, pageAnalysis: PageAnalysis): string {
    let waitCode = '';

    // Add common wait conditions
    if (step.description.toLowerCase().includes('submit')) {
      waitCode += `    cy.wait(1000); // Wait for form submission\n`;
    }

    if (step.description.toLowerCase().includes('load')) {
      waitCode += `    cy.get('body').should('be.visible');\n`;
    }

    return waitCode;
  }

  private generateFinalAssertions(testCase: TestCase, pageAnalysis: PageAnalysis): string {
    let assertions = `\n    // Final assertions\n`;
    
    // Page-specific assertions
    assertions += `    cy.url().should('include', '${new URL(pageAnalysis.url).pathname}');\n`;
    assertions += `    cy.get('body').should('be.visible');\n`;
    
    // Test case specific assertions
    if (testCase.expected_results && testCase.expected_results.length > 0) {
      for (const expectedResult of testCase.expected_results) {
        assertions += `    // ${expectedResult}\n`;
        assertions += `    cy.get('body').should('contain.text', '${this.extractKeywords(expectedResult)}');\n`;
      }
    }

    return assertions;
  }

  private generateTeardown(): string {
    let teardown = `\n  afterEach(() => {\n`;
    teardown += `    // Cleanup after test\n`;
    teardown += `    cy.clearCookies();\n`;
    teardown += `    cy.clearLocalStorage();\n`;
    teardown += `  });\n`;
    return teardown;
  }

  private generateHelperFunctions(linkedData: LinkedTestData, pageAnalysis: PageAnalysis): string {
    let helpers = '';

    // Generate form filling helper if multiple forms
    if (pageAnalysis.forms.length > 1) {
      helpers += `\n// Helper function for form filling\n`;
      helpers += `function fillForm(formSelector, data) {\n`;
      helpers += `  cy.get(formSelector).within(() => {\n`;
      helpers += `    Object.entries(data).forEach(([field, value]) => {\n`;
      helpers += `      cy.get(\`[name="\${field}"], #\${field}\`).type(value);\n`;
      helpers += `    });\n`;
      helpers += `  });\n`;
      helpers += `}\n`;
    }

    // Generate navigation helper
    helpers += `\n// Helper function for navigation\n`;
    helpers += `function waitForPageLoad() {\n`;
    helpers += `  cy.get('body').should('be.visible');\n`;
    helpers += `  cy.get('.loading, .spinner').should('not.exist');\n`;
    helpers += `}\n`;

    return helpers;
  }

  // Utility methods
  private generateFileName(testCase: TestCase): string {
    const baseName = testCase.scenario_name || testCase.id || 'test';
    const cleanName = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    switch (this.options.fileNaming) {
      case 'kebab-case':
        return `${cleanName}.cy.js`;
      case 'camelCase':
        return `${this.toCamelCase(cleanName)}.cy.js`;
      case 'snake_case':
        return `${cleanName.replace(/-/g, '_')}.cy.js`;
      default:
        return `${cleanName}.cy.js`;
    }
  }

  private generateTestDataFileName(testCaseId: string): string {
    return `${testCaseId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-data.json`;
  }

  private cleanVariableName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  }

  private escapeString(value: any): string {
    if (typeof value !== 'string') {
      value = String(value);
    }
    return value.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }

  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  private countAssertions(content: string): number {
    const assertionPatterns = /cy\.(should|expect|assert)/g;
    const matches = content.match(assertionPatterns);
    return matches ? matches.length : 0;
  }

  private extractPageObjects(pageAnalysis: PageAnalysis): string[] {
    const pageObjects: string[] = [];
    
    // Generate page object names based on URL
    const urlPath = new URL(pageAnalysis.url).pathname;
    const pathSegments = urlPath.split('/').filter(segment => segment);
    
    if (pathSegments.length > 0) {
      const pageObjectName = this.toCamelCase(pathSegments[pathSegments.length - 1]);
      pageObjects.push(`${pageObjectName}Page`);
    } else {
      pageObjects.push('HomePage');
    }

    return pageObjects;
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    
    // Extract imports
    const importPattern = /import.*from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    // Extract custom commands
    const commandPattern = /cy\.([a-zA-Z][a-zA-Z0-9]*)\(/g;
    const customCommands = new Set<string>();
    while ((match = commandPattern.exec(content)) !== null) {
      const command = match[1];
      if (!this.isBuiltInCommand(command)) {
        customCommands.add(command);
      }
    }

    dependencies.push(...Array.from(customCommands));
    return [...new Set(dependencies)];
  }

  private extractKeywords(text: string): string {
    // Extract key words from expected result text
    const words = text.toLowerCase().split(/\s+/);
    const keywords = words.filter(word => 
      word.length > 3 && 
      !['should', 'will', 'must', 'the', 'and', 'or', 'but'].includes(word)
    );
    return keywords[0] || 'success';
  }

  private isBuiltInCommand(command: string): boolean {
    const builtInCommands = [
      'visit', 'get', 'click', 'type', 'select', 'check', 'uncheck',
      'should', 'expect', 'wait', 'url', 'title', 'contains', 'viewport',
      'clearCookies', 'clearLocalStorage', 'reload', 'go', 'within'
    ];
    return builtInCommands.includes(command);
  }

  private initializeDefaultTemplates(): void {
    // Login form template
    this.templates.set('login', {
      name: 'Login Form',
      description: 'Template for login form testing',
      template: `
describe('{{testName}}', () => {
  beforeEach(() => {
    cy.visit('{{url}}');
  });

  it('should login successfully', () => {
    cy.get('{{usernameSelector}}').type('{{username}}');
    cy.get('{{passwordSelector}}').type('{{password}}');
    cy.get('{{submitSelector}}').click();
    cy.url().should('not.contain', 'login');
  });
});`,
      variables: {
        testName: 'Login Test',
        url: '/',
        usernameSelector: 'input[name="username"]',
        passwordSelector: 'input[type="password"]',
        submitSelector: 'button[type="submit"]',
        username: 'testuser',
        password: 'testpass'
      },
      requiredData: ['username', 'password']
    });

    // Contact form template
    this.templates.set('contact', {
      name: 'Contact Form',
      description: 'Template for contact form testing',
      template: `
describe('{{testName}}', () => {
  beforeEach(() => {
    cy.visit('{{url}}');
  });

  it('should submit contact form', () => {
    cy.get('{{nameSelector}}').type('{{name}}');
    cy.get('{{emailSelector}}').type('{{email}}');
    cy.get('{{messageSelector}}').type('{{message}}');
    cy.get('{{submitSelector}}').click();
    cy.get('body').should('contain', 'success');
  });
});`,
      variables: {
        testName: 'Contact Form Test',
        url: '/contact',
        nameSelector: 'input[name="name"]',
        emailSelector: 'input[name="email"]',
        messageSelector: 'textarea[name="message"]',
        submitSelector: 'button[type="submit"]',
        name: 'Test User',
        email: 'test@example.com',
        message: 'Test message'
      },
      requiredData: ['name', 'email', 'message']
    });
  }

  private initializeCustomCommands(): void {
    // Login command
    this.customCommands.set('login', `
Cypress.Commands.add('login', (username, password) => {
  cy.get('input[name="username"], input[type="email"]').type(username);
  cy.get('input[type="password"]').type(password);
  cy.get('button[type="submit"], input[type="submit"]').click();
});`);

    // Fill form command
    this.customCommands.set('fillForm', `
Cypress.Commands.add('fillForm', (formData) => {
  Object.entries(formData).forEach(([field, value]) => {
    cy.get(\`[name="\${field}"], #\${field}\`).type(value);
  });
});`);

    // Wait for no loading command
    this.customCommands.set('waitForNoLoading', `
Cypress.Commands.add('waitForNoLoading', () => {
  cy.get('.loading, .spinner, [data-testid="loading"]').should('not.exist');
  cy.get('body').should('be.visible');
});`);
  }

  // Public API methods
  getGeneratedScript(testCaseId: string): GeneratedScript | undefined {
    return this.generatedScripts.get(testCaseId);
  }

  getAllGeneratedScripts(): GeneratedScript[] {
    return Array.from(this.generatedScripts.values());
  }

  addTemplate(template: ScriptTemplate): void {
    this.templates.set(template.name, template);
  }

  getTemplate(name: string): ScriptTemplate | undefined {
    return this.templates.get(name);
  }

  addCustomCommand(name: string, implementation: string): void {
    this.customCommands.set(name, implementation);
  }

  generateCustomCommandsFile(): string {
    let content = `/**
 * Custom Cypress Commands
 * Generated: ${new Date().toISOString()}
 */

`;

    for (const [name, implementation] of this.customCommands) {
      content += `// ${name} command\n`;
      content += implementation;
      content += '\n\n';
    }

    return content;
  }

  generateSupportFile(): string {
    return `/**
 * Cypress Support File
 * Generated: ${new Date().toISOString()}
 */

import './commands';

// Global configuration
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing the test on uncaught exceptions
  return false;
});

// Before hook for all tests
beforeEach(() => {
  // Set default viewport
  cy.viewport(${this.options.viewport.width}, ${this.options.viewport.height});
  
  // Clear storage
  cy.clearCookies();
  cy.clearLocalStorage();
});
`;
  }

  updateOptions(newOptions: Partial<CypressGenerationOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  getOptions(): CypressGenerationOptions {
    return { ...this.options };
  }

  clearGeneratedScripts(): void {
    this.generatedScripts.clear();
  }
}