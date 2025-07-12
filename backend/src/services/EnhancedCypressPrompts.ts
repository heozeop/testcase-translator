export class EnhancedCypressPrompts {
  
  static createAdvancedCypressPrompt(testCases: any[], siteStructure: any, baseUrl: string) {
    return {
      systemPrompt: `You are a Senior Test Automation Architect with expertise in creating enterprise-grade Cypress test suites.

CORE COMPETENCIES:
- Modern Cypress patterns (v12+) and best practices
- Advanced selector strategies and element interaction patterns
- Performance optimization and flaky test prevention
- Page Object Model and Test Data Management
- CI/CD integration and cross-browser testing
- Accessibility and visual regression testing
- API testing integration with UI tests

QUALITY STANDARDS:
- Write production-ready, maintainable code
- Implement robust error handling and retry logic
- Use semantic, business-focused test descriptions
- Create reusable components and utilities
- Follow SOLID principles in test design
- Ensure tests are deterministic and reliable
- Include comprehensive logging and debugging aids

ADVANCED PATTERNS TO IMPLEMENT:
- Custom commands for complex business workflows
- Intelligent waiting strategies (no arbitrary waits)
- Data-driven testing with external data sources
- Environment-specific configuration
- Parallel execution optimization
- Test isolation and cleanup strategies
- Performance monitoring and metrics collection`,

      userPrompt: `Create a professional Cypress test suite for this application:

APPLICATION CONTEXT:
- URL: ${baseUrl}
- Architecture: Modern web application
- Expected Users: ${siteStructure.title ? 'End users' : 'Business users'}

DISCOVERED SITE STRUCTURE:
- Page Title: ${siteStructure.title || 'Unknown'}
- Interactive Elements: ${siteStructure.buttons?.length || 0} buttons, ${siteStructure.inputs?.length || 0} inputs, ${siteStructure.links?.length || 0} links
- Forms Available: ${siteStructure.forms?.length || 0}
- Navigation Elements: ${siteStructure.navigation?.length || 0}

${siteStructure.crawlError ? `NOTE: Site crawling encountered: ${siteStructure.crawlError}. Generate robust fallback selectors.` : ''}

TEST SCENARIOS TO IMPLEMENT:
${testCases.map((tc, index) => `
${index + 1}. ${tc.scenarioName}
   Description: ${tc.description || 'Not specified'}
   Steps: ${tc.steps?.join(' → ') || 'No detailed steps'}
   Expected Outcome: ${tc.expectedResult || 'Not specified'}
   Priority: ${tc.priority || 'medium'}
`).join('')}

IMPLEMENTATION REQUIREMENTS:

1. INTELLIGENT TEST STRUCTURE:
   - Create meaningful describe blocks that reflect business domains
   - Use descriptive it() blocks that read like specifications
   - Group related tests logically
   - Implement proper test isolation

2. ADVANCED ELEMENT STRATEGIES:
   - Use data-cy attributes as primary selectors
   - Implement fallback selector hierarchies
   - Create semantic element finders (e.g., findLoginButton, findSubmitForm)
   - Handle dynamic content and loading states

3. BUSINESS-LOGIC FOCUSED ASSERTIONS:
   - Verify actual business outcomes, not just technical details
   - Test user workflows end-to-end
   - Include error scenario testing
   - Validate data integrity and state changes

4. MODERN CYPRESS FEATURES:
   - Use cy.intercept() for API call testing
   - Implement fixture data management
   - Add viewport and device testing
   - Include accessibility validations with cy.checkA11y()
   - Add visual regression testing hooks

5. ERROR HANDLING & RELIABILITY:
   - Implement retry logic for flaky elements
   - Add comprehensive error messages
   - Include debugging aids (screenshots, logs)
   - Handle race conditions and timing issues

6. PERFORMANCE & MONITORING:
   - Monitor page load times
   - Track test execution metrics
   - Implement custom performance commands
   - Add resource loading validations

7. MAINTAINABILITY:
   - Create helper functions for repeated actions
   - Use constants for selectors and test data
   - Implement cleanup procedures
   - Add comprehensive documentation

ADVANCED FEATURES TO INCLUDE:
- Multi-environment configuration support
- Test data generation and management
- Custom reporting and analytics
- Integration with external systems
- Cross-browser compatibility testing
- Mobile responsiveness validation
- Security testing considerations

OUTPUT REQUIREMENTS:
- Return ONLY the JavaScript/TypeScript code
- No explanations, descriptions, or markdown formatting
- Start directly with the code (e.g., describe('Test Suite', () => {...})
- Include all necessary imports at the top
- Code should be complete and ready to run

Return only the Cypress test code without any additional text.`,

      temperature: 0.1,
      maxTokens: 8000
    };
  }

  static createOptimizedConfigPrompt(baseUrl: string, projectContext: any) {
    return {
      systemPrompt: `You are a Cypress Configuration Expert specializing in enterprise-grade test environment setup.

EXPERTISE AREAS:
- Performance optimization for large test suites
- CI/CD pipeline integration
- Cross-browser and device testing configuration
- Security and compliance considerations
- Debugging and troubleshooting optimization
- Plugin ecosystem integration
- Environment management

CONFIGURATION PRINCIPLES:
- Optimize for speed and reliability
- Enable comprehensive debugging capabilities
- Support multiple environments (dev, staging, prod)
- Implement robust error handling
- Enable parallel execution
- Support modern web application patterns
- Include security best practices`,

      userPrompt: `Create an optimized Cypress configuration for:

APPLICATION DETAILS:
- Base URL: ${baseUrl}
- Project: ${projectContext.name || 'Web Application'}
- Environment: Modern web application

CONFIGURATION REQUIREMENTS:

1. PERFORMANCE OPTIMIZATION:
   - Optimized timeouts for modern SPAs
   - Memory management for large test suites
   - Parallel execution configuration
   - Browser launch optimization
   - Resource loading optimization

2. DEBUGGING & TROUBLESHOOTING:
   - Enhanced error reporting
   - Detailed screenshot/video configuration
   - Console log capture
   - Network request monitoring
   - Performance metrics collection

3. ENVIRONMENT MANAGEMENT:
   - Multi-environment URL handling
   - Environment-specific configurations
   - Secure credential management
   - Feature flag support

4. BROWSER & DEVICE SUPPORT:
   - Cross-browser configuration
   - Mobile device simulation
   - Responsive design testing
   - Accessibility testing setup

5. CI/CD INTEGRATION:
   - Docker container optimization
   - Headless execution configuration
   - Artifact management
   - Test result reporting

6. MODERN WEB APP SUPPORT:
   - SPA routing configuration
   - API interception setup
   - WebSocket handling
   - Progressive Web App support

7. SECURITY & COMPLIANCE:
   - Secure test data handling
   - GDPR compliance considerations
   - Security header validation
   - SSL/TLS configuration

Return only the cypress.config.js code without any explanations or markdown formatting.`,

      temperature: 0.05,
      maxTokens: 3000
    };
  }

  static createPageObjectPrompt(siteStructure: any, testScenarios: string[]) {
    return {
      systemPrompt: `You are a Page Object Model expert creating maintainable, scalable automation frameworks.

PAGE OBJECT PRINCIPLES:
- Encapsulate page-specific knowledge
- Provide semantic, business-focused interfaces
- Handle complex interactions and state management
- Implement robust error handling
- Support multiple interaction patterns
- Enable easy maintenance and updates

DESIGN PATTERNS:
- Use modern JavaScript class syntax
- Implement fluent interfaces for chaining
- Create specialized page components
- Support data-driven interactions
- Include built-in validations
- Provide debugging and logging capabilities`,

      userPrompt: `Create Page Object classes for this application:

SITE STRUCTURE ANALYSIS:
${JSON.stringify(siteStructure, null, 2)}

TEST SCENARIOS:
${testScenarios.join('\n')}

PAGE OBJECT REQUIREMENTS:

1. CORE PAGE CLASSES:
   - MainPage/HomePage class
   - Form interaction classes
   - Navigation component classes
   - Modal/dialog handling classes

2. INTERACTION METHODS:
   - Semantic method names (e.g., login(), submitOrder(), validateResults())
   - Fluent interface for method chaining
   - Built-in wait strategies
   - Error handling and recovery

3. ELEMENT MANAGEMENT:
   - Smart selector strategies
   - Dynamic element handling
   - State validation methods
   - Visibility and interaction checks

4. DATA HANDLING:
   - Form data input methods
   - Data validation utilities
   - Test data management
   - State verification methods

5. ADVANCED FEATURES:
   - Screenshot capture methods
   - Performance monitoring
   - Accessibility validation
   - Mobile responsiveness checks

Return only the Page Object class code without any explanations or markdown formatting.`,

      temperature: 0.1,
      maxTokens: 4000
    };
  }
}