import {
  CypressTestSuite,
  CypressTestCase,
  CypressCommand,
  CypressTemplateContext
} from './CypressTemplateEngine';

export interface CypressGenerationOptions {
  formatCode: boolean;
  includeComments: boolean;
  useTypeScript: boolean;
  indentSize: number;
  maxLineLength: number;
  generateSourceMaps: boolean;
  optimizeSelectors: boolean;
}

export interface GeneratedCypressFiles {
  testFiles: Map<string, string>; // filename -> content
  fixtureFiles: Map<string, string>; // filename -> content
  supportFiles: Map<string, string>; // filename -> content
  configFile: string;
  packageJson?: string;
}

export class CypressSyntaxGenerator {
  private options: CypressGenerationOptions;

  constructor(options: Partial<CypressGenerationOptions> = {}) {
    this.options = {
      formatCode: true,
      includeComments: true,
      useTypeScript: false,
      indentSize: 2,
      maxLineLength: 100,
      generateSourceMaps: false,
      optimizeSelectors: true,
      ...options
    };
  }

  generateFiles(testSuite: CypressTestSuite, context: CypressTemplateContext): GeneratedCypressFiles {
    const testFiles = new Map<string, string>();
    const fixtureFiles = new Map<string, string>();
    const supportFiles = new Map<string, string>();

    // Generate test files
    for (let i = 0; i < testSuite.testCases.length; i++) {
      const testCase = testSuite.testCases[i];
      const fileName = this.generateTestFileName(testCase, i);
      const content = this.generateTestFile(testCase, testSuite);
      testFiles.set(fileName, content);
    }

    // Generate fixture files
    for (const [fixtureName, fixtureData] of Object.entries(testSuite.fixtures)) {
      const content = this.generateFixtureFile(fixtureData);
      fixtureFiles.set(fixtureName, content);
    }

    // Generate support files
    if (testSuite.customCommands.length > 0) {
      const commandsContent = this.generateCustomCommandsFile(testSuite.customCommands);
      supportFiles.set('commands.js', commandsContent);
    }

    // Generate e2e.js support file
    const e2eContent = this.generateE2ESupportFile();
    supportFiles.set('e2e.js', e2eContent);

    // Generate Cypress configuration
    const configFile = this.generateConfigFile(testSuite, context);

    return {
      testFiles,
      fixtureFiles,
      supportFiles,
      configFile,
      packageJson: this.generatePackageJson(context)
    };
  }

  private generateTestFile(testCase: CypressTestCase, testSuite: CypressTestSuite): string {
    const lines: string[] = [];
    const indent = ' '.repeat(this.options.indentSize);

    // File header
    if (this.options.includeComments) {
      lines.push(`// ${testCase.name}`);
      lines.push(`// ${testCase.description}`);
      lines.push(`// Generated on ${new Date().toISOString()}`);
      lines.push('');
    }

    // Test suite description
    lines.push(`describe('${this.escapeString(testCase.name)}', () => {`);

    // Before each hooks
    if (testSuite.beforeEach || testCase.beforeEach) {
      lines.push(`${indent}beforeEach(() => {`);
      
      if (testSuite.beforeEach) {
        for (const command of testSuite.beforeEach) {
          lines.push(`${indent}${indent}${command};`);
        }
      }
      
      if (testCase.beforeEach) {
        for (const command of testCase.beforeEach) {
          lines.push(`${indent}${indent}${command};`);
        }
      }
      
      lines.push(`${indent}});`);
      lines.push('');
    }

    // After each hooks
    if (testSuite.afterEach || testCase.afterEach) {
      lines.push(`${indent}afterEach(() => {`);
      
      if (testCase.afterEach) {
        for (const command of testCase.afterEach) {
          lines.push(`${indent}${indent}${command};`);
        }
      }
      
      if (testSuite.afterEach) {
        for (const command of testSuite.afterEach) {
          lines.push(`${indent}${indent}${command};`);
        }
      }
      
      lines.push(`${indent}});`);
      lines.push('');
    }

    // Main test
    lines.push(`${indent}it('${this.escapeString(testCase.description)}', () => {`);
    
    for (const command of testCase.commands) {
      const commandLines = this.generateCommandCode(command, indent + indent);
      lines.push(...commandLines);
    }
    
    lines.push(`${indent}});`);
    lines.push('});');

    return this.formatCode(lines.join('\n'));
  }

