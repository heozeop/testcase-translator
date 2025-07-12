import { MastraService } from './MastraService';

export interface CypressGenerationContext {
  testCases: any[];
  siteStructure: any;
  baseUrl: string;
  projectContext: {
    name: string;
    description?: string;
    targetAudience?: string;
    businessDomain?: string;
  };
}

export interface GeneratedCypressCode {
  testFile: string;
  configFile: string;
  supportFile?: string;
  pageObjects?: Record<string, string>;
  utilities?: string;
}

export class AICypressGeneratorService {
  private mastraService: MastraService;

  constructor(mastraService: MastraService) {
    this.mastraService = mastraService;
  }

  async generateHighQualityCypressCode(context: CypressGenerationContext): Promise<GeneratedCypressCode> {
    // Generate main test file with AI
    const testFile = await this.generateIntelligentTestFile(context);
    
    // Generate optimized config
    const configFile = await this.generateOptimizedConfig(context);
    
    // Generate support utilities if complex scenarios exist
    const supportFile = await this.generateSupportUtilities(context);
    
    // Generate page objects for better maintainability
    const pageObjects = await this.generatePageObjects(context);

    return {
      testFile,
      configFile,
      supportFile,
      pageObjects
    };
  }

  private async generateIntelligentTestFile(context: CypressGenerationContext): Promise<string> {
    const systemPrompt = `You are an expert Cypress test automation engineer with 10+ years of experience writing high-quality, maintainable test code.

EXPERTISE AREAS:
- Modern Cypress best practices (v12+)
- Page Object Model patterns
- Custom commands and utilities
- Robust selector strategies
- Error handling and retry logic
- Performance optimization
- Accessibility testing integration
- Cross-browser compatibility

CODE QUALITY STANDARDS:
- Write clean, readable, and maintainable code
- Use descriptive test names and meaningful comments
- Implement robust waiting strategies (not fixed waits)
- Create reusable custom commands
- Use data-cy attributes for stable selectors
- Include proper error handling and assertions
- Follow DRY principles
- Write self-documenting code

CYPRESS BEST PRACTICES:
- Use cy.intercept() for API testing
- Implement proper data setup/teardown
- Use beforeEach() for common setup
- Create meaningful test descriptions
- Use Page Object Model for complex applications
- Implement custom commands for repeated actions
- Use proper assertion strategies
- Handle dynamic content appropriately`;

    const userPrompt = `Generate a professional Cypress test file for the following application context:

PROJECT CONTEXT:
- Application: ${context.projectContext.name}
- Target URL: ${context.baseUrl}
- Domain: ${context.projectContext.businessDomain || 'Web Application'}
- Description: ${context.projectContext.description || 'Not specified'}

SITE STRUCTURE ANALYSIS:
${JSON.stringify(context.siteStructure, null, 2)}

TEST SCENARIOS TO IMPLEMENT:
${JSON.stringify(context.testCases, null, 2)}

REQUIREMENTS:
1. Create a comprehensive test suite with the describe/it structure
2. Implement intelligent selectors based on the crawled site structure
3. Add proper setup and teardown in beforeEach/afterEach
4. Use modern Cypress patterns and best practices
5. Include meaningful assertions that validate business logic
6. Add proper error handling and retry mechanisms
7. Create reusable helper functions within the file
8. Include accessibility checks where appropriate
9. Add performance monitoring (page load times)
10. Use data-driven approaches where beneficial

ADVANCED FEATURES TO INCLUDE:
- Dynamic waits instead of fixed cy.wait()
- Intelligent element detection and interaction
- Cross-browser compatibility considerations
- Mobile responsiveness testing hooks
- API interception for faster test execution
- Screenshot capture on failures
- Test data management
- Conditional logic for different environments

OUTPUT FORMAT:
Return ONLY the Cypress test code as JavaScript/TypeScript. No explanations, descriptions, or markdown formatting. Start directly with the code.`;

    const response = await this.mastraService.generateCompletion(
      userPrompt,
      systemPrompt,
      {
        maxTokens: 6000,
        temperature: 0.1
      }
    );

    return response.content;
  }

