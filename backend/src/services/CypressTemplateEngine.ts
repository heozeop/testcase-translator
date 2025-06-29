import { NavigationAction, PageState, CollectedInput } from './ExplorationResultsStorage';

export interface CypressTemplateContext {
  projectName: string;
  testCaseName: string;
  baseUrl: string;
  actions: NavigationAction[];
  pageStates: PageState[];
  collectedInputs: CollectedInput[];
  metadata: {
    generatedAt: string;
    version: string;
    description?: string;
  };
}

export interface CypressCommand {
  command: string;
  selector?: string;
  value?: any;
  options?: Record<string, any>;
  assertion?: string;
  comment?: string;
}

export interface CypressTestCase {
  name: string;
  description: string;
  beforeEach?: string[];
  afterEach?: string[];
  commands: CypressCommand[];
  fixtures?: string[];
}

export interface CypressTestSuite {
  suiteName: string;
  description: string;
  baseUrl: string;
  beforeEach?: string[];
  afterEach?: string[];
  testCases: CypressTestCase[];
  fixtures: Record<string, any>;
  customCommands: string[];
}

export abstract class BaseCypressTemplate {
  protected context: CypressTemplateContext;

  constructor(context: CypressTemplateContext) {
    this.context = context;
  }

  abstract generateTestCase(): CypressTestCase;
  
  protected generateCommand(
    command: string,
    selector?: string,
    value?: any,
    options?: Record<string, any>,
    comment?: string
  ): CypressCommand {
    return {
      command,
      selector,
      value,
      options,
      comment
    };
  }

  protected generateAssertion(
    selector: string,
    assertion: string,
    value?: any,
    comment?: string
  ): CypressCommand {
    return {
      command: 'should',
      selector,
      assertion,
      value,
      comment
    };
  }

