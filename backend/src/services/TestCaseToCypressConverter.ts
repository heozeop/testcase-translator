import { TestCase, TestStep } from '../types/database';
import { LinkedTestData } from './TestCaseLinkingService';
import { PageAnalysis } from './PuppeteerService';
import { CypressScriptGenerator, CypressCommand, GeneratedScript } from './CypressScriptGenerator';

export interface ConversionResult {
  success: boolean;
  generatedScript: GeneratedScript | null;
  warnings: string[];
  errors: string[];
  statistics: {
    stepsConverted: number;
    assertionsGenerated: number;
    commandsUsed: string[];
    complexityScore: number;
  };
}

export interface ConversionOptions {
  strictMode?: boolean;
  includeDebugLogs?: boolean;
  optimizeSelectors?: boolean;
  generatePageObjects?: boolean;
  includeDataValidation?: boolean;
  targetCypressVersion?: string;
  customSelectorPriority?: string[];
}

export interface StepConversionResult {
  cypressCommands: CypressCommand[];
  warnings: string[];
  errors: string[];
  complexity: number;
}

export interface SelectorOptimization {
  original: string;
  optimized: string;
  confidence: number;
  fallbacks: string[];
  reasoning: string;
}

export class TestCaseToCypressConverter {
  private scriptGenerator: CypressScriptGenerator;
  private conversionCache: Map<string, ConversionResult> = new Map();
  private selectorOptimizations: Map<string, SelectorOptimization> = new Map();

  constructor(scriptGenerator: CypressScriptGenerator) {
    this.scriptGenerator = scriptGenerator;
  }

  async convertTestCase(
    testCase: TestCase,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis,
    _options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    const cacheKey = this.generateCacheKey(testCase, _options);
    
    // Check cache first
    if (this.conversionCache.has(cacheKey)) {
      return this.conversionCache.get(cacheKey)!;
    }

    const result: ConversionResult = {
      success: false,
      generatedScript: null,
      warnings: [],
      errors: [],
      statistics: {
        stepsConverted: 0,
        assertionsGenerated: 0,
        commandsUsed: [],
        complexityScore: 0
      }
    };

    try {
      // Validate inputs
      const validationResult = this.validateInputs(testCase, linkedData, pageAnalysis);
      if (!validationResult.isValid) {
        result.errors.push(...validationResult.errors);
        result.warnings.push(...validationResult.warnings);
        
        if (_options.strictMode) {
          return result;
        }
      }

      // Convert test steps to Cypress commands
      const stepConversions = await this.convertTestSteps(
        testCase,
        linkedData,
        pageAnalysis,
_options
      );

      // Analyze conversion results
      result.warnings.push(...stepConversions.flatMap(sc => sc.warnings));
      result.errors.push(...stepConversions.flatMap(sc => sc.errors));

      // Calculate statistics
      result.statistics.stepsConverted = stepConversions.length;
      result.statistics.complexityScore = this.calculateComplexityScore(stepConversions);
      result.statistics.commandsUsed = this.extractUsedCommands(stepConversions);
      result.statistics.assertionsGenerated = this.countAssertions(stepConversions);

      // Generate the actual Cypress script
      if (result.errors.length === 0 || !_options.strictMode) {
        result.generatedScript = await this.scriptGenerator.generateScript(
          testCase,
          linkedData,
          { pageAnalysis } as any, // Simplified for this context
          pageAnalysis
        );
        result.success = true;
      }

      // Cache the result
      this.conversionCache.set(cacheKey, result);

    } catch (error) {
      result.errors.push(`Conversion failed: ${error}`);
      result.success = false;
    }

    return result;
  }