  private generateCommandCode(command: CypressCommand, baseIndent: string): string[] {
    const lines: string[] = [];

    // Add comment if provided
    if (this.options.includeComments && command.comment) {
      lines.push(`${baseIndent}// ${command.comment}`);
    }

    switch (command.command) {
      case 'visit':
        lines.push(`${baseIndent}cy.visit('${this.escapeString(command.value)}'${this.formatOptions(command.options)});`);
        break;

      case 'get':
        if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}'${this.formatOptions(command.options)})`);
        }
        break;

      case 'click':
        if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}').click(${this.formatOptions(command.options)});`);
        } else {
          // This is a chained click
          lines.push(`${baseIndent}  .click(${this.formatOptions(command.options)});`);
        }
        break;

      case 'type':
        const typeValue = typeof command.value === 'string' ? `'${this.escapeString(command.value)}'` : command.value;
        if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}').type(${typeValue}${this.formatOptions(command.options)});`);
        } else {
          lines.push(`${baseIndent}  .type(${typeValue}${this.formatOptions(command.options)});`);
        }
        break;

      case 'clear':
        if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}').clear();`);
        } else {
          lines.push(`${baseIndent}  .clear()`);
        }
        break;

      case 'select':
        const selectValue = typeof command.value === 'string' ? `'${this.escapeString(command.value)}'` : command.value;
        if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}').select(${selectValue});`);
        } else {
          lines.push(`${baseIndent}  .select(${selectValue});`);
        }
        break;

      case 'check':
        if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}').check();`);
        } else {
          lines.push(`${baseIndent}  .check();`);
        }
        break;

      case 'uncheck':
        if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}').uncheck();`);
        } else {
          lines.push(`${baseIndent}  .uncheck();`);
        }
        break;

      case 'should':
        const assertion = command.assertion || 'exist';
        const shouldValue = command.value ? `, '${this.escapeString(command.value)}'` : '';
        
        if (command.selector === '' || command.selector === 'url') {
          lines.push(`${baseIndent}cy.url().should('${assertion}'${shouldValue});`);
        } else if (command.selector === 'title') {
          lines.push(`${baseIndent}cy.title().should('${assertion}'${shouldValue});`);
        } else if (command.selector) {
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}').should('${assertion}'${shouldValue});`);
        } else {
          lines.push(`${baseIndent}  .should('${assertion}'${shouldValue});`);
        }
        break;

      case 'wait':
        if (typeof command.value === 'string' && command.value.startsWith('@')) {
          // Wait for alias
          lines.push(`${baseIndent}cy.wait('${command.value}'${this.formatOptions(command.options)});`);
        } else if (typeof command.value === 'number') {
          // Wait for time
          lines.push(`${baseIndent}cy.wait(${command.value});`);
        } else if (command.selector) {
          // Wait for element
          lines.push(`${baseIndent}cy.get('${this.escapeString(command.selector)}', ${this.formatOptions(command.options)});`);
        }
        break;

      case 'intercept':
        const interceptMethod = command.value.method || 'GET';
        const interceptUrl = command.value.url || '**';
        const alias = command.options?.as ? `, { as: '${command.options.as}' }` : '';
        lines.push(`${baseIndent}cy.intercept('${interceptMethod}', '${interceptUrl}'${alias});`);
        break;

      case 'fixture':
        lines.push(`${baseIndent}cy.fixture('${command.value}').then((data) => {`);
        lines.push(`${baseIndent}  // Use fixture data here`);
        lines.push(`${baseIndent}});`);
        break;

      case 'then':
        lines.push(`${baseIndent}cy.then(${command.value});`);
        break;

      case 'screenshot':
        const screenshotName = command.value ? `'${this.escapeString(command.value)}'` : '';
        lines.push(`${baseIndent}cy.screenshot(${screenshotName}${this.formatOptions(command.options)});`);
        break;

      default:
        // Generic command
        const genericValue = command.value ? this.formatValue(command.value) : '';
        const genericOptions = this.formatOptions(command.options);
        lines.push(`${baseIndent}cy.${command.command}(${genericValue}${genericOptions});`);
    }

    return lines;
  }

  private generateFixtureFile(fixtureData: any): string {
    return JSON.stringify(fixtureData, null, this.options.indentSize);
  }

  private generateCustomCommandsFile(customCommands: string[]): string {
    const lines: string[] = [];

    if (this.options.includeComments) {
      lines.push('// Custom Cypress Commands');
      lines.push('// Generated automatically from exploration results');
      lines.push('');
    }

    for (const command of customCommands) {
      lines.push(command.trim());
      lines.push('');
    }

    return this.formatCode(lines.join('\n'));
  }

  private generateE2ESupportFile(): string {
    const lines = [
      "// Import commands.js using ES2015 syntax:",
      "import './commands'",
      "",
      "// Alternatively you can use CommonJS syntax:",
      "// require('./commands')",
      "",
      "// Set global configuration",
      "Cypress.on('uncaught:exception', (err, runnable) => {",
      "  // returning false here prevents Cypress from failing the test",
      "  return false;",
      "});"
    ];

    return lines.join('\n');
  }

  private generateConfigFile(testSuite: CypressTestSuite, context: CypressTemplateContext): string {
    const config = {
      e2e: {
        baseUrl: testSuite.baseUrl,
        supportFile: 'cypress/support/e2e.js',
        fixturesFolder: 'cypress/fixtures',
        screenshotsFolder: 'cypress/screenshots',
        videosFolder: 'cypress/videos',
        downloadsFolder: 'cypress/downloads',
        viewportWidth: 1280,
        viewportHeight: 720,
        defaultCommandTimeout: 10000,
        pageLoadTimeout: 30000,
        requestTimeout: 10000,
        responseTimeout: 30000,
        video: true,
        screenshotOnRunFailure: true,
        trashAssetsBeforeRuns: true,
        watchForFileChanges: false,
        chromeWebSecurity: false,
        experimentalStudio: true,
        setupNodeEvents: `(on, config) => {
      // implement node event listeners here
      on('task', {
        log(message) {
          console.log(message);
          return null;
        }
      });
    }`
      }
    };

    const lines = [
      "const { defineConfig } = require('cypress');",
      "",
      "module.exports = defineConfig({",
      `  e2e: ${JSON.stringify(config.e2e, null, this.options.indentSize).replace(/"setupNodeEvents": ".*?"/, config.e2e.setupNodeEvents)}`,
      "});"
    ];

    return this.formatCode(lines.join('\n'));
  }

  private generatePackageJson(context: CypressTemplateContext): string {
    const packageJson = {
      name: `cypress-tests-${context.projectName.toLowerCase().replace(/\s+/g, '-')}`,
      version: "1.0.0",
      description: `Generated Cypress tests for ${context.projectName}`,
      scripts: {
        "cypress:open": "cypress open",
        "cypress:run": "cypress run",
        "cypress:run:headless": "cypress run --headless",
        "cypress:run:chrome": "cypress run --browser chrome",
        "cypress:run:firefox": "cypress run --browser firefox",
        "test": "cypress run",
        "test:headed": "cypress run --headed",
        "test:gui": "cypress open"
      },
      devDependencies: {
        "cypress": "^13.0.0"
      },
      keywords: [
        "cypress",
        "e2e",
        "testing",
        "automation",
        "generated"
      ],
      author: "Testcase Translator",
      license: "MIT"
    };

    return JSON.stringify(packageJson, null, this.options.indentSize);
  }

  private generateTestFileName(testCase: CypressTestCase, index: number): string {
    const baseName = testCase.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const extension = this.options.useTypeScript ? '.cy.ts' : '.cy.js';
    return `${String(index + 1).padStart(2, '0')}-${baseName}${extension}`;
  }

  private formatOptions(options?: Record<string, any>): string {
    if (!options || Object.keys(options).length === 0) {
      return '';
    }

    const formatted = JSON.stringify(options);
    return `, ${formatted}`;
  }

  private formatValue(value: any): string {
    if (typeof value === 'string') {
      return `'${this.escapeString(value)}'`;
    }
    return JSON.stringify(value);
  }

  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
  }

  private formatCode(code: string): string {
    if (!this.options.formatCode) {
      return code;
    }

    // Basic code formatting - in production, use prettier or similar
    const lines = code.split('\n');
    const formatted: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        formatted.push('');
        continue;
      }

      // Simple line length check
      if (trimmed.length > this.options.maxLineLength) {
        // In production, implement proper line breaking logic
        formatted.push(trimmed);
      } else {
        formatted.push(trimmed);
      }
    }

    return formatted.join('\n');
  }

  // Utility methods for optimization
  optimizeSelector(selector: string): string {
    if (!this.options.optimizeSelectors) {
      return selector;
    }

    // Remove unnecessary attributes and optimize for reliability
    // This is a simplified implementation
    
    // Prefer data-testid over other attributes
    if (selector.includes('[data-testid=')) {
      const testIdMatch = selector.match(/\[data-testid="([^"]+)"\]/);
      if (testIdMatch) {
        return `[data-testid="${testIdMatch[1]}"]`;
      }
    }

    // Prefer id over class
    if (selector.includes('#') && !selector.includes(' ')) {
      return selector;
    }

    // Simplify complex selectors
    if (selector.split(' ').length > 3) {
      const parts = selector.split(' ');
      return parts.slice(-2).join(' '); // Take last 2 parts
    }

    return selector;
  }

  generateTestSummary(testSuite: CypressTestSuite): string {
    const summary = [
      `# Cypress Test Suite: ${testSuite.suiteName}`,
      '',
      `**Description:** ${testSuite.description}`,
      `**Base URL:** ${testSuite.baseUrl}`,
      `**Test Cases:** ${testSuite.testCases.length}`,
      `**Fixtures:** ${Object.keys(testSuite.fixtures).length}`,
      `**Custom Commands:** ${testSuite.customCommands.length}`,
      '',
      '## Test Cases',
      ''
    ];

    for (let i = 0; i < testSuite.testCases.length; i++) {
      const testCase = testSuite.testCases[i];
      summary.push(`${i + 1}. **${testCase.name}**`);
      summary.push(`   - ${testCase.description}`);
      summary.push(`   - Commands: ${testCase.commands.length}`);
      summary.push('');
    }

    return summary.join('\n');
  }
}

