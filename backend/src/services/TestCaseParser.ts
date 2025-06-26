import { TestCase, TestCaseData, TestStep, Assertion } from '../types/database';

export interface ParsedUrl {
  url: string;
  type: 'direct' | 'relative' | 'form_action' | 'link_href';
  context: string;
  stepIndex?: number;
}

export interface ParsedNavigation {
  type: 'navigate' | 'click' | 'submit' | 'input' | 'wait' | 'verify';
  target: string;
  value?: string;
  description: string;
  stepIndex: number;
  requirements: NavigationRequirement[];
}

export interface NavigationRequirement {
  type: 'url_access' | 'form_input' | 'element_click' | 'wait_condition' | 'verification';
  target: string;
  value?: string;
  condition?: string;
  timeout?: number;
}

export interface NavigationPlan {
  testCaseId: string;
  scenarioName: string;
  baseUrl: string;
  extractedUrls: ParsedUrl[];
  navigationSequence: ParsedNavigation[];
  userInputRequirements: UserInputRequirement[];
  assertions: ParsedAssertion[];
  metadata: {
    totalSteps: number;
    estimatedDuration: number;
    complexity: 'simple' | 'medium' | 'complex';
    requiresUserInput: boolean;
  };
}

export interface UserInputRequirement {
  fieldName: string;
  fieldType: 'text' | 'email' | 'password' | 'number' | 'select' | 'checkbox' | 'radio' | 'file';
  selector?: string;
  required: boolean;
  description: string;
  defaultValue?: string;
  validationRules?: ValidationRule[];
  stepIndex: number;
}

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'email' | 'url' | 'number';
  value?: any;
  message: string;
}

export interface ParsedAssertion {
  type: 'element_exists' | 'element_visible' | 'text_content' | 'url_matches' | 'page_title' | 'element_count';
  target: string;
  expected: any;
  description: string;
  stepIndex?: number;
  timeout?: number;
}

export interface ParsingOptions {
  extractUrls?: boolean;
  parseNavigation?: boolean;
  identifyInputs?: boolean;
  generatePlan?: boolean;
  baseUrl?: string;
  timeout?: number;
}

export interface ParsingResult {
  success: boolean;
  navigationPlan?: NavigationPlan;
  errors: ParsingError[];
  warnings: ParsingWarning[];
}

export interface ParsingError {
  code: string;
  message: string;
  stepIndex?: number;
  context?: string;
}

export interface ParsingWarning {
  code: string;
  message: string;
  stepIndex?: number;
  suggestion?: string;
}

export class TestCaseParser {
  private readonly URL_PATTERNS = {
    ABSOLUTE: /^https?:\/\/[^\s]+/i,
    RELATIVE: /^\/[^\s]*/,
    FRAGMENT: /^#[^\s]*/,
    QUERY: /^\?[^\s]*/
  };

  private readonly ACTION_PATTERNS = {
    NAVIGATE: /^(navigate|go|visit|open|load)\s+(.+)/i,
    CLICK: /^(click|tap|select)\s+(.+)/i,
    INPUT: /^(type|enter|input|fill)\s+(.+?)\s+(in|into|to)\s+(.+)/i,
    SUBMIT: /^(submit|send)\s+(.+)/i,
    WAIT: /^(wait|pause)\s+(for\s+)?(.+)/i,
    VERIFY: /^(verify|check|assert|expect)\s+(.+)/i
  };

  async parseTestCase(testCase: TestCase, options: ParsingOptions = {}): Promise<ParsingResult> {
    const defaultOptions: Required<ParsingOptions> = {
      extractUrls: true,
      parseNavigation: true,
      identifyInputs: true,
      generatePlan: true,
      baseUrl: '',
      timeout: 30000,
      ...options
    };

    const errors: ParsingError[] = [];
    const warnings: ParsingWarning[] = [];

    try {
      // Validate test case structure
      this.validateTestCaseStructure(testCase, errors);
      
      if (errors.length > 0) {
        return { success: false, errors, warnings };
      }

      // Extract URLs if requested
      const extractedUrls = defaultOptions.extractUrls 
        ? this.extractUrls(testCase.test_data, defaultOptions.baseUrl, errors, warnings)
        : [];

      // Parse navigation sequence if requested
      const navigationSequence = defaultOptions.parseNavigation
        ? this.parseNavigationSequence(testCase.test_data.steps, errors, warnings)
        : [];

      // Identify user input requirements if requested
      const userInputRequirements = defaultOptions.identifyInputs
        ? this.identifyUserInputRequirements(testCase.test_data, errors, warnings)
        : [];

      // Parse assertions
      const assertions = this.parseAssertions(testCase.test_data.assertions || [], errors, warnings);

      // Generate navigation plan if requested
      if (defaultOptions.generatePlan) {
        const navigationPlan = this.generateNavigationPlan(
          testCase,
          extractedUrls,
          navigationSequence,
          userInputRequirements,
          assertions,
          defaultOptions
        );

        return {
          success: true,
          navigationPlan,
          errors,
          warnings
        };
      }

      return { success: true, errors, warnings };

    } catch (error) {
      errors.push({
        code: 'PARSING_FAILED',
        message: `Failed to parse test case: ${(error as Error).message}`,
        context: 'parseTestCase'
      });

      return { success: false, errors, warnings };
    }
  }

