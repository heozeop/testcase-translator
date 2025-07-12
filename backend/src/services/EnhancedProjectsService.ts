import { MastraService } from './MastraService';
import { EnhancedCypressPrompts } from './EnhancedCypressPrompts';

export class EnhancedProjectsService {
  private mastraService: MastraService;

  constructor() {
    // Initialize Mastra service with configuration
    this.mastraService = new MastraService({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
      model: "claude-sonnet-4-20250514",
      maxTokens: 8000,
      temperature: 0.1
    });
  }

  async generateEnhancedCypressCode(
    testCases: any[], 
    baseUrl: string, 
    siteStructure: any,
    projectContext: any,
    progressCallback?: (progress: any) => void
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Step 1: Generate main test file with AI
      this.sendProgress(progressCallback, {
        stage: 'generating',
        progress: 30,
        message: 'Generating intelligent Cypress test file with AI...',
        startTime
      });

      const testFilePrompt = EnhancedCypressPrompts.createAdvancedCypressPrompt(
        testCases, 
        siteStructure, 
        baseUrl
      );

      const testFileResponse = await this.mastraService.generateCompletion(
        testFilePrompt.userPrompt,
        testFilePrompt.systemPrompt,
        {
          maxTokens: testFilePrompt.maxTokens,
          temperature: testFilePrompt.temperature
        }
      );

      // Step 2: Generate optimized configuration
      this.sendProgress(progressCallback, {
        stage: 'configuring',
        progress: 60,
        message: 'Creating optimized Cypress configuration...',
        startTime
      });

      const configPrompt = EnhancedCypressPrompts.createOptimizedConfigPrompt(
        baseUrl, 
        projectContext
      );

      const configResponse = await this.mastraService.generateCompletion(
        configPrompt.userPrompt,
        configPrompt.systemPrompt,
        {
          maxTokens: configPrompt.maxTokens,
          temperature: configPrompt.temperature
        }
      );

      // Step 3: Generate Page Objects if complex scenarios
      this.sendProgress(progressCallback, {
        stage: 'enhancing',
        progress: 80,
        message: 'Creating Page Object classes...',
        startTime
      });

      let pageObjectsContent = '';
      if (testCases.length >= 3 || this.hasComplexInteractions(testCases)) {
        const pageObjectPrompt = EnhancedCypressPrompts.createPageObjectPrompt(
          siteStructure,
          testCases.map(tc => tc.scenarioName)
        );

        const pageObjectResponse = await this.mastraService.generateCompletion(
          pageObjectPrompt.userPrompt,
          pageObjectPrompt.systemPrompt,
          {
            maxTokens: pageObjectPrompt.maxTokens,
            temperature: pageObjectPrompt.temperature
          }
        );

        pageObjectsContent = pageObjectResponse.content;
      }

      // Step 4: Generate support utilities
      this.sendProgress(progressCallback, {
        stage: 'finalizing',
        progress: 90,
        message: 'Creating support utilities and commands...',
        startTime
      });

      const supportUtilities = await this.generateSupportUtilities(testCases, siteStructure);

      // Step 5: Create enhanced package.json
      const enhancedPackageJson = this.generateEnhancedPackageJson();

      // Compile all generated files
      const generatedFiles = [
        {
          fileName: 'cypress-tests.cy.js',
          content: this.cleanupGeneratedCode(testFileResponse.content),
          type: 'test'
        },
        {
          fileName: 'cypress.config.js',
          content: this.cleanupGeneratedCode(configResponse.content),
          type: 'config'
        },
        {
          fileName: 'package.json',
          content: enhancedPackageJson,
          type: 'config'
        }
      ];

      // Add Page Objects if generated
      if (pageObjectsContent) {
        generatedFiles.push({
          fileName: 'cypress/support/page-objects.js',
          content: this.cleanupGeneratedCode(pageObjectsContent),
          type: 'support'
        });
      }

      // Add support utilities if generated
      if (supportUtilities) {
        generatedFiles.push({
          fileName: 'cypress/support/commands.js',
          content: supportUtilities,
          type: 'support'
        });
      }

      this.sendProgress(progressCallback, {
        stage: 'completed',
        progress: 100,
        message: 'AI-powered code generation completed successfully!',
        startTime
      });

      const processingTime = Date.now() - startTime;

      return {
        data: {
          generationId: `ai-gen-${Date.now()}`,
          projectId: projectContext.id,
          projectName: projectContext.name,
          projectUrl: baseUrl,
          testCasesCount: testCases.length,
          filesGenerated: generatedFiles.length,
          files: generatedFiles,
          createdAt: new Date().toISOString(),
          siteStructure: siteStructure,
          processingTime,
          aiEnhanced: true,
          codeQualityScore: this.calculateCodeQualityScore(generatedFiles),
          features: this.extractGeneratedFeatures(generatedFiles)
        },
        message: `Successfully generated ${generatedFiles.length} high-quality Cypress files from ${testCases.length} test cases using AI enhancement`
      };

    } catch (error: any) {
      this.sendProgress(progressCallback, {
        stage: 'error',
        progress: 0,
        message: `AI code generation failed: ${error.message}`,
        error: error.message,
        startTime
      });
      throw error;
    }
  }

  private async generateSupportUtilities(testCases: any[], siteStructure: any): Promise<string> {
    if (testCases.length < 2) return '';

    const systemPrompt = `You are a Cypress utilities expert. Create reusable custom commands and helper functions that improve test maintainability and reduce code duplication.

Focus on:
- Custom commands for common interactions
- Utility functions for data generation
- Helper methods for assertions
- Error handling utilities
- Performance monitoring commands`;

    const userPrompt = `Create Cypress support utilities for these test scenarios:

TEST SCENARIOS:
${testCases.map(tc => `- ${tc.scenarioName}: ${tc.steps?.join(', ') || 'Basic interaction'}`).join('\n')}

SITE STRUCTURE:
- Available elements: ${siteStructure.buttons?.length || 0} buttons, ${siteStructure.inputs?.length || 0} inputs
- Forms: ${siteStructure.forms?.length || 0}
- Navigation: ${siteStructure.navigation?.length || 0}

Generate custom commands for:
1. Common UI interactions (login, form filling, navigation)
2. Smart waiting strategies
3. Data generation and management
4. Enhanced assertions
5. Error handling and recovery
6. Performance monitoring
7. Accessibility checks

Use modern Cypress patterns and include TypeScript definitions.`;

    try {
      const response = await this.mastraService.generateCompletion(
        userPrompt,
        systemPrompt,
        {
          maxTokens: 3000,
          temperature: 0.1
        }
      );

      return response.content;
    } catch (error) {
      console.warn('Failed to generate support utilities:', error);
      return this.getFallbackSupportUtilities();
    }
  }

  private generateEnhancedPackageJson(): string {
    return JSON.stringify({
      "name": "ai-generated-cypress-tests",
      "version": "1.0.0",
      "description": "AI-generated Cypress tests with enhanced capabilities",
      "scripts": {
        "cypress:open": "cypress open",
        "cypress:run": "cypress run",
        "cypress:run:chrome": "cypress run --browser chrome",
        "cypress:run:firefox": "cypress run --browser firefox",
        "cypress:run:edge": "cypress run --browser edge",
        "cypress:run:headless": "cypress run --headless",
        "cypress:run:mobile": "cypress run --config viewportWidth=375,viewportHeight=667",
        "cypress:dashboard": "cypress run --record --key <your-key>",
        "test": "cypress run",
        "test:headed": "cypress run --headed",
        "test:dev": "cypress run --env configFile=dev",
        "test:staging": "cypress run --env configFile=staging",
        "test:prod": "cypress run --env configFile=prod"
      },
      "devDependencies": {
        "cypress": "^13.15.0",
        "@cypress/grep": "^4.1.0",
        "cypress-axe": "^1.5.0",
        "cypress-real-events": "^1.12.0",
        "cypress-image-snapshot": "^4.0.1",
        "cypress-file-upload": "^5.0.8",
        "cypress-wait-until": "^3.0.1",
        "cypress-localstorage-commands": "^2.2.5",
        "@cypress/code-coverage": "^3.12.39"
      },
      "dependencies": {
        "faker": "^6.6.6",
        "moment": "^2.30.1"
      }
    }, null, 2);
  }

  private cleanupGeneratedCode(content: string): string {
    // Remove code block markers if present
    let cleaned = content.replace(/^```(?:javascript|js|typescript|ts)?\s*\n/, '');
    cleaned = cleaned.replace(/\n```\s*$/, '');
    
    // Remove any leading/trailing whitespace
    cleaned = cleaned.trim();
    
    // Ensure proper line endings
    cleaned = cleaned.replace(/\r\n/g, '\n');
    
    return cleaned;
  }

  private hasComplexInteractions(testCases: any[]): boolean {
    return testCases.some(tc => 
      tc.steps?.length > 3 || 
      tc.steps?.some((step: string) => 
        step.toLowerCase().includes('form') || 
        step.toLowerCase().includes('login') ||
        step.toLowerCase().includes('submit')
      )
    );
  }

  private calculateCodeQualityScore(files: any[]): number {
    let score = 70; // Base score
    
    // Check for advanced features
    const testFile = files.find(f => f.type === 'test');
    if (testFile?.content) {
      const content = testFile.content.toLowerCase();
      
      // Add points for best practices
      if (content.includes('cy.intercept')) score += 5;
      if (content.includes('beforeeach')) score += 5;
      if (content.includes('data-cy')) score += 5;
      if (content.includes('should(')) score += 5;
      if (content.includes('custom command')) score += 5;
      if (content.includes('page object')) score += 5;
    }
    
    // Add points for additional files
    if (files.some(f => f.fileName.includes('page-objects'))) score += 10;
    if (files.some(f => f.fileName.includes('commands'))) score += 5;
    
    return Math.min(score, 100);
  }

  private extractGeneratedFeatures(files: any[]): string[] {
    const features = ['AI-Generated', 'Modern Cypress Patterns'];
    
    const testFile = files.find(f => f.type === 'test');
    if (testFile?.content) {
      const content = testFile.content.toLowerCase();
      
      if (content.includes('cy.intercept')) features.push('API Interception');
      if (content.includes('viewport')) features.push('Responsive Testing');
      if (content.includes('accessibility') || content.includes('a11y')) features.push('Accessibility Testing');
      if (content.includes('performance')) features.push('Performance Monitoring');
      if (content.includes('custom command')) features.push('Custom Commands');
    }
    
    if (files.some(f => f.fileName.includes('page-objects'))) {
      features.push('Page Object Model');
    }
    
    return features;
  }

  private getFallbackSupportUtilities(): string {
    return `// Cypress Custom Commands and Utilities
// Generated as fallback when AI generation fails

// Custom command for smart waiting
Cypress.Commands.add('waitForElement', (selector, options = {}) => {
  const timeout = options.timeout || 10000;
  return cy.get(selector, { timeout }).should('be.visible');
});

// Custom command for form filling with validation
Cypress.Commands.add('fillFormField', (selector, value, options = {}) => {
  return cy.get(selector)
    .should('be.visible')
    .clear()
    .type(value)
    .should('have.value', value);
});

// Custom command for safe clicking
Cypress.Commands.add('safeClick', (selector, options = {}) => {
  return cy.get(selector)
    .should('be.visible')
    .should('not.be.disabled')
    .click(options);
});

// Performance monitoring utility
Cypress.Commands.add('measurePageLoad', () => {
  cy.window().then((win) => {
    const perfData = win.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
    cy.log(\`Page load time: \${pageLoadTime}ms\`);
    expect(pageLoadTime).to.be.lessThan(5000); // 5 second threshold
  });
});

// Accessibility check utility
Cypress.Commands.add('checkBasicA11y', () => {
  cy.get('img').each(($img) => {
    cy.wrap($img).should('have.attr', 'alt');
  });
  
  cy.get('button, a').each(($element) => {
    cy.wrap($element).should('not.have.attr', 'aria-label', '');
  });
});

// Add TypeScript definitions
declare global {
  namespace Cypress {
    interface Chainable {
      waitForElement(selector: string, options?: any): Chainable<Element>;
      fillFormField(selector: string, value: string, options?: any): Chainable<Element>;
      safeClick(selector: string, options?: any): Chainable<Element>;
      measurePageLoad(): Chainable<void>;
      checkBasicA11y(): Chainable<void>;
    }
  }
}`;
  }

  private sendProgress(callback: any, progress: any): void {
    if (callback) {
      callback({
        ...progress,
        elapsedTime: Date.now() - progress.startTime,
        timestamp: new Date().toISOString()
      });
    }
  }
}