  async convertMultipleTestCases(
    testCases: TestCase[],
    linkedDataMap: Map<string, LinkedTestData>,
    pageAnalysisMap: Map<string, PageAnalysis>,
    _options: ConversionOptions = {}
  ): Promise<Map<string, ConversionResult>> {
    const results = new Map<string, ConversionResult>();

    for (const testCase of testCases) {
      const linkedData = linkedDataMap.get(testCase.id);
      const pageAnalysis = pageAnalysisMap.get(testCase.id);

      if (linkedData && pageAnalysis) {
        try {
          const result = await this.convertTestCase(testCase, linkedData, pageAnalysis, _options);
          results.set(testCase.id, result);
        } catch (error) {
          results.set(testCase.id, {
            success: false,
            generatedScript: null,
            warnings: [],
            errors: [`Failed to convert test case: ${error}`],
            statistics: {
              stepsConverted: 0,
              assertionsGenerated: 0,
              commandsUsed: [],
              complexityScore: 0
            }
          });
        }
      } else {
        results.set(testCase.id, {
          success: false,
          generatedScript: null,
          warnings: [],
          errors: ['Missing linked data or page analysis'],
          statistics: {
            stepsConverted: 0,
            assertionsGenerated: 0,
            commandsUsed: [],
            complexityScore: 0
          }
        });
      }
    }

    return results;
  }

  private async convertTestSteps(
    testCase: TestCase,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis,
    _options: ConversionOptions
  ): Promise<StepConversionResult[]> {
    const conversions: StepConversionResult[] = [];

    // Convert steps from linkedData (which has processed steps)
    for (const step of linkedData.generatedSteps) {
      const conversion = await this.convertSingleStep(
        step,
        linkedData,
        pageAnalysis,
_options
      );
      conversions.push(conversion);
    }

    // If no generated steps, try to convert original test case steps
    if (conversions.length === 0 && testCase.test_data?.steps) {
      for (const step of testCase.test_data.steps) {
        const conversion = await this.convertOriginalStep(
          step,
          linkedData,
          pageAnalysis,
  _options
        );
        conversions.push(conversion);
      }
    }

    return conversions;
  }

  private async convertSingleStep(
    step: any,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis,
    _options: ConversionOptions
  ): Promise<StepConversionResult> {
    const result: StepConversionResult = {
      cypressCommands: [],
      warnings: [],
      errors: [],
      complexity: 1
    };

    try {
      // Get inputs for this step
      const stepInputs = Object.entries(linkedData.inputs).filter(
        ([_, inputData]) => inputData.mapping.stepNumber === step.step
      );

      // Convert each input to Cypress commands
      for (const [_inputId, inputData] of stepInputs) {
        const commands = await this.convertInputToCypressCommands(
          inputData,
          pageAnalysis,
  _options
        );
        result.cypressCommands.push(...commands);
      }

      // Add step-specific commands
      if (step.action) {
        const actionCommands = this.parseActionToCypressCommands(step.action, _options);
        result.cypressCommands.push(...actionCommands);
      }

      // Add assertions for expected results
      if (step.expectedResult) {
        const assertionCommands = this.generateAssertionCommands(step.expectedResult);
        result.cypressCommands.push(...assertionCommands);
      }

      // Calculate complexity
      result.complexity = this.calculateStepComplexity(result.cypressCommands);

    } catch (error) {
      result.errors.push(`Failed to convert step ${step.step}: ${error}`);
      result.complexity = 5; // High complexity for failed conversions
    }

    return result;
  }

  private async convertOriginalStep(
    step: TestStep,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis,
    _options: ConversionOptions
  ): Promise<StepConversionResult> {
    const result: StepConversionResult = {
      cypressCommands: [],
      warnings: [],
      errors: [],
      complexity: 1
    };

    try {
      // Parse the step description to understand the action
      const actionType = this.inferActionType(step.description || '', step.action);
      
      switch (actionType) {
        case 'navigate':
          result.cypressCommands.push(...this.generateNavigationCommands(step, pageAnalysis));
          break;
        case 'fill':
          result.cypressCommands.push(...this.generateFormFillCommands(step, pageAnalysis, linkedData));
          break;
        case 'click':
          result.cypressCommands.push(...this.generateClickCommands(step, pageAnalysis));
          break;
        case 'verify':
          result.cypressCommands.push(...this.generateVerificationCommands(step, pageAnalysis));
          break;
        default:
          result.cypressCommands.push(...this.generateGenericCommands(step, pageAnalysis));
          result.warnings.push(`Unknown action type for step: ${step.description}`);
      }

      result.complexity = this.calculateStepComplexity(result.cypressCommands);

    } catch (error) {
      result.errors.push(`Failed to convert original step ${step.action}: ${error}`);
      result.complexity = 5;
    }

    return result;
  }

