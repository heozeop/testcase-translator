import { TestCase } from '../types/TestCase';
import { LinkedTestData } from './TestCaseLinkingService';
import { PageAnalysis, FormInfo } from './PuppeteerService';

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  priority: number;
  conditions: TemplateCondition[];
  structure: TemplateStructure;
  variables: TemplateVariable[];
  fragments: TemplateFragment[];
  metadata: TemplateMetadata;
}

export type TemplateCategory = 
  | 'authentication'
  | 'navigation'
  | 'form-interaction'
  | 'data-validation'
  | 'api-testing'
  | 'ui-interaction'
  | 'workflow'
  | 'generic';

export interface TemplateCondition {
  type: 'form-present' | 'element-count' | 'url-pattern' | 'page-title' | 'custom';
  operator: 'equals' | 'contains' | 'greater-than' | 'less-than' | 'matches';
  value: any;
  description: string;
}

export interface TemplateStructure {
  beforeEach?: string[];
  setup?: string[];
  main: string[];
  assertions?: string[];
  cleanup?: string[];
  afterEach?: string[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description: string;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    allowedValues?: any[];
  };
}

export interface TemplateFragment {
  id: string;
  name: string;
  code: string;
  description: string;
  dependencies: string[];
  parameters: string[];
}

export interface TemplateMetadata {
  author: string;
  version: string;
  created: Date;
  updated: Date;
  tags: string[];
  complexity: 'low' | 'medium' | 'high';
  cypressVersion: string;
  browserSupport: string[];
}

export interface TemplateMatchResult {
  template: Template;
  confidence: number;
  reasons: string[];
  variables: Record<string, any>;
  applicableFragments: string[];
}

export interface RenderResult {
  success: boolean;
  code: string;
  warnings: string[];
  errors: string[];
  usedVariables: Record<string, any>;
  usedFragments: string[];
}

