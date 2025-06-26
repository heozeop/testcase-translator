export interface TestCasePromptContext {
  excelData: any[];
  sheetNames: string[];
  headers: string[];
  filename: string;
  targetUrl?: string;
  projectName?: string;
}

export interface ParsedTestCase {
  scenarioName: string;
  description?: string;
  testSteps: TestStep[];
  assertions: Assertion[];
  inputData: Record<string, any>;
  expectedResults: string[];
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  metadata: {
    sourceRow: number;
    sourceSheet: string;
    estimatedDuration?: number;
  };
}

export interface TestStep {
  stepNumber: number;
  action: string;
  target: string;
  value?: string;
  description: string;
  waitConditions?: string[];
}

export interface Assertion {
  type: 'element_visible' | 'element_text' | 'element_value' | 'page_title' | 'url_contains' | 'custom';
  target: string;
  expected: any;
  description: string;
}

export interface PromptTemplate {
  systemPrompt: string;
  userPrompt: string;
  outputSchema: string;
}

export class PromptTemplateService {
  static createTestCaseParsingPrompt(context: TestCasePromptContext): PromptTemplate {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(context);
    const outputSchema = this.getOutputSchema();

    return {
      systemPrompt,
      userPrompt,
      outputSchema
    };
  }

  private static getSystemPrompt(): string {
    return `You are an expert test automation engineer specializing in converting Excel-based test cases into structured, executable test scenarios for web applications.

Your task is to analyze Excel data containing test cases and convert them into a standardized JSON format that can be used to generate automated Cypress tests.

KEY RESPONSIBILITIES:
1. Identify test scenarios from Excel rows
2. Extract test steps, actions, and expected results
3. Determine input data requirements
4. Create assertions for validation
5. Organize data into structured test cases

ANALYSIS GUIDELINES:
- Look for patterns that indicate test scenarios (scenario names, test descriptions, step sequences)
- Identify input fields, test data, and expected outcomes
- Recognize common testing patterns (login, form submission, navigation, validation)
- Extract any prerequisites or setup requirements
- Identify assertions and validation points

WEB TESTING CONTEXT:
- Focus on web application testing scenarios
- Consider common web interactions: clicks, typing, navigation, form submission
- Look for UI element references (buttons, inputs, links, selectors)
- Identify page transitions and navigation flows
- Extract validation criteria (text checks, element visibility, URL verification)

OUTPUT REQUIREMENTS:
- Provide structured JSON following the exact schema provided
- Each test case should be complete and executable
- Include all necessary data for automation
- Ensure test steps are clear and actionable
- Add appropriate assertions for validation

Be thorough but practical - focus on creating test cases that would actually work in an automated testing environment.`;
  }

  private static getUserPrompt(context: TestCasePromptContext): string {
    return `Please analyze the following Excel data and extract test cases for web application testing.

CONTEXT INFORMATION:
- Filename: ${context.filename}
- Project: ${context.projectName || 'Unknown'}
- Target URL: ${context.targetUrl || 'Not specified'}
- Sheet Names: ${context.sheetNames.join(', ')}
- Headers: ${context.headers.join(', ')}

EXCEL DATA TO ANALYZE:
${JSON.stringify(context.excelData, null, 2)}

ANALYSIS INSTRUCTIONS:

1. IDENTIFY TEST SCENARIOS:
   - Look for scenario names or test case titles
   - Group related rows that form complete test cases
   - Identify different types of tests (positive, negative, edge cases)

2. EXTRACT TEST STEPS:
   - Find action sequences (what the user should do)
   - Identify target elements (buttons, inputs, links)
   - Extract input values and test data
   - Note any wait conditions or timing requirements

3. DETERMINE ASSERTIONS:
   - Find expected results or validation criteria
   - Identify what should be verified after each action
   - Extract success/failure conditions
   - Note any error messages or validation text

4. ORGANIZE INPUT DATA:
   - Collect all test data needed for execution
   - Group related inputs together
   - Identify which data varies between test runs
   - Note any special formatting requirements

5. ASSIGN METADATA:
   - Determine test priority based on content
   - Add relevant tags for categorization
   - Estimate execution complexity
   - Reference source location in Excel

REQUIREMENTS:
- Create complete, executable test cases
- Each test case should be independent
- Include sufficient detail for automation
- Focus on web UI interactions
- Ensure assertions are specific and verifiable

Please provide the extracted test cases in the required JSON format.`;
  }