  private async convertInputToCypressCommands(
    inputData: any,
    pageAnalysis: PageAnalysis,
    _options: ConversionOptions
  ): Promise<CypressCommand[]> {
    const commands: CypressCommand[] = [];
    const mapping = inputData.mapping;
    const selector = _options.optimizeSelectors ? 
      await this.optimizeSelector(mapping.fieldMapping.selector, pageAnalysis) :
      mapping.fieldMapping.selector;

    // Add wait command for element visibility
    commands.push({
      command: 'get',
      target: selector,
      options: { timeout: 10000 },
      description: `Wait for ${selector} to be visible`
    });

    commands.push({
      command: 'should',
      target: 'be.visible',
      description: `Verify ${selector} is visible`
    });

    // Add the main action command
    switch (mapping.fieldMapping.action) {
      case 'fill':
        if (mapping.fieldMapping.preprocessor === 'clear-first') {
          commands.push({
            command: 'clear',
            description: `Clear ${selector}`
          });
        }
        commands.push({
          command: 'type',
          target: selector,
          value: inputData.processedValue,
          description: `Type '${inputData.processedValue}' into ${selector}`
        });
        break;

      case 'select':
        commands.push({
          command: 'select',
          target: selector,
          value: inputData.processedValue,
          description: `Select '${inputData.processedValue}' from ${selector}`
        });
        break;

      case 'check':
        const checkCommand = inputData.processedValue ? 'check' : 'uncheck';
        commands.push({
          command: checkCommand,
          target: selector,
          description: `${checkCommand} ${selector}`
        });
        break;

      case 'click':
        commands.push({
          command: 'click',
          target: selector,
          description: `Click ${selector}`
        });
        break;
    }

    // Add validation commands if specified
    if (mapping.fieldMapping.validation) {
      for (const validation of mapping.fieldMapping.validation) {
        commands.push({
          command: 'should',
          target: selector,
          value: validation,
          description: `Validate ${selector} ${validation}`
        });
      }
    }

    return commands;
  }

  private parseActionToCypressCommands(action: string, _options: ConversionOptions): CypressCommand[] {
    const commands: CypressCommand[] = [];
    
    // Split action into individual lines/commands
    const actionLines = action.split('\n').filter(line => line.trim());
    
    for (const line of actionLines) {
      const trimmedLine = line.trim();
      
      // Skip comments
      if (trimmedLine.startsWith('//')) {
        continue;
      }

      // Parse Cypress commands that are already in the action
      if (trimmedLine.startsWith('cy.')) {
        const parsed = this.parseCypressCommand(trimmedLine);
        if (parsed) {
          commands.push(parsed);
        }
      } else {
        // Convert natural language to Cypress commands
        const converted = this.convertNaturalLanguageToCypress(trimmedLine);
        commands.push(...converted);
      }
    }

    return commands;
  }

  private parseCypressCommand(commandString: string): CypressCommand | null {
    // Parse commands like: cy.get('selector').click()
    const chainPattern = /cy\.(\w+)\(['"]([^'"]*)['"]\)(?:\.(\w+)\(['"]?([^'"]*)?['"]?\))?/;
    const match = commandString.match(chainPattern);
    
    if (match) {
      const [, firstCommand, firstTarget, secondCommand, secondValue] = match;
      
      if (secondCommand) {
        // Chained command
        return {
          command: `${firstCommand}.${secondCommand}`,
          target: firstTarget,
          value: secondValue,
          description: `Execute ${firstCommand}('${firstTarget}').${secondCommand}(${secondValue || ''})`
        };
      } else {
        // Single command
        return {
          command: firstCommand,
          target: firstTarget,
          description: `Execute ${firstCommand}('${firstTarget}')`
        };
      }
    }

    return null;
  }