  private async generateOptimizedConfig(context: CypressGenerationContext): Promise<string> {
    const systemPrompt = `You are a Cypress configuration expert specializing in creating optimized, production-ready cypress.config.js files.

Focus on:
- Performance optimization
- Error handling configuration
- Modern Cypress features
- CI/CD integration
- Browser compatibility
- Security best practices
- Debugging capabilities`;

    const userPrompt = `Create an optimized Cypress configuration for:
- Target URL: ${context.baseUrl}
- Application Type: ${context.projectContext.businessDomain || 'Web Application'}
- Test Complexity: ${context.testCases.length} test scenarios

Include:
1. Optimized timeouts and retry settings
2. Video and screenshot configuration
3. Browser launch options
4. Environment variable handling
5. Custom task registration
6. Plugin configuration for modern features
7. Security and performance settings
8. CI/CD optimization
9. Multi-environment support
10. Advanced debugging options

Return only the cypress.config.js code without any explanations or markdown formatting.`;

    const response = await this.mastraService.generateCompletion(
      userPrompt,
      systemPrompt,
      {
        maxTokens: 2000,
        temperature: 0.1
      }
    );

    return response.content;
  }

  private async generateSupportUtilities(context: CypressGenerationContext): Promise<string> {
    if (context.testCases.length < 3) {
      return ''; // Skip for simple test suites
    }

    const systemPrompt = `You are a Cypress utilities expert creating reusable support functions and custom commands.

Create utilities that:
- Reduce code duplication
- Improve test maintainability
- Handle common patterns
- Provide better debugging
- Enable advanced testing scenarios`;

    const userPrompt = `Create Cypress support utilities for a test suite with these scenarios:
${JSON.stringify(context.testCases.map(tc => ({ name: tc.scenarioName, steps: tc.steps?.length || 0 })), null, 2)}

Target application: ${context.baseUrl}

Generate custom commands and utilities for:
1. Common UI interactions
2. Authentication flows
3. Data setup/cleanup
4. API helpers
5. Element waiting strategies
6. Form handling utilities
7. Navigation helpers
8. Assertion utilities
9. Error handling
10. Performance monitoring

Return only the code without any explanations or markdown formatting.`;

    const response = await this.mastraService.generateCompletion(
      userPrompt,
      systemPrompt,
      {
        maxTokens: 3000,
        temperature: 0.1
      }
    );

    return response.content;
  }

  private async generatePageObjects(context: CypressGenerationContext): Promise<Record<string, string>> {
    if (context.testCases.length < 5) {
      return {}; // Skip for simple applications
    }

    const systemPrompt = `You are a Page Object Model expert for Cypress automation.

Create maintainable page objects that:
- Encapsulate page-specific logic
- Provide clear, semantic interfaces
- Handle dynamic content
- Include proper error handling
- Follow modern JavaScript patterns`;

    const userPrompt = `Create Page Object classes for this application:

Site Structure:
${JSON.stringify(context.siteStructure, null, 2)}

Test Scenarios:
${JSON.stringify(context.testCases.map(tc => tc.scenarioName), null, 2)}

Generate Page Object classes for the main pages/components identified in the test scenarios.
Include methods for:
- Element interactions
- Data input/validation
- Navigation
- State verification
- Error handling

Return only the JavaScript class code without any explanations or markdown formatting.`;

    const response = await this.mastraService.generateCompletion(
      userPrompt,
      systemPrompt,
      {
        maxTokens: 4000,
        temperature: 0.1
      }
    );

    // Parse the response to extract individual page object classes
    // This is a simplified implementation - you could enhance this to create separate files
    return {
      'page-objects.js': response.content
    };
  }
}