  private static getOutputSchema(): string {
    return `{
  "testCases": [
    {
      "scenarioName": "string - Clear, descriptive name for the test scenario",
      "description": "string - Optional detailed description of what the test validates",
      "testSteps": [
        {
          "stepNumber": "number - Sequential step number starting from 1",
          "action": "string - Action type: 'navigate', 'click', 'type', 'select', 'wait', 'scroll', 'hover', 'submit'",
          "target": "string - CSS selector, element description, or URL for the target",
          "value": "string - Optional value to input or select",
          "description": "string - Human-readable description of what this step does",
          "waitConditions": ["string - Optional array of conditions to wait for"]
        }
      ],
      "assertions": [
        {
          "type": "string - Assertion type: 'element_visible', 'element_text', 'element_value', 'page_title', 'url_contains', 'custom'",
          "target": "string - CSS selector or element description to verify",
          "expected": "any - Expected value or condition",
          "description": "string - What this assertion validates"
        }
      ],
      "inputData": {
        "key": "value - All input data needed for this test case"
      },
      "expectedResults": [
        "string - List of expected outcomes or behaviors"
      ],
      "priority": "string - Test priority: 'high', 'medium', or 'low'",
      "tags": [
        "string - Relevant tags for categorization (e.g., 'login', 'form', 'navigation')"
      ],
      "metadata": {
        "sourceRow": "number - Row number in Excel where this test case was found",
        "sourceSheet": "string - Sheet name where this test case was found",
        "estimatedDuration": "number - Optional estimated execution time in seconds"
      }
    }
  ],
  "summary": {
    "totalTestCases": "number - Total number of test cases extracted",
    "testTypes": ["string - List of test types found"],
    "coverage": "string - Brief description of what areas are covered",
    "recommendations": ["string - Optional recommendations for additional test coverage"]
  }
}`;
  }

  static createValidationPrompt(testCases: ParsedTestCase[]): PromptTemplate {
    const systemPrompt = `You are a test automation quality reviewer. Your task is to validate and improve test cases for web application automation.

Review the provided test cases for:
1. Completeness - All necessary steps and data are present
2. Clarity - Steps are clear and unambiguous
3. Executability - Tests can be automated successfully
4. Coverage - Important scenarios are addressed
5. Best Practices - Following automation best practices

Provide feedback and suggestions for improvement.`;

    const userPrompt = `Please review these test cases and provide validation feedback:

${JSON.stringify(testCases, null, 2)}

Analyze each test case for:
- Missing steps or unclear instructions
- Incomplete or invalid selectors
- Missing assertions or validations
- Inadequate test data
- Poor step organization
- Automation feasibility

Provide specific, actionable feedback for improvements.`;

    const outputSchema = `{
  "validationResults": [
    {
      "testCaseIndex": "number - Index of the test case being reviewed",
      "scenarioName": "string - Name of the test scenario",
      "isValid": "boolean - Whether the test case is ready for automation",
      "issues": [
        {
          "severity": "string - 'error', 'warning', or 'suggestion'",
          "category": "string - 'steps', 'assertions', 'data', 'selectors', 'structure'",
          "message": "string - Description of the issue",
          "suggestion": "string - Recommended fix or improvement"
        }
      ],
      "score": "number - Quality score from 0-100"
    }
  ],
  "overallAssessment": {
    "totalScore": "number - Average score across all test cases",
    "readinessLevel": "string - 'ready', 'needs_improvement', 'major_issues'",
    "recommendations": [
      "string - High-level recommendations for the test suite"
    ]
  }
}`;

    return {
      systemPrompt,
      userPrompt,
      outputSchema
    };
  }