  protected sanitizeSelector(selector: string): string {
    // Escape special characters and ensure valid CSS selector
    return selector.replace(/['"\\]/g, '\\$&');
  }

  protected generateDataTestId(element: string): string {
    return `[data-testid="${element}"]`;
  }
}

export class NavigationTestTemplate extends BaseCypressTemplate {
  generateTestCase(): CypressTestCase {
    const commands: CypressCommand[] = [];
    
    // Add navigation commands
    const navigationActions = this.context.actions.filter(action => 
      action.type === 'visit' || action.type === 'click'
    );

    for (const action of navigationActions) {
      switch (action.type) {
        case 'visit':
          commands.push(this.generateCommand(
            'visit',
            undefined,
            action.url,
            { timeout: 30000 },
            `Navigate to ${action.url}`
          ));
          break;

        case 'click':
          if (action.selector) {
            commands.push(this.generateCommand(
              'get',
              this.sanitizeSelector(action.selector),
              undefined,
              { timeout: 10000 },
              `Click on ${action.metadata?.elementText || 'element'}`
            ));
            
            commands.push(this.generateCommand(
              'click',
              undefined,
              undefined,
              undefined,
              undefined
            ));
          }
          break;
      }
    }

    return {
      name: `Navigation Test - ${this.context.testCaseName}`,
      description: `Test navigation flow for ${this.context.testCaseName}`,
      commands,
      fixtures: this.generateFixtures()
    };
  }

  private generateFixtures(): string[] {
    const fixtures: string[] = [];
    
    if (this.context.collectedInputs.length > 0) {
      fixtures.push('navigationData.json');
    }
    
    return fixtures;
  }
}

export class FormTestTemplate extends BaseCypressTemplate {
  generateTestCase(): CypressTestCase {
    const commands: CypressCommand[] = [];
    
    // Navigate to the form page
    const firstPageState = this.context.pageStates[0];
    if (firstPageState) {
      commands.push(this.generateCommand(
        'visit',
        undefined,
        firstPageState.url,
        { timeout: 30000 },
        `Navigate to form page`
      ));
    }

    // Fill form fields
    for (const input of this.context.collectedInputs) {
      commands.push(...this.generateInputCommands(input));
    }

    return {
      name: `Form Test - ${this.context.testCaseName}`,
      description: `Test form interactions for ${this.context.testCaseName}`,
      beforeEach: [
        'cy.clearCookies()',
        'cy.clearLocalStorage()'
      ],
      commands,
      fixtures: ['formData.json']
    };
  }

  private generateInputCommands(input: CollectedInput): CypressCommand[] {
    const commands: CypressCommand[] = [];
    const selector = this.sanitizeSelector(input.elementSelector);
    
    switch (input.fieldType) {
      case 'text':
      case 'email':
      case 'password':
        commands.push(this.generateCommand(
          'get',
          selector,
          undefined,
          { timeout: 10000 },
          `Locate ${input.fieldName} field`
        ));
        
        commands.push(this.generateCommand(
          'type',
          undefined,
          input.value,
          { delay: 100 },
          `Enter ${input.fieldName}`
        ));
        break;

      case 'select':
        commands.push(this.generateCommand(
          'get',
          selector,
          undefined,
          { timeout: 10000 },
          `Locate ${input.fieldName} dropdown`
        ));
        
        commands.push(this.generateCommand(
          'select',
          undefined,
          input.value,
          undefined,
          `Select ${input.value} from ${input.fieldName}`
        ));
        break;

      case 'checkbox':
      case 'radio':
        commands.push(this.generateCommand(
          'get',
          selector,
          undefined,
          { timeout: 10000 },
          `Locate ${input.fieldName} ${input.fieldType}`
        ));
        
        if (input.value) {
          commands.push(this.generateCommand(
            'check',
            undefined,
            undefined,
            undefined,
            `Check ${input.fieldName}`
          ));
        }
        break;
    }
    
    return commands;
  }
}

export class CypressTemplateRegistry {
  private templates: Map<string, typeof BaseCypressTemplate> = new Map();

  constructor() {
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates(): void {
    this.templates.set('navigation', NavigationTestTemplate);
    this.templates.set('form', FormTestTemplate);
  }

  registerTemplate(name: string, templateClass: typeof BaseCypressTemplate): void {
    this.templates.set(name, templateClass);
  }

  getTemplate(name: string): typeof BaseCypressTemplate | undefined {
    return this.templates.get(name);
  }

  getAllTemplateNames(): string[] {
    return Array.from(this.templates.keys());
  }

  createTemplate(name: string, context: CypressTemplateContext): BaseCypressTemplate | null {
    const TemplateClass = this.templates.get(name);
    if (!TemplateClass) {
      return null;
    }
    
    return new (TemplateClass as any)(context);
  }
}

export class CypressTemplateEngine {
  private registry: CypressTemplateRegistry;

  constructor() {
    this.registry = new CypressTemplateRegistry();
  }

  generateTestSuite(
    context: CypressTemplateContext,
    templateTypes: string[] = ['navigation', 'form']
  ): CypressTestSuite {
    const testCases: CypressTestCase[] = [];
    const fixtures: Record<string, any> = {};
    const customCommands: string[] = [];

    // Generate test cases based on requested templates
    for (const templateType of templateTypes) {
      const template = this.registry.createTemplate(templateType, context);
      if (template) {
        const testCase = template.generateTestCase();
        testCases.push(testCase);

        // Merge fixtures
        if (testCase.fixtures) {
          for (const fixture of testCase.fixtures) {
            fixtures[fixture] = this.generateFixtureData(fixture, context);
          }
        }
      }
    }

    // Generate custom commands based on context
    customCommands.push(...this.generateCustomCommands(context));

    return {
      suiteName: `${context.projectName} - ${context.testCaseName}`,
      description: `Generated Cypress test suite for ${context.testCaseName}`,
      baseUrl: context.baseUrl,
      beforeEach: [
        'cy.viewport(1280, 720)',
        'cy.clearCookies()',
        'cy.clearLocalStorage()'
      ],
      afterEach: [
        'cy.screenshot({ capture: "viewport", overwrite: true })'
      ],
      testCases,
      fixtures,
      customCommands
    };
  }

  private generateFixtureData(fixtureName: string, context: CypressTemplateContext): any {
    switch (fixtureName) {
      case 'formData.json':
        return this.generateFormFixture(context);
      case 'navigationData.json':
        return this.generateNavigationFixture(context);
      default:
        return {};
    }
  }

  private generateFormFixture(context: CypressTemplateContext): any {
    const formData: Record<string, any> = {};
    
    for (const input of context.collectedInputs) {
      formData[input.fieldName] = input.value;
    }
    
    return {
      testData: formData,
      metadata: {
        generatedAt: context.metadata.generatedAt,
        source: 'user-input-collection'
      }
    };
  }

  private generateNavigationFixture(context: CypressTemplateContext): any {
    const urls = context.pageStates.map(state => ({
      url: state.url,
      title: state.title,
      timestamp: state.timestamp
    }));
    
    return {
      navigationPath: urls,
      metadata: {
        generatedAt: context.metadata.generatedAt,
        totalSteps: context.actions.length
      }
    };
  }

  private generateCustomCommands(context: CypressTemplateContext): string[] {
    const commands: string[] = [];
    
    // Add custom command for form filling if we have form inputs
    if (context.collectedInputs.length > 0) {
      commands.push(`
Cypress.Commands.add('fillFormWithFixture', (fixtureName) => {
  cy.fixture(fixtureName).then((data) => {
    Object.keys(data.testData).forEach((fieldName) => {
      cy.get(\`[name="\${fieldName}"], [data-testid="\${fieldName}"], #\${fieldName}\`)
        .clear()
        .type(data.testData[fieldName]);
    });
  });
});`);
    }

    // Add custom command for waiting for page load
    commands.push(`
Cypress.Commands.add('waitForPageLoad', () => {
  cy.get('body').should('be.visible');
  cy.document().should('have.property', 'readyState', 'complete');
});`);

    return commands;
  }

  getAvailableTemplates(): string[] {
    return this.registry.getAllTemplateNames();
  }

  registerCustomTemplate(name: string, templateClass: typeof BaseCypressTemplate): void {
    this.registry.registerTemplate(name, templateClass);
  }

  getAllTemplates(): { id: string; name: string; description: string; type: string }[] {
    const templateNames = this.registry.getAllTemplateNames();
    return templateNames.map(name => ({
      id: name,
      name: name.charAt(0).toUpperCase() + name.slice(1) + ' Template',
      description: `Generates ${name} test cases`,
      type: name
    }));
  }

  getTemplate(id: string): { id: string; name: string; description: string; type: string; template: string } | null {
    const TemplateClass = this.registry.getTemplate(id);
    if (!TemplateClass) {
      return null;
    }

    // Create a dummy context to get template structure
    const dummyContext: CypressTemplateContext = {
      projectName: 'Sample Project',
      testCaseName: 'Sample Test',
      baseUrl: 'https://example.com',
      actions: [],
      pageStates: [],
      collectedInputs: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0'
      }
    };

    const template = new (TemplateClass as any)(dummyContext);
    const testCase = template.generateTestCase();

    return {
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1) + ' Template',
      description: `Generates ${id} test cases`,
      type: id,
      template: JSON.stringify(testCase, null, 2)
    };
  }

  previewTemplate(id: string, variables: Record<string, any> = {}): { preview: string; variables: string[] } {
    const template = this.getTemplate(id);
    if (!template) {
      return {
        preview: 'Template not found',
        variables: []
      };
    }

    // Extract variable names from the template
    const variablePattern = /\{\{\s*(\w+)\s*\}\}/g;
    const variables_found = new Set<string>();
    let match;

    while ((match = variablePattern.exec(template.template)) !== null) {
      variables_found.add(match[1]);
    }

    // Replace variables in template with provided values
    let preview = template.template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      preview = preview.replace(regex, String(value));
    }

    return {
      preview,
      variables: Array.from(variables_found)
    };
  }
}