  private convertNaturalLanguageToCypress(naturalLanguage: string): CypressCommand[] {
    const commands: CypressCommand[] = [];
    const lower = naturalLanguage.toLowerCase();

    if (lower.includes('click') || lower.includes('press')) {
      // Extract target from natural language
      const target = this.extractTargetFromNaturalLanguage(naturalLanguage, 'click');
      commands.push({
        command: 'click',
        target: target || 'button',
        description: naturalLanguage
      });
    } else if (lower.includes('type') || lower.includes('enter') || lower.includes('input')) {
      const target = this.extractTargetFromNaturalLanguage(naturalLanguage, 'input');
      const value = this.extractValueFromNaturalLanguage(naturalLanguage);
      commands.push({
        command: 'type',
        target: target || 'input',
        value: value || 'test value',
        description: naturalLanguage
      });
    } else if (lower.includes('verify') || lower.includes('check') || lower.includes('ensure')) {
      const target = this.extractTargetFromNaturalLanguage(naturalLanguage, 'verify');
      commands.push({
        command: 'should',
        target: target || 'body',
        value: 'be.visible',
        description: naturalLanguage
      });
    } else {
      // Generic action
      commands.push({
        command: 'get',
        target: 'body',
        description: `Generic action: ${naturalLanguage}`
      });
    }

    return commands;
  }

  private generateNavigationCommands(_step: TestStep, pageAnalysis: PageAnalysis): CypressCommand[] {
    return [{
      command: 'visit',
      target: pageAnalysis.url,
      description: `Navigate to ${pageAnalysis.url}`
    }];
  }

  private generateFormFillCommands(
    _step: TestStep,
    pageAnalysis: PageAnalysis,
    _linkedData: LinkedTestData
  ): CypressCommand[] {
    const commands: CypressCommand[] = [];
    
    // Find the most relevant form
    const form = pageAnalysis.forms[0]; // Simplified - take first form
    if (form) {
      commands.push({
        command: 'get',
        target: form.selector,
        description: `Get form ${form.selector}`
      });

      commands.push({
        command: 'within',
        target: form.selector,
        description: `Work within form ${form.selector}`
      });
    }

    return commands;
  }

  private generateClickCommands(step: TestStep, pageAnalysis: PageAnalysis): CypressCommand[] {
    // Try to find a clickable element based on step description
    const clickableElements = [
      ...pageAnalysis.interactiveElements,
      ...pageAnalysis.forms.flatMap(f => f.submitButtons)
    ];

    const target = clickableElements[0]?.selector || 'button';
    
    return [{
      command: 'click',
      target,
      description: step.description
    }];
  }

  private generateVerificationCommands(step: TestStep, _pageAnalysis: PageAnalysis): CypressCommand[] {
    return [{
      command: 'should',
      target: 'body',
      value: 'contain.text',
      options: { text: this.extractExpectedText(step.description || '') },
      description: step.description
    }];
  }

  private generateGenericCommands(step: TestStep, _pageAnalysis: PageAnalysis): CypressCommand[] {
    return [{
      command: 'get',
      target: 'body',
      description: `Generic step: ${step.description}`
    }];
  }

  private generateAssertionCommands(expectedResult: string): CypressCommand[] {
    const commands: CypressCommand[] = [];
    
    if (expectedResult.toLowerCase().includes('success')) {
      commands.push({
        command: 'should',
        target: 'body',
        value: 'contain.text',
        options: { text: 'success' },
        description: `Verify success message`
      });
    }

    if (expectedResult.toLowerCase().includes('error')) {
      commands.push({
        command: 'should',
        target: 'body',
        value: 'not.contain.text',
        options: { text: 'error' },
        description: `Verify no error message`
      });
    }

    if (expectedResult.toLowerCase().includes('redirect') || expectedResult.toLowerCase().includes('navigate')) {
      commands.push({
        command: 'url',
        description: `Verify URL change`
      });
    }

    return commands;
  }