  static createEnhancementPrompt(testCase: ParsedTestCase, targetUrl: string): PromptTemplate {
    const systemPrompt = `You are a test automation expert specializing in web application testing. Your task is to enhance and optimize test cases for better automation coverage and reliability.

Focus on:
1. Adding missing edge cases and error scenarios
2. Improving step clarity and automation reliability
3. Enhancing assertions for better validation
4. Optimizing test data for comprehensive coverage
5. Adding appropriate wait conditions and error handling

Consider modern web application patterns and best practices.`;

    const userPrompt = `Please enhance this test case for comprehensive web application testing:

TARGET APPLICATION: ${targetUrl}

CURRENT TEST CASE:
${JSON.stringify(testCase, null, 2)}

ENHANCEMENT AREAS:
1. Add error handling and negative test scenarios
2. Improve element targeting strategies
3. Add comprehensive assertions
4. Include edge case data variations
5. Add appropriate wait conditions
6. Consider accessibility and mobile scenarios

Provide an enhanced version that covers more scenarios while maintaining clarity and executability.`;

    const outputSchema = `{
  "enhancedTestCase": {
    "scenarioName": "string",
    "description": "string",
    "testSteps": [
      {
        "stepNumber": "number",
        "action": "string",
        "target": "string",
        "value": "string",
        "description": "string",
        "waitConditions": ["string"],
        "errorHandling": "string - Optional error handling strategy"
      }
    ],
    "assertions": [
      {
        "type": "string",
        "target": "string",
        "expected": "any",
        "description": "string"
      }
    ],
    "inputData": "object",
    "expectedResults": ["string"],
    "priority": "string",
    "tags": ["string"],
    "metadata": "object"
  },
  "additionalScenarios": [
    {
      "scenarioName": "string - Name of additional test scenario",
      "description": "string - What this additional scenario tests",
      "relationship": "string - How this relates to the original test case"
    }
  ],
  "improvements": [
    {
      "area": "string - Area of improvement",
      "change": "string - What was changed",
      "rationale": "string - Why this improvement was made"
    }
  ]
}`;

    return {
      systemPrompt,
      userPrompt,
      outputSchema
    };
  }

  // Helper method to create context-aware prompts based on Excel content analysis
  static analyzeExcelStructure(excelData: any[]): {
    detectedPatterns: string[];
    suggestedPromptModifications: string[];
    confidence: number;
  } {
    const patterns: string[] = [];
    const suggestions: string[] = [];
    let confidence = 0;

    if (excelData.length === 0) {
      return { detectedPatterns: [], suggestedPromptModifications: [], confidence: 0 };
    }

    // Analyze column headers for testing patterns
    const firstRow = excelData[0];
    const headers = Object.keys(firstRow).filter(key => !key.startsWith('_'));

    // Look for common test case patterns
    const testPatterns = {
      scenario: ['scenario', 'test', 'case', 'name', 'title'],
      steps: ['step', 'action', 'procedure', 'instruction'],
      data: ['input', 'data', 'value', 'parameter'],
      expected: ['expected', 'result', 'outcome', 'verify', 'assert'],
      priority: ['priority', 'severity', 'importance']
    };

    for (const [patternType, keywords] of Object.entries(testPatterns)) {
      const matchingHeaders = headers.filter(header => 
        keywords.some(keyword => 
          header.toLowerCase().includes(keyword.toLowerCase())
        )
      );

      if (matchingHeaders.length > 0) {
        patterns.push(`${patternType}_pattern`);
        confidence += 20;
        suggestions.push(`Detected ${patternType} columns: ${matchingHeaders.join(', ')}`);
      }
    }

    // Check for structured test data
    if (excelData.length > 1) {
      const hasConsistentStructure = excelData.every(row => 
        Object.keys(row).length === Object.keys(firstRow).length
      );

      if (hasConsistentStructure) {
        patterns.push('structured_data');
        confidence += 15;
        suggestions.push('Data appears to be well-structured across rows');
      }
    }

    // Look for web-specific content
    const webKeywords = ['url', 'click', 'button', 'input', 'form', 'page', 'login', 'navigate'];
    const hasWebContent = excelData.some(row => 
      Object.values(row).some(value => 
        typeof value === 'string' && 
        webKeywords.some(keyword => 
          value.toLowerCase().includes(keyword)
        )
      )
    );

    if (hasWebContent) {
      patterns.push('web_testing');
      confidence += 25;
      suggestions.push('Content appears to be web application testing related');
    }

    return {
      detectedPatterns: patterns,
      suggestedPromptModifications: suggestions,
      confidence: Math.min(confidence, 100)
    };
  }
}