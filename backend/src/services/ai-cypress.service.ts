import { Injectable } from '@nestjs/common';
import { Anthropic } from '@anthropic-ai/sdk';

interface TestCase {
  id: string;
  name: string;
  description: string;
  steps: string[];
  expectedResults: string[];
  priority: string;
  category: string;
}

interface Project {
  id: string;
  name: string;
  targetUrl: string;
  description: string;
}

interface GenerationContext {
  project: Project;
  testCases: TestCase[];
  config: {
    baseUrl: string;
    viewport: { width: number; height: number };
    testTimeout: number;
    pageLoadTimeout: number;
  };
}

@Injectable()
export class AICypressService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateIntelligentCypressCode(context: GenerationContext) {
    console.log('🤖 Starting AI-powered Cypress code generation...');
    
    try {
      // Generate test file using AI
      const testFile = await this.generateTestFile(context);
      
      // Generate config file
      const configFile = this.generateConfigFile(context);
      
      // Generate support utilities if needed
      const supportFile = await this.generateSupportFile(context);

      return {
        testFile,
        configFile,
        supportFile
      };
    } catch (error) {
      console.error('❌ Error in AI Cypress generation:', error);
      throw error;
    }
  }

  private async generateTestFile(context: GenerationContext): Promise<string> {
    const { project, testCases } = context;
    
    const systemPrompt = `You are an expert Cypress test automation engineer. Generate high-quality, maintainable Cypress test code based on the provided test cases.

REQUIREMENTS:
- Write modern Cypress v12+ code using best practices
- Use proper selectors and robust locator strategies
- Include proper assertions based on expected results
- Handle Korean text and international characters properly
- Add meaningful comments in English
- Use cy.intercept() for API mocking when relevant
- Include proper error handling and retries
- Follow Page Object Model patterns when beneficial

CRITICAL CYPRESS SYNTAX RULES:
- NEVER use .or() method - it does not exist in Cypress
- For multiple text options, use: cy.get('body').should(($el) => { const text = $el.text(); expect(text.includes('option1') || text.includes('option2')).to.be.true; })
- For multiple assertions, use .and() not .or()
- Use cy.contains() for text matching, not .should('contain.text')
- Always use proper Cypress chainable methods only
- Never chain .or() after .should() - this causes "or is not a function" error
- Keep tests simple and avoid complex conditional logic that can cause timeouts
- Use { timeout: 10000 } for slow elements
- Prefer specific CSS selectors over :contains() when possible
- Always add { force: true } for clicks that might be intercepted
- Use cy.get('body').should('be.visible') to ensure page is loaded before interactions

IMPORTANT:
- Convert test steps into actual Cypress commands (cy.get, cy.click, cy.type, etc.)
- Map expected results to specific assertions (cy.should, cy.contains, etc.)
- Don't just use cy.wait() - implement proper element waiting
- Use SIMPLE, RELIABLE selectors: cy.contains('text'), 'nav a', 'header', '.class-name'
- AVOID complex conditional logic with cy.get('body').then() - it causes timeouts
- NEVER use data-testid attributes unless you know they exist on the real website
- Use straightforward assertions: cy.contains('text').should('be.visible')
- Handle dynamic content with { timeout: 10000 } instead of complex logic
- Always include graceful fallbacks with cy.visit() for navigation
- For Korean websites, expect Korean text content and handle character encoding properly
- Use { force: true } for all clicks to avoid overlay issues
- KEEP TESTS SIMPLE - avoid nested .then() blocks and complex conditionals  
- For navigation, use: cy.contains('menu-text').click() then fallback to cy.visit(url, { failOnStatusCode: false })
- Always use { failOnStatusCode: false } when visiting URLs that might not exist
- Add proper error handling for 404 pages and missing elements`;

    const userPrompt = `Generate Cypress test code for this project:

PROJECT: ${project.name}
URL: ${project.targetUrl}
DESCRIPTION: ${project.description}

MANDATORY REQUIREMENT: You MUST implement ALL of the following test cases exactly as specified. Do not generate generic tests - implement these specific scenarios:

TEST CASES TO IMPLEMENT:
${testCases.map((tc, index) => `
${index + 1}. TEST: "${tc.name}"
   DESCRIPTION: ${tc.description}
   CATEGORY: ${tc.category}
   PRIORITY: ${tc.priority}
   
   REQUIRED STEPS TO IMPLEMENT:
   ${tc.steps.map((step, i) => `   ${i + 1}. ${step}`).join('\n')}
   
   REQUIRED RESULTS TO VERIFY:
   ${tc.expectedResults.map((result, i) => `   ${i + 1}. ${result}`).join('\n')}
`).join('\n')}

CRITICAL IMPLEMENTATION REQUIREMENTS:
1. Create exactly ${testCases.length} test cases using it() blocks
2. Each it() block MUST have the exact Korean test name from above
3. Convert every step into actual Cypress commands (cy.visit, cy.get, cy.click, etc.)
4. Implement every expected result as specific assertions
5. Handle Korean text content properly
6. Use realistic selectors based on typical website structure
7. Include proper error handling and retries

EXAMPLE IMPLEMENTATION PATTERN (KEEP IT SIMPLE):
describe('Project Tests', () => {
  beforeEach(() => {
    cy.visit('${project.targetUrl}');
    cy.get('body').should('be.visible');
    cy.wait(1000);
  });

  // MUST implement test 1 exactly:
  it('${testCases[0]?.name}', () => {
    // Simple navigation - try cy.contains() first, then cy.visit() fallback
    cy.contains('요금', { timeout: 10000 }).click({ force: true });
    
    // Simple assertions - check for text presence
    cy.contains('아임웹', { timeout: 10000 }).should('be.visible');
    
    // Avoid complex .then() blocks - use direct assertions
    cy.get('body').should('contain', 'pricing_related_text');
  });

  // Continue for all test cases with SIMPLE patterns...
});

Return only the complete JavaScript test code implementing ALL specified test cases, no explanations.`;

    try {
      console.log('🤖 Starting Claude 4 Sonnet streaming generation...');
      
      const stream = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ],
        stream: true
      });

      let generatedCode = '';
      
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          generatedCode += chunk.delta.text;
        }
      }

      console.log('✅ AI generated test file successfully with streaming');
      return generatedCode;
    } catch (error) {
      console.error('❌ Error generating test file:', error);
      throw new Error(`Failed to generate test file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateConfigFile(context: GenerationContext): string {
    const { project, config } = context;
    
    return `const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: '${project.targetUrl}',
    viewportWidth: ${config.viewport.width},
    viewportHeight: ${config.viewport.height},
    defaultCommandTimeout: 60000,
    pageLoadTimeout: 30000,
    requestTimeout: 30000,
    responseTimeout: 30000,
    
    // Test isolation and cleanup
    testIsolation: true,
    
    // Screenshots and videos
    video: true,
    screenshot: true,
    screenshotOnRunFailure: true,
    
    // Retry configuration
    retries: {
      runMode: 2,
      openMode: 0,
    },
    
    // Browser configuration
    chromeWebSecurity: false,
    
    setupNodeEvents(on, config) {
      // Implement node event listeners here
      
      // Task for handling Korean text
      on('task', {
        log(message) {
          console.log(message);
          return null;
        }
      });
      
      return config;
    },
    
    // Environment variables
    env: {
      // Add any environment-specific variables here
    },
    
    // Exclude patterns
    excludeSpecPattern: [
      '**/__snapshots__/*',
      '**/__image_snapshots__/*'
    ]
  },
  
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
  },
});`;
  }

  private async generateSupportFile(context: GenerationContext): Promise<string> {
    // Generate a simple, dependency-free support file
    return `// cypress/support/e2e.js - Auto-generated support file

// Korean text handling
Cypress.Commands.add('containsKorean', (selector, text) => {
  cy.get(selector).should('contain', text)
})

// Navigation commands
Cypress.Commands.add('navigateToMain', () => {
  cy.visit('${context.project.targetUrl}')
  cy.get('body').should('be.visible')
})

// Common utilities
Cypress.Commands.add('waitForPageLoad', () => {
  cy.get('body').should('be.visible')
  cy.wait(1000) // Basic wait for animations
})

// Element visibility checks
Cypress.Commands.add('verifyElementVisible', (selector, timeout = 10000) => {
  cy.get(selector, { timeout }).should('be.visible')
})

// Global configuration to handle uncaught exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent failures on uncaught exceptions
  return false
})

// Viewport preset
Cypress.Commands.add('setViewportDesktop', () => {
  cy.viewport(1920, 1080)
})`
  }
}