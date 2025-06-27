import * as fs from 'fs/promises';
import * as path from 'path';
import { CypressTemplateContext } from './CypressTemplateEngine';
import { CollectedInput, PageState } from './ExplorationResultsStorage';

export interface TestDataConfiguration {
  fixtureStrategy: 'static' | 'dynamic' | 'mixed';
  seedDatabase: boolean;
  cleanupStrategy: 'none' | 'soft' | 'full';
  environmentIsolation: boolean;
  customSetupCommands: string[];
  customTeardownCommands: string[];
}

export interface TestEnvironment {
  name: string;
  baseUrl: string;
  database?: DatabaseConfig;
  environmentVariables: Record<string, string>;
  seedData?: any;
  cleanupRules: CleanupRule[];
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema?: string;
}

export interface CleanupRule {
  type: 'database' | 'localStorage' | 'sessionStorage' | 'cookies' | 'cache' | 'files';
  target: string;
  scope: 'test' | 'suite' | 'global';
  conditions?: Record<string, any>;
}

export interface TestDataset {
  name: string;
  description: string;
  data: Record<string, any>;
  validationRules?: ValidationRule[];
  dependencies?: string[];
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'range' | 'custom';
  rule: string | RegExp | ((value: any) => boolean);
  message: string;
}

export interface SetupTeardownContext {
  testSuiteName: string;
  testCaseName: string;
  environment: TestEnvironment;
  datasets: TestDataset[];
  context: CypressTemplateContext;
  configuration: TestDataConfiguration;
}

export class CypressTestLifecycleManager {
  private configuration: TestDataConfiguration;

  constructor(configuration: Partial<TestDataConfiguration> = {}) {
    this.configuration = {
      fixtureStrategy: 'mixed',
      seedDatabase: false,
      cleanupStrategy: 'soft',
      environmentIsolation: true,
      customSetupCommands: [],
      customTeardownCommands: [],
      ...configuration
    };
  }

  generateSetupCommands(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Global setup commands
    commands.push(...this.generateGlobalSetup(context));

    // Environment-specific setup
    commands.push(...this.generateEnvironmentSetup(context));

    // Data setup
    commands.push(...this.generateDataSetup(context));

    // Custom setup commands
    commands.push(...this.configuration.customSetupCommands);

    return commands;
  }

  generateTeardownCommands(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Custom teardown commands (executed first)
    commands.push(...this.configuration.customTeardownCommands);

    // Data cleanup
    commands.push(...this.generateDataCleanup(context));

    // Environment cleanup
    commands.push(...this.generateEnvironmentCleanup(context));

    // Global cleanup
    commands.push(...this.generateGlobalCleanup(context));

    return commands;
  }

  private generateGlobalSetup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Viewport configuration
    commands.push('cy.viewport(1280, 720)');

    // Clear browser state
    if (this.configuration.environmentIsolation) {
      commands.push('cy.clearCookies()');
      commands.push('cy.clearLocalStorage()');
      commands.push('cy.clearAllSessionStorage()');
    }

    // Setup request interception for better debugging
    commands.push(`cy.intercept('**/*', (req) => {
      console.log('Request:', req.method, req.url);
    }).as('allRequests')`);

    // Configure error handling
    commands.push(`Cypress.on('uncaught:exception', (err, runnable) => {
      // Log error but don't fail test for non-critical errors
      console.warn('Uncaught exception:', err.message);
      return false;
    })`);