export class CypressCodeOptimizer {
  static optimizeCommands(commands: CypressCommand[]): CypressCommand[] {
    const optimized: CypressCommand[] = [];
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const nextCommand = commands[i + 1];
      
      // Merge consecutive get().click() into single command
      if (command.command === 'get' && nextCommand?.command === 'click' && !nextCommand.selector) {
        optimized.push({
          command: 'click',
          selector: command.selector,
          options: { ...command.options, ...nextCommand.options },
          comment: command.comment || nextCommand.comment
        });
        i++; // Skip next command
        continue;
      }
      
      // Merge consecutive get().type() into single command
      if (command.command === 'get' && nextCommand?.command === 'type' && !nextCommand.selector) {
        optimized.push({
          command: 'type',
          selector: command.selector,
          value: nextCommand.value,
          options: { ...command.options, ...nextCommand.options },
          comment: command.comment || nextCommand.comment
        });
        i++; // Skip next command
        continue;
      }
      
      optimized.push(command);
    }
    
    return optimized;
  }

  static removeRedundantCommands(commands: CypressCommand[]): CypressCommand[] {
    const filtered: CypressCommand[] = [];
    const seenSelectors = new Set<string>();
    
    for (const command of commands) {
      // Remove duplicate wait commands for same selector
      if (command.command === 'wait' && command.selector) {
        const key = `wait:${command.selector}`;
        if (seenSelectors.has(key)) {
          continue;
        }
        seenSelectors.add(key);
      }
      
      filtered.push(command);
    }
    
    return filtered;
  }
}