  private async optimizeSelector(
    selector: string,
    pageAnalysis: PageAnalysis
  ): Promise<string> {
    // Check cache first
    if (this.selectorOptimizations.has(selector)) {
      return this.selectorOptimizations.get(selector)!.optimized;
    }

    const optimization = this.createSelectorOptimization(selector, pageAnalysis);
    this.selectorOptimizations.set(selector, optimization);
    
    return optimization.optimized;
  }

  private createSelectorOptimization(
    selector: string,
    pageAnalysis: PageAnalysis
  ): SelectorOptimization {
    // Priority order for selectors
    // const _priorities = [
    //   'data-testid',
    //   'data-cy', 
    //   'id',
    //   'name',
    //   'class',
    //   'type',
    //   'tag'
    // ];

    let optimized = selector;
    let confidence = 0.5;
    const fallbacks: string[] = [selector];
    let reasoning = 'Original selector';

    // Try to find better selectors based on page analysis
    const allElements = [
      ...pageAnalysis.interactiveElements,
      ...pageAnalysis.forms.flatMap(f => [...f.fields, ...f.submitButtons]),
      ...pageAnalysis.links
    ];

    // Look for elements that might match this selector
    for (const element of allElements) {
      if (element.id) {
        const idSelector = `#${element.id}`;
        if (idSelector !== selector) {
          fallbacks.push(idSelector);
          if (confidence < 0.9) {
            optimized = idSelector;
            confidence = 0.9;
            reasoning = 'ID selector is more reliable';
          }
        }
      }

      if (element.name) {
        const nameSelector = `[name="${element.name}"]`;
        if (nameSelector !== selector && confidence < 0.7) {
          fallbacks.push(nameSelector);
          optimized = nameSelector;
          confidence = 0.7;
          reasoning = 'Name selector is more semantic';
        }
      }
    }

    return {
      original: selector,
      optimized,
      confidence,
      fallbacks,
      reasoning
    };
  }

  // Helper methods
  private validateInputs(
    testCase: TestCase,
    linkedData: LinkedTestData,
    pageAnalysis: PageAnalysis
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!testCase.id) {
      errors.push('Test case missing ID');
    }

    if (!linkedData.generatedSteps || linkedData.generatedSteps.length === 0) {
      warnings.push('No generated steps found, will try to convert original steps');
    }

    if (!pageAnalysis.url) {
      errors.push('Page analysis missing URL');
    }

    if (pageAnalysis.errors && pageAnalysis.errors.length > 0) {
      warnings.push(`Page analysis has errors: ${pageAnalysis.errors.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private inferActionType(description: string, _action?: string): string {
    const lower = description.toLowerCase();
    
    if (lower.includes('navigate') || lower.includes('visit') || lower.includes('go to')) {
      return 'navigate';
    }
    
    if (lower.includes('fill') || lower.includes('enter') || lower.includes('type')) {
      return 'fill';
    }
    
    if (lower.includes('click') || lower.includes('press') || lower.includes('submit')) {
      return 'click';
    }
    
    if (lower.includes('verify') || lower.includes('check') || lower.includes('ensure')) {
      return 'verify';
    }
    
    return 'generic';
  }

  private extractTargetFromNaturalLanguage(text: string, actionType: string): string {
    // Simple extraction based on common patterns
    if (actionType === 'click') {
      const buttonMatch = text.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+)["']?\s+button/i);
      if (buttonMatch) return `button:contains("${buttonMatch[1]}")`;
      
      const linkMatch = text.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"']+)["']?\s+link/i);
      if (linkMatch) return `a:contains("${linkMatch[1]}")`;
    }

    if (actionType === 'input') {
      const fieldMatch = text.match(/(?:enter|type|input)\s+.*?(?:in|into)\s+(?:the\s+)?["']?([^"']+)["']?\s+field/i);
      if (fieldMatch) return `[name="${fieldMatch[1]}"], #${fieldMatch[1]}`;
    }

    return 'body';
  }