export class CypressTemplateEngine {
  private templates: Map<string, Template> = new Map();
  private fragments: Map<string, TemplateFragment> = new Map();
  private customHelpers: Map<string, Function> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
    this.initializeDefaultFragments();
    this.initializeHelpers();
  }

  async findBestTemplate(
    testCase: TestCase,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis
  ): Promise<TemplateMatchResult | null> {
    const matches: TemplateMatchResult[] = [];

    for (const template of this.templates.values()) {
      const matchResult = await this.evaluateTemplate(template, testCase, linkedData, pageAnalysis);
      if (matchResult.confidence > 0.3) { // Minimum confidence threshold
        matches.push(matchResult);
      }
    }

    // Sort by confidence and return the best match
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches.length > 0 ? matches[0] : null;
  }

  async renderTemplate(
    template: Template,
    variables: Record<string, any>,
    fragments?: string[]
  ): Promise<RenderResult> {
    const result: RenderResult = {
      success: false,
      code: '',
      warnings: [],
      errors: [],
      usedVariables: {},
      usedFragments: []
    };

    try {
      // Validate required variables
      const validationResult = this.validateVariables(template, variables);
      if (!validationResult.isValid) {
        result.errors.push(...validationResult.errors);
        result.warnings.push(...validationResult.warnings);
      }

      // Merge with default values
      const mergedVariables = this.mergeWithDefaults(template, variables);
      result.usedVariables = mergedVariables;

      // Render each section
      const renderedSections = await this.renderSections(template, mergedVariables, fragments);
      
      // Combine sections into final code
      result.code = this.combineSections(renderedSections);
      result.usedFragments = fragments || [];

      result.success = result.errors.length === 0;

    } catch (error) {
      result.errors.push(`Template rendering failed: ${error}`);
    }

    return result;
  }

  private async evaluateTemplate(
    template: Template,
    testCase: TestCase,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis
  ): Promise<TemplateMatchResult> {
    let confidence = 0;
    const reasons: string[] = [];
    const variables: Record<string, any> = {};
    const applicableFragments: string[] = [];

    // Evaluate conditions
    for (const condition of template.conditions) {
      const conditionResult = await this.evaluateCondition(condition, testCase, linkedData, pageAnalysis);
      if (conditionResult.matches) {
        confidence += conditionResult.confidence;
        reasons.push(conditionResult.reason);
        Object.assign(variables, conditionResult.variables);
      }
    }

    // Category-based matching
    const categoryMatch = this.evaluateCategoryMatch(template.category, testCase, linkedData, pageAnalysis);
    confidence += categoryMatch.confidence;
    if (categoryMatch.confidence > 0) {
      reasons.push(categoryMatch.reason);
    }

    // Find applicable fragments
    applicableFragments.push(...this.findApplicableFragments(template, pageAnalysis));

    // Normalize confidence (0-1)
    confidence = Math.min(confidence / template.conditions.length, 1);

    return {
      template,
      confidence,
      reasons,
      variables,
      applicableFragments
    };
  }

  private async evaluateCondition(
    condition: TemplateCondition,
    testCase: TestCase,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis
  ): Promise<{ matches: boolean; confidence: number; reason: string; variables: Record<string, any> }> {
    const result = {
      matches: false,
      confidence: 0,
      reason: '',
      variables: {} as Record<string, any>
    };

    switch (condition.type) {
      case 'form-present':
        const formCount = pageAnalysis.forms.length;
        result.matches = this.evaluateOperator(formCount, condition.operator, condition.value);
        if (result.matches) {
          result.confidence = 0.8;
          result.reason = `Page has ${formCount} form(s)`;
          result.variables.formCount = formCount;
          result.variables.firstForm = pageAnalysis.forms[0]?.selector;
        }
        break;

      case 'element-count':
        const elementCount = pageAnalysis.interactiveElements.length;
        result.matches = this.evaluateOperator(elementCount, condition.operator, condition.value);
        if (result.matches) {
          result.confidence = 0.6;
          result.reason = `Page has ${elementCount} interactive elements`;
          result.variables.elementCount = elementCount;
        }
        break;

      case 'url-pattern':
        const urlMatches = new RegExp(condition.value).test(pageAnalysis.url);
        result.matches = urlMatches;
        if (result.matches) {
          result.confidence = 0.9;
          result.reason = `URL matches pattern: ${condition.value}`;
          result.variables.pageUrl = pageAnalysis.url;
        }
        break;

      case 'page-title':
        const titleMatches = this.evaluateOperator(pageAnalysis.title, condition.operator, condition.value);
        result.matches = titleMatches;
        if (result.matches) {
          result.confidence = 0.7;
          result.reason = `Page title matches condition`;
          result.variables.pageTitle = pageAnalysis.title;
        }
        break;

      case 'custom':
        // Custom condition evaluation would be implemented here
        result.confidence = 0.5;
        break;
    }

    return result;
  }

  private evaluateCategoryMatch(
    category: TemplateCategory,
    testCase: TestCase,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis
  ): { confidence: number; reason: string } {
    switch (category) {
      case 'authentication':
        const hasLoginElements = pageAnalysis.forms.some(form => 
          form.fields.some(field => 
            field.type === 'password' || 
            (field.name && field.name.toLowerCase().includes('password'))
          )
        );
        return hasLoginElements ? 
          { confidence: 0.8, reason: 'Page has authentication elements' } :
          { confidence: 0, reason: 'No authentication elements found' };

      case 'form-interaction':
        const formCount = pageAnalysis.forms.length;
        return formCount > 0 ? 
          { confidence: 0.6 + (formCount * 0.1), reason: `Page has ${formCount} forms` } :
          { confidence: 0, reason: 'No forms found' };

      case 'navigation':
        const linkCount = pageAnalysis.links.length;
        return linkCount > 0 ? 
          { confidence: 0.4 + Math.min(linkCount * 0.05, 0.4), reason: `Page has ${linkCount} links` } :
          { confidence: 0, reason: 'No navigation links found' };

      case 'ui-interaction':
        const interactiveCount = pageAnalysis.interactiveElements.length;
        return interactiveCount > 0 ? 
          { confidence: 0.5 + Math.min(interactiveCount * 0.05, 0.3), reason: `Page has ${interactiveCount} interactive elements` } :
          { confidence: 0, reason: 'No interactive elements found' };

      default:
        return { confidence: 0.3, reason: 'Generic template match' };
    }
  }

  private evaluateOperator(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'contains':
        return String(actual).toLowerCase().includes(String(expected).toLowerCase());
      case 'greater-than':
        return Number(actual) > Number(expected);
      case 'less-than':
        return Number(actual) < Number(expected);
      case 'matches':
        return new RegExp(expected).test(String(actual));
      default:
        return false;
    }
  }

  private findApplicableFragments(template: Template, pageAnalysis: PageAnalysis): string[] {
    const applicable: string[] = [];

    for (const fragment of template.fragments) {
      // Check if fragment dependencies are met
      const dependenciesMet = fragment.dependencies.every(dep => 
        this.checkFragmentDependency(dep, pageAnalysis)
      );

      if (dependenciesMet) {
        applicable.push(fragment.id);
      }
    }

    return applicable;
  }

  private checkFragmentDependency(dependency: string, pageAnalysis: PageAnalysis): boolean {
    switch (dependency) {
      case 'has-forms':
        return pageAnalysis.forms.length > 0;
      case 'has-links':
        return pageAnalysis.links.length > 0;
      case 'has-interactive-elements':
        return pageAnalysis.interactiveElements.length > 0;
      case 'has-images':
        return pageAnalysis.images.length > 0;
      default:
        return true; // Unknown dependencies are assumed to be met
    }
  }

  private validateVariables(template: Template, variables: Record<string, any>): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const variable of template.variables) {
      const value = variables[variable.name];

      // Check required variables
      if (variable.required && (value === undefined || value === null)) {
        errors.push(`Required variable '${variable.name}' is missing`);
        continue;
      }

      // Skip validation for undefined optional variables
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.validateVariableType(value, variable.type)) {
        errors.push(`Variable '${variable.name}' has incorrect type. Expected ${variable.type}, got ${typeof value}`);
      }

      // Additional validations
      if (variable.validation) {
        const validationErrors = this.validateVariableConstraints(value, variable.validation);
        errors.push(...validationErrors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateVariableType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && !Array.isArray(value);
      default:
        return true;
    }
  }

  private validateVariableConstraints(value: any, validation: any): string[] {
    const errors: string[] = [];

    if (validation.pattern && typeof value === 'string') {
      if (!new RegExp(validation.pattern).test(value)) {
        errors.push(`Value does not match required pattern: ${validation.pattern}`);
      }
    }

    if (validation.minLength && typeof value === 'string') {
      if (value.length < validation.minLength) {
        errors.push(`Value is too short. Minimum length: ${validation.minLength}`);
      }
    }

    if (validation.maxLength && typeof value === 'string') {
      if (value.length > validation.maxLength) {
        errors.push(`Value is too long. Maximum length: ${validation.maxLength}`);
      }
    }

    if (validation.allowedValues && Array.isArray(validation.allowedValues)) {
      if (!validation.allowedValues.includes(value)) {
        errors.push(`Value not in allowed list: ${validation.allowedValues.join(', ')}`);
      }
    }

    return errors;
  }

  private mergeWithDefaults(template: Template, variables: Record<string, any>): Record<string, any> {
    const merged = { ...variables };

    for (const variable of template.variables) {
      if (merged[variable.name] === undefined && variable.defaultValue !== undefined) {
        merged[variable.name] = variable.defaultValue;
      }
    }

    return merged;
  }

  private async renderSections(
    template: Template,
    variables: Record<string, any>,
    fragments?: string[]
  ): Promise<Record<string, string>> {
    const sections: Record<string, string> = {};

    for (const [sectionName, sectionTemplate] of Object.entries(template.structure)) {
      if (Array.isArray(sectionTemplate)) {
        sections[sectionName] = await this.renderSection(sectionTemplate, variables, fragments);
      }
    }

    return sections;
  }

  private async renderSection(
    sectionLines: string[],
    variables: Record<string, any>,
    fragments?: string[]
  ): Promise<string> {
    let rendered = '';

    for (const line of sectionLines) {
      if (line.startsWith('{{fragment:')) {
        // Render fragment
        const fragmentId = line.match(/\{\{fragment:([^}]+)\}\}/)?.[1];
        if (fragmentId && fragments?.includes(fragmentId)) {
          const fragment = this.fragments.get(fragmentId);
          if (fragment) {
            rendered += await this.renderTemplate(fragment.code, variables, fragments);
          }
        }
      } else {
        // Render regular template line
        rendered += this.interpolateVariables(line, variables) + '\n';
      }
    }

    return rendered;
  }

  private async renderTemplate(template: string, variables: Record<string, any>, fragments?: string[]): Promise<string> {
    return this.interpolateVariables(template, variables);
  }

  private interpolateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmedVarName = varName.trim();
      
      // Handle helper functions
      if (trimmedVarName.includes('(')) {
        return this.evaluateHelper(trimmedVarName, variables);
      }
      
      // Handle nested properties
      if (trimmedVarName.includes('.')) {
        return this.getNestedProperty(variables, trimmedVarName) || match;
      }
      
      // Simple variable replacement
      return variables[trimmedVarName] || match;
    });
  }

  private evaluateHelper(helperExpression: string, variables: Record<string, any>): string {
    const match = helperExpression.match(/(\w+)\((.*?)\)/);
    if (!match) return helperExpression;

    const [, helperName, argsString] = match;
    const helper = this.customHelpers.get(helperName);
    
    if (helper) {
      try {
        // Parse arguments - simplified parsing
        const args = argsString.split(',').map(arg => {
          const trimmed = arg.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            return trimmed.slice(1, -1); // String literal
          }
          return variables[trimmed] || trimmed; // Variable or literal
        });
        
        return helper(...args);
      } catch (error) {
        console.error(`Helper ${helperName} failed:`, error);
      }
    }

    return helperExpression;
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  private combineSections(sections: Record<string, string>): string {
    const orderedSections = ['beforeEach', 'setup', 'main', 'assertions', 'cleanup', 'afterEach'];
    let combined = '';

    for (const sectionName of orderedSections) {
      if (sections[sectionName]) {
        combined += sections[sectionName] + '\n';
      }
    }

    return combined;
  }

  private initializeDefaultTemplates(): void {
    // Login template
    this.templates.set('login-form', {
      id: 'login-form',
      name: 'Login Form Template',
      description: 'Template for login form automation',
      category: 'authentication',
      priority: 10,
      conditions: [
        {
          type: 'form-present',
          operator: 'greater-than',
          value: 0,
          description: 'Page must have at least one form'
        },
        {
          type: 'url-pattern',
          operator: 'matches',
          value: '.*(login|signin|auth).*',
          description: 'URL suggests login page'
        }
      ],
      structure: {
        beforeEach: [
          "cy.visit('{{pageUrl}}');",
          "cy.get('body').should('be.visible');"
        ],
        main: [
          "cy.get('{{usernameSelector}}').type('{{username}}');",
          "cy.get('{{passwordSelector}}').type('{{password}}');",
          "cy.get('{{submitSelector}}').click();"
        ],
        assertions: [
          "cy.url().should('not.contain', 'login');",
          "cy.get('body').should('not.contain.text', 'error');"
        ]
      },
      variables: [
        {
          name: 'pageUrl',
          type: 'string',
          required: true,
          description: 'URL of the login page'
        },
        {
          name: 'username',
          type: 'string',
          required: true,
          description: 'Username for login'
        },
        {
          name: 'password',
          type: 'string',
          required: true,
          description: 'Password for login'
        },
        {
          name: 'usernameSelector',
          type: 'string',
          required: false,
          defaultValue: 'input[name="username"], input[type="email"]',
          description: 'Selector for username field'
        },
        {
          name: 'passwordSelector',
          type: 'string',
          required: false,
          defaultValue: 'input[type="password"]',
          description: 'Selector for password field'
        },
        {
          name: 'submitSelector',
          type: 'string',
          required: false,
          defaultValue: 'button[type="submit"], input[type="submit"]',
          description: 'Selector for submit button'
        }
      ],
      fragments: [],
      metadata: {
        author: 'System',
        version: '1.0.0',
        created: new Date(),
        updated: new Date(),
        tags: ['login', 'authentication', 'form'],
        complexity: 'low',
        cypressVersion: '12+',
        browserSupport: ['chrome', 'firefox', 'edge']
      }
    });

    // Contact form template
    this.templates.set('contact-form', {
      id: 'contact-form',
      name: 'Contact Form Template',
      description: 'Template for contact form automation',
      category: 'form-interaction',
      priority: 8,
      conditions: [
        {
          type: 'form-present',
          operator: 'greater-than',
          value: 0,
          description: 'Page must have at least one form'
        },
        {
          type: 'element-count',
          operator: 'greater-than',
          value: 2,
          description: 'Form should have multiple fields'
        }
      ],
      structure: {
        beforeEach: [
          "cy.visit('{{pageUrl}}');",
          "cy.get('form').should('be.visible');"
        ],
        main: [
          "{{fragment:fillContactForm}}",
          "cy.get('{{submitSelector}}').click();"
        ],
        assertions: [
          "cy.get('body').should('contain.text', 'success');"
        ]
      },
      variables: [
        {
          name: 'pageUrl',
          type: 'string',
          required: true,
          description: 'URL of the contact page'
        },
        {
          name: 'name',
          type: 'string',
          required: true,
          description: 'Contact name'
        },
        {
          name: 'email',
          type: 'string',
          required: true,
          description: 'Contact email'
        },
        {
          name: 'message',
          type: 'string',
          required: true,
          description: 'Contact message'
        }
      ],
      fragments: [
        {
          id: 'fillContactForm',
          name: 'Fill Contact Form',
          code: "cy.get('[name=\"name\"], #name').type('{{name}}');\ncy.get('[name=\"email\"], #email').type('{{email}}');\ncy.get('[name=\"message\"], #message').type('{{message}}');",
          description: 'Fill out contact form fields',
          dependencies: ['has-forms'],
          parameters: ['name', 'email', 'message']
        }
      ],
      metadata: {
        author: 'System',
        version: '1.0.0',
        created: new Date(),
        updated: new Date(),
        tags: ['contact', 'form', 'communication'],
        complexity: 'low',
        cypressVersion: '12+',
        browserSupport: ['chrome', 'firefox', 'edge']
      }
    });
  }

  private initializeDefaultFragments(): void {
    // Common fragments that can be reused across templates
    
    this.fragments.set('waitForPageLoad', {
      id: 'waitForPageLoad',
      name: 'Wait for Page Load',
      code: "cy.get('body').should('be.visible');\ncy.get('.loading, .spinner').should('not.exist');",
      description: 'Wait for page to fully load',
      dependencies: [],
      parameters: []
    });

    this.fragments.set('clearForm', {
      id: 'clearForm',
      name: 'Clear Form',
      code: "cy.get('form').within(() => {\n  cy.get('input[type=\"text\"], input[type=\"email\"], textarea').clear();\n});",
      description: 'Clear all form fields',
      dependencies: ['has-forms'],
      parameters: []
    });

    this.fragments.set('submitFormAndWait', {
      id: 'submitFormAndWait',
      name: 'Submit Form and Wait',
      code: "cy.get('{{submitSelector}}').click();\ncy.wait(1000);\ncy.get('body').should('be.visible');",
      description: 'Submit form and wait for response',
      dependencies: ['has-forms'],
      parameters: ['submitSelector']
    });
  }

  private initializeHelpers(): void {
    // String helpers
    this.customHelpers.set('toUpperCase', (str: string) => str.toUpperCase());
    this.customHelpers.set('toLowerCase', (str: string) => str.toLowerCase());
    this.customHelpers.set('capitalize', (str: string) => str.charAt(0).toUpperCase() + str.slice(1));

    // Array helpers
    this.customHelpers.set('join', (arr: any[], separator: string = ', ') => arr.join(separator));
    this.customHelpers.set('length', (arr: any[]) => arr.length.toString());

    // Selector helpers
    this.customHelpers.set('escapeSelector', (selector: string) => selector.replace(/["']/g, '\\"'));
    this.customHelpers.set('dataTestId', (testId: string) => `[data-testid="${testId}"]`);
    this.customHelpers.set('byText', (text: string) => `:contains("${text}")`);

    // Date helpers
    this.customHelpers.set('currentDate', () => new Date().toISOString().split('T')[0]);
    this.customHelpers.set('timestamp', () => Date.now().toString());
  }

  // Public API methods
  getAllTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): Template | undefined {
    return this.templates.get(id);
  }

  addTemplate(template: Template): void {
    this.templates.set(template.id, template);
  }

  removeTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  getAllFragments(): TemplateFragment[] {
    return Array.from(this.fragments.values());
  }

  getFragment(id: string): TemplateFragment | undefined {
    return this.fragments.get(id);
  }

  addFragment(fragment: TemplateFragment): void {
    this.fragments.set(fragment.id, fragment);
  }

  addHelper(name: string, fn: Function): void {
    this.customHelpers.set(name, fn);
  }

  previewTemplate(templateId: string, variables: Record<string, any>): RenderResult {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        success: false,
        code: '',
        warnings: [],
        errors: [`Template ${templateId} not found`],
        usedVariables: {},
        usedFragments: []
      };
    }

    return this.renderTemplate(template, variables);
  }
}