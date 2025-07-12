# AI-Enhanced Cypress Code Generation Guide

This guide shows you how to upgrade the generated Cypress code quality using AI through Mastra.ai and Claude.

## 🚀 Quick Setup

### 1. Enable AI Generation

Add to your `.env` file:

```bash
# Enable AI-powered code generation
ENABLE_AI_CYPRESS_GENERATION=true
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 2. Restart Your Application

```bash
docker-compose restart
```

### 3. Generate Tests

Upload your test cases and click "Generate Cypress Code" - you'll now get AI-enhanced tests!

## 📈 Quality Improvements

### Before (Template-based)
```javascript
// Basic template generation
cy.get('body').should('be.visible');
cy.wait(1000);
```

### After (AI-enhanced)
```javascript
// Intelligent, context-aware generation
cy.get('[data-cy="login-form"]')
  .should('be.visible')
  .and('not.have.class', 'loading');

cy.get('[data-cy="username-input"]')
  .should('be.enabled')
  .type(testData.username, { delay: 50 });

cy.intercept('POST', '/api/auth/login').as('loginRequest');
cy.get('[data-cy="login-button"]').click();
cy.wait('@loginRequest').its('response.statusCode').should('eq', 200);
```

## 🎯 Key Features

### 1. **Intelligent Selectors**
- Uses `data-cy` attributes for stability
- Fallback selector hierarchies
- Context-aware element targeting

### 2. **Modern Cypress Patterns**
- API interception with `cy.intercept()`
- Smart waiting strategies
- Performance monitoring
- Accessibility testing integration

### 3. **Advanced Test Architecture**
- Page Object Model for complex apps
- Custom commands and utilities
- Reusable helper functions
- Error handling and recovery

### 4. **Enhanced Configuration**
- Multi-browser support
- Mobile testing setup
- CI/CD optimization
- Debugging enhancements

## 🔧 Configuration Options

### Environment Variables

```bash
# Core AI Settings
ENABLE_AI_CYPRESS_GENERATION=true
ANTHROPIC_API_KEY=your_key_here
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS=8000
AI_TEMPERATURE=0.1

# Feature Flags
ENABLE_PAGE_OBJECTS_THRESHOLD=5      # Generate Page Objects for 5+ test cases
ENABLE_SUPPORT_UTILITIES_THRESHOLD=3 # Generate utilities for 3+ test cases
ENABLE_ACCESSIBILITY_TESTING=true
ENABLE_PERFORMANCE_MONITORING=true
```

### Quality Thresholds

The AI system automatically determines when to generate additional components:

- **3+ test cases**: Custom commands and utilities
- **5+ test cases**: Page Object Model classes
- **Complex interactions**: Enhanced error handling
- **Multiple forms**: Form-specific utilities

## 📊 Code Quality Scoring

The AI system provides quality scores based on:

- **Modern Patterns** (70-80 points base)
- **Best Practices** (+5-10 points each)
  - API interception usage
  - Stable selectors
  - Smart waiting
  - Custom commands
  - Accessibility checks
- **Architecture** (+5-15 points)
  - Page Objects
  - Support utilities
  - Error handling

## 🎨 Generated File Structure

With AI enhancement, you get:

```
generated-tests/
├── ai-generated-tests.cy.js       # Main test file
├── cypress.config.js              # Optimized configuration
├── package.json                   # Enhanced dependencies
├── cypress/
│   └── support/
│       ├── commands.js             # Custom commands
│       └── page-objects.js         # Page Object classes
```

## 🛠 Customizing AI Prompts

### 1. Update System Prompts

Modify `/backend/src/services/EnhancedCypressPrompts.ts`:

```typescript
// Add your domain-specific requirements
const systemPrompt = `You are a Senior Test Automation Expert specializing in ${YOUR_DOMAIN}.

Focus on:
- ${YOUR_SPECIFIC_PATTERNS}
- ${YOUR_QUALITY_STANDARDS}
- ${YOUR_BEST_PRACTICES}`;
```

### 2. Add Custom Prompt Templates

```typescript
static createCustomPrompt(context: any): PromptTemplate {
  return {
    systemPrompt: `Your custom system prompt for ${context.domain}`,
    userPrompt: `Generate tests for: ${context.requirements}`,
    temperature: 0.1,
    maxTokens: 6000
  };
}
```

### 3. Domain-Specific Enhancements

For e-commerce applications:
```typescript
// Add e-commerce specific patterns
if (context.domain === 'ecommerce') {
  prompts.push('Include shopping cart functionality');
  prompts.push('Add payment flow testing');
  prompts.push('Include product search scenarios');
}
```

## 🚀 Advanced Features

### 1. Multi-Language Support

```javascript
// AI automatically detects and handles Korean text
cy.get('[data-cy="검색-버튼"]').click();
cy.contains('검색 결과').should('be.visible');
```

### 2. Performance Monitoring

```javascript
// Automatically generated performance checks
cy.window().then((win) => {
  const perfData = win.performance.timing;
  const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
  expect(pageLoadTime).to.be.lessThan(3000);
});
```

### 3. Accessibility Integration

```javascript
// Built-in accessibility validation
cy.checkA11y({
  includedImpacts: ['critical', 'serious']
});
```

## 🐛 Troubleshooting

### Common Issues

1. **AI Generation Fails**
   ```bash
   # Check API key
   echo $ANTHROPIC_API_KEY
   
   # Verify model access
   curl -H "x-api-key: $ANTHROPIC_API_KEY" https://api.anthropic.com/v1/messages
   ```

2. **Low Quality Scores**
   - Add more detailed test scenarios
   - Include expected results in test cases
   - Use descriptive scenario names

3. **Missing Features**
   - Increase test case complexity
   - Add more interaction steps
   - Include form submissions and navigation

### Debug Mode

Enable detailed logging:
```bash
DEBUG_AI_GENERATION=true
VERBOSE_LOGGING=true
```

## 📈 Performance Tips

1. **Optimize Token Usage**
   - Limit test cases to 20 per generation
   - Use concise but descriptive scenarios
   - Batch similar test types together

2. **Quality vs Speed**
   - Use temperature 0.1 for consistency
   - Increase max_tokens for complex apps
   - Enable retries for reliability

3. **Cost Management**
   - Cache common patterns
   - Reuse generated utilities
   - Optimize prompt lengths

## 🎯 Best Practices

1. **Test Case Preparation**
   - Write clear, actionable scenarios
   - Include business context
   - Specify expected outcomes

2. **Review Generated Code**
   - Validate selectors match your app
   - Customize for your specific needs
   - Add domain-specific validations

3. **Continuous Improvement**
   - Monitor quality scores
   - Update prompts based on results
   - Share successful patterns across projects

## 📚 Additional Resources

- [Cypress Best Practices](https://docs.cypress.io/guides/references/best-practices)
- [Claude API Documentation](https://docs.anthropic.com/claude/reference)
- [Page Object Model Guide](https://cypress.io/blog/2019/01/03/stop-using-page-objects-and-start-using-app-actions/)

---

**Need Help?** Open an issue with the `ai-enhancement` label and include your configuration and error logs.