    return commands;
  }

  private generateEnvironmentSetup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Set environment variables
    for (const [key, value] of Object.entries(context.environment.environmentVariables)) {
      commands.push(`Cypress.env('${key}', '${value}')`);
    }

    // Database seeding if required
    if (this.configuration.seedDatabase && context.environment.database) {
      commands.push(`cy.task('seedDatabase', ${JSON.stringify(context.environment.seedData)})`);
    }

    return commands;
  }

  private generateDataSetup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Load fixture data based on strategy
    switch (this.configuration.fixtureStrategy) {
      case 'static':
        commands.push(...this.generateStaticDataSetup(context));
        break;
      case 'dynamic':
        commands.push(...this.generateDynamicDataSetup(context));
        break;
      case 'mixed':
        commands.push(...this.generateMixedDataSetup(context));
        break;
    }

    return commands;
  }

  private generateStaticDataSetup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    for (const dataset of context.datasets) {
      commands.push(`cy.fixture('${dataset.name}.json').as('${dataset.name}')`);
    }

    return commands;
  }

  private generateDynamicDataSetup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Generate data on-the-fly
    commands.push(`cy.task('generateTestData', {
      testCase: '${context.testCaseName}',
      inputs: ${JSON.stringify(context.context.collectedInputs)}
    }).as('dynamicData')`);

    return commands;
  }

  private generateMixedDataSetup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Load static fixtures
    commands.push(...this.generateStaticDataSetup(context));

    // Generate dynamic data where needed
    const dynamicFields = context.context.collectedInputs.filter(input => 
      input.fieldType === 'email' || input.fieldType === 'password' || input.fieldName.includes('unique')
    );

    if (dynamicFields.length > 0) {
      commands.push(`cy.task('generateDynamicFields', ${JSON.stringify(dynamicFields)}).as('dynamicFields')`);
    }

    return commands;
  }

  private generateDataCleanup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    switch (this.configuration.cleanupStrategy) {
      case 'full':
        commands.push(...this.generateFullCleanup(context));
        break;
      case 'soft':
        commands.push(...this.generateSoftCleanup(context));
        break;
      case 'none':
        // No cleanup
        break;
    }

    return commands;
  }

  private generateFullCleanup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Database cleanup
    if (context.environment.database) {
      commands.push(`cy.task('cleanupDatabase', {
        tables: ['test_data', 'user_sessions', 'temp_files'],
        schema: '${context.environment.database.schema || 'public'}'
      })`);
    }

    // File system cleanup
    commands.push(`cy.task('cleanupFiles', {
      patterns: ['temp_*', 'test_*', '*.tmp']
    })`);

    return commands;
  }

  private generateSoftCleanup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Only cleanup test-specific data
    commands.push('cy.clearCookies()');
    commands.push('cy.clearLocalStorage()');

    // Cleanup specific test data
    commands.push(`cy.task('cleanupTestData', {
      testCase: '${context.testCaseName}',
      session: Cypress.env('testSessionId')
    })`);

    return commands;
  }

  private generateEnvironmentCleanup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Apply cleanup rules
    for (const rule of context.environment.cleanupRules) {
      commands.push(...this.generateCleanupRuleCommands(rule));
    }

    return commands;
  }

  private generateCleanupRuleCommands(rule: CleanupRule): string[] {
    const commands: string[] = [];

    switch (rule.type) {
      case 'database':
        commands.push(`cy.task('cleanupDatabase', {
          target: '${rule.target}',
          conditions: ${JSON.stringify(rule.conditions || {})}
        })`);
        break;

      case 'localStorage':
        if (rule.target === '*') {
          commands.push('cy.clearLocalStorage()');
        } else {
          commands.push(`cy.clearLocalStorage('${rule.target}')`);
        }
        break;

      case 'sessionStorage':
        commands.push(`cy.window().then((win) => {
          if ('${rule.target}' === '*') {
            win.sessionStorage.clear();
          } else {
            win.sessionStorage.removeItem('${rule.target}');
          }
        })`);
        break;

      case 'cookies':
        if (rule.target === '*') {
          commands.push('cy.clearCookies()');
        } else {
          commands.push(`cy.clearCookie('${rule.target}')`);
        }
        break;

      case 'cache':
        commands.push(`cy.window().then((win) => {
          if ('caches' in win) {
            win.caches.keys().then(names => {
              names.forEach(name => {
                if (name.includes('${rule.target}') || '${rule.target}' === '*') {
                  win.caches.delete(name);
                }
              });
            });
          }
        })`);
        break;

      case 'files':
        commands.push(`cy.task('cleanupFiles', {
          pattern: '${rule.target}',
          conditions: ${JSON.stringify(rule.conditions || {})}
        })`);
        break;
    }

    return commands;
  }

  private generateGlobalCleanup(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Take final screenshot for debugging
    commands.push(`cy.screenshot('${context.testCaseName}-final', {
      capture: 'viewport',
      overwrite: true
    })`);

    // Log test completion
    commands.push(`cy.task('log', 'Test completed: ${context.testCaseName}')`);

    return commands;
  }

  generateCustomCommands(context: SetupTeardownContext): string[] {
    const commands: string[] = [];

    // Command for setting up test data
    commands.push(`
Cypress.Commands.add('setupTestData', (datasetName, overrides = {}) => {
  cy.fixture(datasetName).then((data) => {
    const testData = { ...data, ...overrides };
    cy.wrap(testData).as('testData');
    
    // Store in Cypress env for access across commands
    Cypress.env('currentTestData', testData);
    
    return cy.wrap(testData);
  });
});`);

    // Command for database operations
    if (context.environment.database) {
      commands.push(`
Cypress.Commands.add('dbQuery', (query, params = []) => {
  return cy.task('executeQuery', { query, params });
});

Cypress.Commands.add('dbSeed', (table, data) => {
  return cy.task('seedTable', { table, data });
});

Cypress.Commands.add('dbCleanup', (tables = []) => {
  return cy.task('cleanupTables', tables);
});`);
    }

    // Command for form filling with validation
    commands.push(`
Cypress.Commands.add('fillFormWithValidation', (formData, options = {}) => {
  const { validateBefore = false, validateAfter = true } = options;
  
  if (validateBefore) {
    cy.validateFormStructure(formData);
  }
  
  Object.entries(formData).forEach(([fieldName, value]) => {
    cy.getByTestId(fieldName)
      .or(\`[name="\${fieldName}"]\`)
      .or(\`#\${fieldName}\`)
      .should('be.visible')
      .clear()
      .type(String(value), { delay: 50 });
  });
  
  if (validateAfter) {
    cy.validateFormData(formData);
  }
});`);

    // Command for waiting with retries
    commands.push(`
Cypress.Commands.add('waitForCondition', (condition, options = {}) => {
  const { timeout = 10000, interval = 500, description = 'condition' } = options;
  
  cy.wrap(null).then(() => {
    return new Cypress.Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const check = () => {
        try {
          if (condition()) {
            resolve(true);
          } else if (Date.now() - startTime > timeout) {
            reject(new Error(\`Timeout waiting for \${description}\`));
          } else {
            setTimeout(check, interval);
          }
        } catch (error) {
          if (Date.now() - startTime > timeout) {
            reject(error);
          } else {
            setTimeout(check, interval);
          }
        }
      };
      
      check();
    });
  });
});`);

    // Command for test isolation
    commands.push(`
Cypress.Commands.add('isolateTest', () => {
  // Clear all browser state
  cy.clearCookies();
  cy.clearLocalStorage();
  cy.clearAllSessionStorage();
  
  // Reset any global variables
  cy.window().then((win) => {
    // Reset any global test variables
    delete win.testState;
    delete win.testData;
  });
  
  // Clear intercepted requests
  cy.intercept('**/*').as('allRequests');
});`);

    return commands;
  }

  generateNodeTasks(context: SetupTeardownContext): Record<string, string> {
    const tasks: Record<string, string> = {};

    // Database tasks
    if (context.environment.database) {
      tasks.executeQuery = `
async function executeQuery({ query, params = [] }) {
  const { Pool } = require('pg');
  const pool = new Pool(${JSON.stringify(context.environment.database)});
  
  try {
    const result = await pool.query(query, params);
    await pool.end();
    return result.rows;
  } catch (error) {
    await pool.end();
    throw error;
  }
}`;

      tasks.seedDatabase = `
async function seedDatabase(seedData) {
  const { Pool } = require('pg');
  const pool = new Pool(${JSON.stringify(context.environment.database)});
  
  try {
    await pool.query('BEGIN');
    
    for (const [table, data] of Object.entries(seedData)) {
      if (Array.isArray(data)) {
        for (const row of data) {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = values.map((_, i) => \`$\${i + 1}\`).join(', ');
          
          await pool.query(
            \`INSERT INTO \${table} (\${columns.join(', ')}) VALUES (\${placeholders})\`,
            values
          );
        }
      }
    }
    
    await pool.query('COMMIT');
    await pool.end();
    return { success: true };
  } catch (error) {
    await pool.query('ROLLBACK');
    await pool.end();
    throw error;
  }
}`;

      tasks.cleanupDatabase = `
async function cleanupDatabase({ tables = [], schema = 'public' }) {
  const { Pool } = require('pg');
  const pool = new Pool(${JSON.stringify(context.environment.database)});
  
  try {
    for (const table of tables) {
      await pool.query(\`DELETE FROM \${schema}.\${table} WHERE created_at < NOW() - INTERVAL '1 hour'\`);
    }
    
    await pool.end();
    return { success: true };
  } catch (error) {
    await pool.end();
    throw error;
  }
}`;
    }

    // File system tasks
    tasks.cleanupFiles = `
async function cleanupFiles({ patterns = [], basePath = './temp' }) {
  const fs = require('fs').promises;
  const path = require('path');
  const glob = require('glob');
  
  try {
    for (const pattern of patterns) {
      const files = glob.sync(path.join(basePath, pattern));
      
      for (const file of files) {
        await fs.unlink(file);
      }
    }
    
    return { success: true, cleaned: files.length };
  } catch (error) {
    throw error;
  }
}`;

    // Data generation tasks
    tasks.generateTestData = `
async function generateTestData({ testCase, inputs }) {
  const faker = require('@faker-js/faker');
  const data = {};
  
  for (const input of inputs) {
    switch (input.fieldType) {
      case 'email':
        data[input.fieldName] = faker.internet.email();
        break;
      case 'password':
        data[input.fieldName] = faker.internet.password(12);
        break;
      case 'text':
        if (input.fieldName.includes('name')) {
          data[input.fieldName] = faker.person.fullName();
        } else if (input.fieldName.includes('phone')) {
          data[input.fieldName] = faker.phone.number();
        } else {
          data[input.fieldName] = faker.lorem.sentence();
        }
        break;
      default:
        data[input.fieldName] = input.value || faker.lorem.word();
    }
  }
  
  return data;
}`;

    // Logging task
    tasks.log = `
function log(message) {
  console.log(\`[\${new Date().toISOString()}] \${message}\`);
  return null;
}`;

    return tasks;
  }

  generateEnvironmentConfig(environment: TestEnvironment): string {
    const config = {
      name: environment.name,
      baseUrl: environment.baseUrl,
      env: environment.environmentVariables,
      setupNodeEvents: `(on, config) => {
        // Register custom tasks
        on('task', {
          ${Object.entries(this.generateNodeTasks({
            environment,
            testSuiteName: '',
            testCaseName: '',
            datasets: [],
            context: {} as CypressTemplateContext,
            configuration: this.configuration
          })).map(([name, func]) => `${name}: ${func}`).join(',\n          ')}
        });
        
        // Return updated config
        return config;
      }`
    };

    return JSON.stringify(config, null, 2);
  }

  validateTestData(datasets: TestDataset[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const dataset of datasets) {
      if (!dataset.name || !dataset.data) {
        errors.push(`Dataset missing required fields: ${dataset.name}`);
        continue;
      }

      if (dataset.validationRules) {
        for (const rule of dataset.validationRules) {
          const value = dataset.data[rule.field];
          
          if (rule.type === 'required' && !value) {
            errors.push(`Field ${rule.field} is required in dataset ${dataset.name}`);
          }
          
          if (rule.type === 'format' && value && rule.rule instanceof RegExp) {
            if (!rule.rule.test(String(value))) {
              errors.push(`Field ${rule.field} format invalid in dataset ${dataset.name}: ${rule.message}`);
            }
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export class TestDataGenerator {
  static generateFormDataset(inputs: CollectedInput[]): TestDataset {
    const data: Record<string, any> = {};
    const validationRules: ValidationRule[] = [];

    for (const input of inputs) {
      data[input.fieldName] = input.value;

      // Add validation rules based on field type
      if (input.fieldType === 'email') {
        validationRules.push({
          field: input.fieldName,
          type: 'format',
          rule: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
          message: 'Must be a valid email address'
        });
      }

      if (input.metadata?.required) {
        validationRules.push({
          field: input.fieldName,
          type: 'required',
          rule: '',
          message: 'This field is required'
        });
      }
    }

    return {
      name: 'formData',
      description: 'Generated form data from user inputs',
      data,
      validationRules
    };
  }

  static generateNavigationDataset(pageStates: PageState[]): TestDataset {
    const data = {
      pages: pageStates.map(state => ({
        url: state.url,
        title: state.title,
        timestamp: state.timestamp,
        elements: state.elements
      })),
      navigationFlow: pageStates.map((state, index) => ({
        step: index + 1,
        url: state.url,
        expectedTitle: state.title
      }))
    };

    return {
      name: 'navigationData',
      description: 'Navigation flow and page state data',
      data
    };
  }
}