  private extractValueFromNaturalLanguage(text: string): string {
    const valueMatch = text.match(/["']([^"']+)["']/);
    return valueMatch ? valueMatch[1] : 'test value';
  }

  private extractExpectedText(text: string): string {
    // Extract key words from expected result
    const words = text.toLowerCase().split(/\s+/);
    const keywords = words.filter(word => 
      word.length > 3 && 
      !['should', 'will', 'must', 'the', 'and', 'or', 'but'].includes(word)
    );
    return keywords[0] || 'success';
  }

  private calculateStepComplexity(commands: CypressCommand[]): number {
    let complexity = 1;
    
    // Add complexity based on number of commands
    complexity += commands.length * 0.5;
    
    // Add complexity for specific command types
    for (const command of commands) {
      if (command.command.includes('within')) complexity += 2;
      if (command.command.includes('wait')) complexity += 1;
      if (command.command.includes('should')) complexity += 0.5;
      if (command.options) complexity += 1;
    }
    
    return Math.min(complexity, 10); // Cap at 10
  }

  private calculateComplexityScore(conversions: StepConversionResult[]): number {
    const totalComplexity = conversions.reduce((sum, conv) => sum + conv.complexity, 0);
    return Math.round(totalComplexity / conversions.length * 10) / 10;
  }

  private extractUsedCommands(conversions: StepConversionResult[]): string[] {
    const commands = new Set<string>();
    
    for (const conversion of conversions) {
      for (const command of conversion.cypressCommands) {
        commands.add(command.command);
      }
    }
    
    return Array.from(commands).sort();
  }

  private countAssertions(conversions: StepConversionResult[]): number {
    let count = 0;
    
    for (const conversion of conversions) {
      for (const command of conversion.cypressCommands) {
        if (command.command.includes('should') || command.command.includes('expect')) {
          count++;
        }
      }
    }
    
    return count;
  }

  private generateCacheKey(testCase: TestCase, options: ConversionOptions): string {
    return `${testCase.id}-${JSON.stringify(options)}`;
  }

  // Public API methods
  getConversionResult(testCaseId: string): ConversionResult | undefined {
    // Find in cache by test case ID
    for (const [key, result] of this.conversionCache) {
      if (key.startsWith(testCaseId)) {
        return result;
      }
    }
    return undefined;
  }

  clearCache(): void {
    this.conversionCache.clear();
    this.selectorOptimizations.clear();
  }

  getOptimizedSelector(originalSelector: string): SelectorOptimization | undefined {
    return this.selectorOptimizations.get(originalSelector);
  }

  getAllOptimizedSelectors(): Map<string, SelectorOptimization> {
    return new Map(this.selectorOptimizations);
  }

  generateConversionReport(results: Map<string, ConversionResult>): {
    totalTestCases: number;
    successfulConversions: number;
    failedConversions: number;
    averageComplexity: number;
    mostUsedCommands: string[];
    commonWarnings: string[];
    commonErrors: string[];
  } {
    const values = Array.from(results.values());
    
    return {
      totalTestCases: values.length,
      successfulConversions: values.filter(r => r.success).length,
      failedConversions: values.filter(r => !r.success).length,
      averageComplexity: values.reduce((sum, r) => sum + r.statistics.complexityScore, 0) / values.length,
      mostUsedCommands: this.getMostFrequentItems(values.flatMap(r => r.statistics.commandsUsed)),
      commonWarnings: this.getMostFrequentItems(values.flatMap(r => r.warnings)),
      commonErrors: this.getMostFrequentItems(values.flatMap(r => r.errors))
    };
  }

  private getMostFrequentItems(items: string[]): string[] {
    const frequency = new Map<string, number>();
    
    for (const item of items) {
      frequency.set(item, (frequency.get(item) || 0) + 1);
    }
    
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([item]) => item);
  }
}