  private validateTestCaseStructure(testCase: TestCase, errors: ParsingError[]): void {
    if (!testCase.id) {
      errors.push({ code: 'MISSING_ID', message: 'Test case ID is required' });
    }

    if (!testCase.scenario_name) {
      errors.push({ code: 'MISSING_SCENARIO_NAME', message: 'Scenario name is required' });
    }

    if (!testCase.test_data) {
      errors.push({ code: 'MISSING_TEST_DATA', message: 'Test data is required' });
      return;
    }

    if (!testCase.test_data.steps || !Array.isArray(testCase.test_data.steps)) {
      errors.push({ code: 'MISSING_STEPS', message: 'Test steps are required and must be an array' });
      return;
    }

    if (testCase.test_data.steps.length === 0) {
      errors.push({ code: 'EMPTY_STEPS', message: 'At least one test step is required' });
    }

    // Validate each step
    testCase.test_data.steps.forEach((step, index) => {
      if (!step.action) {
        errors.push({
          code: 'MISSING_ACTION',
          message: `Step ${index + 1} is missing action`,
          stepIndex: index
        });
      }

      if (!step.target) {
        errors.push({
          code: 'MISSING_TARGET',
          message: `Step ${index + 1} is missing target`,
          stepIndex: index
        });
      }
    });
  }

  private extractUrls(testData: TestCaseData, baseUrl: string, errors: ParsingError[], warnings: ParsingWarning[]): ParsedUrl[] {
    const urls: ParsedUrl[] = [];
    const seenUrls = new Set<string>();

    // Extract URLs from test steps
    testData.steps.forEach((step, index) => {
      const stepUrls = this.extractUrlsFromStep(step, index, baseUrl);
      stepUrls.forEach(url => {
        const key = `${url.url}_${url.type}`;
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          urls.push(url);
        }
      });
    });

    // Extract URLs from metadata if present
    if (testData.metadata) {
      const metadataUrls = this.extractUrlsFromMetadata(testData.metadata, baseUrl);
      metadataUrls.forEach(url => {
        const key = `${url.url}_${url.type}`;
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          urls.push(url);
        }
      });
    }

    // Validate extracted URLs
    urls.forEach(urlInfo => {
      try {
        new URL(urlInfo.url);
      } catch (error) {
        if (urlInfo.type !== 'relative') {
          warnings.push({
            code: 'INVALID_URL',
            message: `Invalid URL found: ${urlInfo.url}`,
            stepIndex: urlInfo.stepIndex,
            suggestion: 'Ensure URLs are properly formatted with protocol (http/https)'
          });
        }
      }
    });

    return urls;
  }

  private extractUrlsFromStep(step: TestStep, stepIndex: number, baseUrl: string): ParsedUrl[] {
    const urls: ParsedUrl[] = [];

    // Check action field for URLs
    if (step.action) {
      const actionUrls = this.findUrlsInText(step.action, stepIndex, 'action');
      urls.push(...actionUrls);
    }

    // Check target field for URLs (might be a URL for navigation steps)
    if (step.target) {
      const targetUrls = this.findUrlsInText(step.target, stepIndex, 'target');
      urls.push(...targetUrls);
    }

    // Check value field for URLs
    if (step.value) {
      const valueUrls = this.findUrlsInText(step.value, stepIndex, 'value');
      urls.push(...valueUrls);
    }

    return urls;
  }

  private extractUrlsFromMetadata(metadata: Record<string, any>, baseUrl: string): ParsedUrl[] {
    const urls: ParsedUrl[] = [];

    // Recursively search metadata for URL-like strings
    const searchObject = (obj: any, path: string = ''): void => {
      if (typeof obj === 'string') {
        const foundUrls = this.findUrlsInText(obj, undefined, `metadata.${path}`);
        urls.push(...foundUrls);
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
          const newPath = path ? `${path}.${key}` : key;
          searchObject(value, newPath);
        });
      }
    };

    searchObject(metadata);
    return urls;
  }

  private findUrlsInText(text: string, stepIndex?: number, context: string = ''): ParsedUrl[] {
    const urls: ParsedUrl[] = [];

    // Find absolute URLs
    const absoluteMatches = text.match(this.URL_PATTERNS.ABSOLUTE);
    if (absoluteMatches) {
      absoluteMatches.forEach(url => {
        urls.push({
          url: url.trim(),
          type: 'direct',
          context,
          stepIndex
        });
      });
    }

    // Find relative URLs
    const relativeMatches = text.match(this.URL_PATTERNS.RELATIVE);
    if (relativeMatches) {
      relativeMatches.forEach(url => {
        urls.push({
          url: url.trim(),
          type: 'relative',
          context,
          stepIndex
        });
      });
    }

    return urls;
  }

  private parseNavigationSequence(steps: TestStep[], errors: ParsingError[], warnings: ParsingWarning[]): ParsedNavigation[] {
    const navigation: ParsedNavigation[] = [];

    steps.forEach((step, index) => {
      try {
        const parsed = this.parseNavigationStep(step, index);
        if (parsed) {
          navigation.push(parsed);
        } else {
          warnings.push({
            code: 'UNRECOGNIZED_ACTION',
            message: `Could not parse action: ${step.action}`,
            stepIndex: index,
            suggestion: 'Use standard action keywords like navigate, click, type, submit, wait, verify'
          });
        }
      } catch (error) {
        errors.push({
          code: 'STEP_PARSING_ERROR',
          message: `Error parsing step ${index + 1}: ${(error as Error).message}`,
          stepIndex: index
        });
      }
    });

    return navigation;
  }

  private parseNavigationStep(step: TestStep, stepIndex: number): ParsedNavigation | null {
    const action = step.action.toLowerCase().trim();
    const requirements: NavigationRequirement[] = [];

    // Try to match against known action patterns
    for (const [actionType, pattern] of Object.entries(this.ACTION_PATTERNS)) {
      const match = action.match(pattern);
      if (match) {
        return this.createNavigationFromMatch(actionType.toLowerCase() as any, match, step, stepIndex, requirements);
      }
    }

    // Fallback: try to infer action type from keywords
    if (action.includes('navigate') || action.includes('go') || action.includes('visit')) {
      return {
        type: 'navigate',
        target: step.target,
        value: step.value,
        description: step.description || step.action,
        stepIndex,
        requirements: this.inferNavigationRequirements('navigate', step)
      };
    }

    if (action.includes('click') || action.includes('tap')) {
      return {
        type: 'click',
        target: step.target,
        value: step.value,
        description: step.description || step.action,
        stepIndex,
        requirements: this.inferNavigationRequirements('click', step)
      };
    }

    if (action.includes('type') || action.includes('enter') || action.includes('input')) {
      return {
        type: 'input',
        target: step.target,
        value: step.value,
        description: step.description || step.action,
        stepIndex,
        requirements: this.inferNavigationRequirements('input', step)
      };
    }

    if (action.includes('submit') || action.includes('send')) {
      return {
        type: 'submit',
        target: step.target,
        value: step.value,
        description: step.description || step.action,
        stepIndex,
        requirements: this.inferNavigationRequirements('submit', step)
      };
    }

    if (action.includes('wait') || action.includes('pause')) {
      return {
        type: 'wait',
        target: step.target,
        value: step.value,
        description: step.description || step.action,
        stepIndex,
        requirements: this.inferNavigationRequirements('wait', step)
      };
    }

    if (action.includes('verify') || action.includes('check') || action.includes('assert')) {
      return {
        type: 'verify',
        target: step.target,
        value: step.value,
        description: step.description || step.action,
        stepIndex,
        requirements: this.inferNavigationRequirements('verify', step)
      };
    }

    return null;
  }

  private createNavigationFromMatch(
    actionType: ParsedNavigation['type'],
    match: RegExpMatchArray,
    step: TestStep,
    stepIndex: number,
    requirements: NavigationRequirement[]
  ): ParsedNavigation {
    return {
      type: actionType,
      target: step.target || match[2] || '',
      value: step.value || match[3] || '',
      description: step.description || step.action,
      stepIndex,
      requirements: this.inferNavigationRequirements(actionType, step)
    };
  }

  private inferNavigationRequirements(actionType: ParsedNavigation['type'], step: TestStep): NavigationRequirement[] {
    const requirements: NavigationRequirement[] = [];

    switch (actionType) {
      case 'navigate':
        requirements.push({
          type: 'url_access',
          target: step.target,
          value: step.value
        });
        break;

      case 'click':
        requirements.push({
          type: 'element_click',
          target: step.target
        });
        break;

      case 'input':
        requirements.push({
          type: 'form_input',
          target: step.target,
          value: step.value
        });
        break;

      case 'submit':
        requirements.push({
          type: 'element_click',
          target: step.target
        });
        break;

      case 'wait':
        requirements.push({
          type: 'wait_condition',
          target: step.target,
          condition: step.value,
          timeout: this.parseTimeout(step.value)
        });
        break;

      case 'verify':
        requirements.push({
          type: 'verification',
          target: step.target,
          value: step.value
        });
        break;
    }

    return requirements;
  }

  private parseTimeout(value?: string): number {
    if (!value) return 5000; // Default 5 seconds

    const match = value.match(/(\d+)\s*(ms|milliseconds?|s|seconds?|m|minutes?)?/i);
    if (!match) return 5000;

    const num = parseInt(match[1]);
    const unit = match[2]?.toLowerCase() || 's';

    switch (unit) {
      case 'ms':
      case 'milliseconds':
      case 'millisecond':
        return num;
      case 's':
      case 'seconds':
      case 'second':
        return num * 1000;
      case 'm':
      case 'minutes':
      case 'minute':
        return num * 60 * 1000;
      default:
        return num * 1000; // Default to seconds
    }
  }

  private identifyUserInputRequirements(testData: TestCaseData, errors: ParsingError[], warnings: ParsingWarning[]): UserInputRequirement[] {
    const requirements: UserInputRequirement[] = [];

    // Check inputs from test data
    if (testData.inputs) {
      Object.entries(testData.inputs).forEach(([fieldName, value]) => {
        requirements.push({
          fieldName,
          fieldType: this.inferFieldType(fieldName, value),
          required: true,
          description: `Input for ${fieldName}`,
          defaultValue: value,
          stepIndex: -1 // From global inputs
        });
      });
    }

    // Check steps for input requirements
    testData.steps.forEach((step, index) => {
      if (step.action.toLowerCase().includes('type') || 
          step.action.toLowerCase().includes('enter') || 
          step.action.toLowerCase().includes('input') ||
          step.action.toLowerCase().includes('fill')) {
        
        const requirement = this.createUserInputFromStep(step, index);
        if (requirement) {
          requirements.push(requirement);
        }
      }
    });

    return requirements;
  }

  private inferFieldType(fieldName: string, value: any): UserInputRequirement['fieldType'] {
    const name = fieldName.toLowerCase();
    
    if (name.includes('email')) return 'email';
    if (name.includes('password') || name.includes('pwd')) return 'password';
    if (name.includes('number') || name.includes('age') || name.includes('phone')) return 'number';
    if (name.includes('file') || name.includes('upload')) return 'file';
    if (name.includes('select') || name.includes('dropdown')) return 'select';
    if (name.includes('checkbox') || name.includes('check')) return 'checkbox';
    if (name.includes('radio')) return 'radio';
    
    // Infer from value type
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'checkbox';
    
    return 'text'; // Default
  }

  private createUserInputFromStep(step: TestStep, stepIndex: number): UserInputRequirement | null {
    const fieldName = this.extractFieldName(step.target);
    if (!fieldName) return null;

    return {
      fieldName,
      fieldType: this.inferFieldType(fieldName, step.value),
      selector: step.target,
      required: true,
      description: step.description || `Input for ${fieldName}`,
      defaultValue: step.value,
      stepIndex
    };
  }

  private extractFieldName(target: string): string | null {
    // Try to extract meaningful field name from selector
    const idMatch = target.match(/id=['"]*([^'">\s]+)/i);
    if (idMatch) return idMatch[1];

    const nameMatch = target.match(/name=['"]*([^'">\s]+)/i);
    if (nameMatch) return nameMatch[1];

    const classMatch = target.match(/class=['"]*([^'">\s]+)/i);
    if (classMatch) return classMatch[1];

    // Extract from CSS selector
    const cssIdMatch = target.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/);
    if (cssIdMatch) return cssIdMatch[1];

    return null;
  }

  private parseAssertions(assertions: Assertion[], errors: ParsingError[], warnings: ParsingWarning[]): ParsedAssertion[] {
    return assertions.map((assertion, index) => {
      try {
        return {
          type: this.mapAssertionType(assertion.type),
          target: assertion.target,
          expected: assertion.expected,
          description: assertion.description || `Assertion ${index + 1}`,
          timeout: 10000 // Default 10 seconds
        };
      } catch (error) {
        warnings.push({
          code: 'ASSERTION_PARSING_WARNING',
          message: `Could not parse assertion ${index + 1}: ${(error as Error).message}`,
          suggestion: 'Check assertion type and expected value format'
        });
        
        return {
          type: 'element_exists',
          target: assertion.target,
          expected: assertion.expected,
          description: assertion.description || `Assertion ${index + 1}`,
          timeout: 10000
        };
      }
    });
  }

  private mapAssertionType(type: string): ParsedAssertion['type'] {
    const normalizedType = type.toLowerCase().replace(/[_-]/g, '');
    
    switch (normalizedType) {
      case 'exists':
      case 'elementexists':
        return 'element_exists';
      case 'visible':
      case 'elementvisible':
        return 'element_visible';
      case 'text':
      case 'textcontent':
        return 'text_content';
      case 'url':
      case 'urlmatches':
        return 'url_matches';
      case 'title':
      case 'pagetitle':
        return 'page_title';
      case 'count':
      case 'elementcount':
        return 'element_count';
      default:
        return 'element_exists';
    }
  }

  private generateNavigationPlan(
    testCase: TestCase,
    extractedUrls: ParsedUrl[],
    navigationSequence: ParsedNavigation[],
    userInputRequirements: UserInputRequirement[],
    assertions: ParsedAssertion[],
    options: Required<ParsingOptions>
  ): NavigationPlan {
    const complexity = this.calculateComplexity(navigationSequence, userInputRequirements);
    const estimatedDuration = this.estimateDuration(navigationSequence);
    
    return {
      testCaseId: testCase.id,
      scenarioName: testCase.scenario_name,
      baseUrl: options.baseUrl,
      extractedUrls,
      navigationSequence,
      userInputRequirements,
      assertions,
      metadata: {
        totalSteps: navigationSequence.length,
        estimatedDuration,
        complexity,
        requiresUserInput: userInputRequirements.length > 0
      }
    };
  }

  private calculateComplexity(
    navigationSequence: ParsedNavigation[],
    userInputRequirements: UserInputRequirement[]
  ): 'simple' | 'medium' | 'complex' {
    const stepCount = navigationSequence.length;
    const inputCount = userInputRequirements.length;
    const hasComplexActions = navigationSequence.some(nav => 
      nav.type === 'wait' || nav.type === 'verify' || nav.requirements.length > 2
    );

    if (stepCount <= 3 && inputCount <= 2 && !hasComplexActions) {
      return 'simple';
    } else if (stepCount <= 10 && inputCount <= 5) {
      return 'medium';
    } else {
      return 'complex';
    }
  }

  private estimateDuration(navigationSequence: ParsedNavigation[]): number {
    // Base duration estimates in milliseconds
    const baseDurations = {
      navigate: 3000,
      click: 500,
      input: 1000,
      submit: 2000,
      wait: 2000,
      verify: 1000
    };

    return navigationSequence.reduce((total, nav) => {
      const baseDuration = baseDurations[nav.type] || 1000;
      
      // Add complexity multipliers
      const complexityMultiplier = nav.requirements.length > 1 ? 1.5 : 1;
      
      return total + (baseDuration * complexityMultiplier);
    }, 1000); // Base overhead
  }

  async parseMultipleTestCases(testCases: TestCase[], options: ParsingOptions = {}): Promise<ParsingResult[]> {
    const results: ParsingResult[] = [];
    
    for (const testCase of testCases) {
      try {
        const result = await this.parseTestCase(testCase, options);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          errors: [{
            code: 'PARSING_FAILED',
            message: `Failed to parse test case ${testCase.id}: ${(error as Error).message}`,
            context: testCase.scenario_name
          }],
          warnings: []
        });
      }
    }
    
    return results;
  }

  generateParsingReport(results: ParsingResult[]): {
    totalTestCases: number;
    successfulParsings: number;
    failedParsings: number;
    totalErrors: number;
    totalWarnings: number;
    commonIssues: string[];
  } {
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
    
    // Identify common error patterns
    const errorCodes = results.flatMap(r => r.errors.map(e => e.code));
    const errorCounts = errorCodes.reduce((acc, code) => {
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const commonIssues = Object.entries(errorCounts)
      .filter(([_, count]) => count > 1)
      .sort(([_, a], [__, b]) => b - a)
      .slice(0, 5)
      .map(([code, count]) => `${code} (${count} occurrences)`);

    return {
      totalTestCases: results.length,
      successfulParsings: successful,
      failedParsings: failed,
      totalErrors,
      totalWarnings,
      commonIssues
    };
  }
}