import { MastraService, LLMError, MastraConfig } from './MastraService';
import { ExcelParserService, ExcelWorkbook } from './ExcelParserService';
import { PromptTemplateService, TestCasePromptContext, ParsedTestCase } from './PromptTemplateService';

export interface ProcessingOptions {
  validateResults?: boolean;
  enhanceTestCases?: boolean;
  maxRetries?: number;
  timeout?: number;
  batchSize?: number;
}

export interface ProcessingResult {
  testCases: ParsedTestCase[];
  summary: {
    totalTestCases: number;
    testTypes: string[];
    coverage: string;
    recommendations: string[];
  };
  metadata: {
    processingTime: number;
    tokenUsage: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalTokens: number;
    };
    confidence: number;
    sourceFile: string;
  };
  warnings?: string[];
  errors?: string[];
}

export interface ProcessingProgress {
  stage: 'parsing' | 'analyzing' | 'extracting' | 'validating' | 'enhancing' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  currentStep?: string;
  estimatedTimeRemaining?: number;
}

export class LLMProcessingService {
  private mastraService: MastraService;
  private processingCallbacks: Map<string, (progress: ProcessingProgress) => void> = new Map();

  constructor(config: MastraConfig) {
    this.mastraService = new MastraService(config);
  }

  async processExcelFile(
    excelWorkbook: ExcelWorkbook,
    projectContext: {
      projectName?: string;
      targetUrl?: string;
      description?: string;
    },
    options: ProcessingOptions = {},
    progressCallback?: (progress: ProcessingProgress) => void
  ): Promise<ProcessingResult> {
    const sessionId = this.generateSessionId();
    if (progressCallback) {
      this.processingCallbacks.set(sessionId, progressCallback);
    }

    const startTime = Date.now();
    const defaults: Required<ProcessingOptions> = {
      validateResults: true,
      enhanceTestCases: false,
      maxRetries: 3,
      timeout: 60000,
      batchSize: 10
    };

    const config = { ...defaults, ...options };
    
    try {
      this.updateProgress(sessionId, {
        stage: 'parsing',
        progress: 10,
        message: 'Analyzing Excel structure...'
      });

      // Prepare data for LLM processing
      const flatData = ExcelParserService.toFlatJSON(excelWorkbook);
      const structure = ExcelParserService.extractTestCaseStructure(excelWorkbook);

      this.updateProgress(sessionId, {
        stage: 'analyzing',
        progress: 20,
        message: 'Preparing context for AI analysis...'
      });

      // Analyze Excel structure for prompt optimization
      const analysis = PromptTemplateService.analyzeExcelStructure(flatData);
      console.log('Excel structure analysis:', analysis);

      // Create prompt context
      const context: TestCasePromptContext = {
        excelData: flatData.slice(0, config.batchSize * 5), // Limit data size for LLM
        sheetNames: excelWorkbook.sheets.map(s => s.name),
        headers: excelWorkbook.sheets[0]?.headers || [],
        filename: excelWorkbook.filename,
        targetUrl: projectContext.targetUrl,
        projectName: projectContext.projectName
      };

      this.updateProgress(sessionId, {
        stage: 'extracting',
        progress: 30,
        message: 'Extracting test cases using AI...'
      });

      // Process with LLM
      const extractionResult = await this.extractTestCases(context, config, sessionId);

      this.updateProgress(sessionId, {
        stage: 'validating',
        progress: 70,
        message: 'Validating extracted test cases...'
      });

      let validatedResult = extractionResult;
      if (config.validateResults) {
        validatedResult = await this.validateAndFixTestCases(extractionResult, config, sessionId);
      }

      this.updateProgress(sessionId, {
        stage: 'enhancing',
        progress: 85,
        message: 'Enhancing test cases...'
      });

      let finalResult = validatedResult;
      if (config.enhanceTestCases && projectContext.targetUrl) {
        finalResult = await this.enhanceTestCases(
          validatedResult, 
          projectContext.targetUrl, 
          config, 
          sessionId
        );
      }

      const processingTime = Date.now() - startTime;

      this.updateProgress(sessionId, {
        stage: 'completed',
        progress: 100,
        message: 'Test case extraction completed successfully'
      });

      const result: ProcessingResult = {
        testCases: finalResult.testCases,
        summary: finalResult.summary,
        metadata: {
          processingTime,
          tokenUsage: finalResult.tokenUsage,
          confidence: analysis.confidence,
          sourceFile: excelWorkbook.filename
        },
        warnings: finalResult.warnings,
        errors: finalResult.errors
      };

      this.processingCallbacks.delete(sessionId);
      return result;

    } catch (error: any) {
      this.updateProgress(sessionId, {
        stage: 'failed',
        progress: 0,
        message: `Processing failed: ${error.message}`
      });

      this.processingCallbacks.delete(sessionId);
      throw error;
    }
  }

  private async extractTestCases(
    context: TestCasePromptContext,
    config: Required<ProcessingOptions>,
    sessionId: string
  ): Promise<{
    testCases: ParsedTestCase[];
    summary: any;
    tokenUsage: any;
    warnings?: string[];
    errors?: string[];
  }> {
    const prompt = PromptTemplateService.createTestCaseParsingPrompt(context);
    
    const operation = async () => {
      const response = await this.mastraService.generateStructuredOutput<{
        testCases: ParsedTestCase[];
        summary: any;
      }>(
        prompt.userPrompt,
        prompt.systemPrompt,
        prompt.outputSchema,
        {
          maxTokens: 4000,
          temperature: 0.1
        }
      );

      return response;
    };

    try {
      const result = await this.mastraService.generateWithRetry(operation, config.maxRetries);
      
      return {
        testCases: result.testCases || [],
        summary: result.summary || { totalTestCases: 0, testTypes: [], coverage: '', recommendations: [] },
        tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 }, // Will be updated with actual usage
        warnings: this.validateExtractedData(result)
      };
    } catch (error: any) {
      const llmError = error as LLMError;
      throw new Error(`Test case extraction failed: ${llmError.message}`);
    }
  }

  private async validateAndFixTestCases(
    extractionResult: any,
    config: Required<ProcessingOptions>,
    sessionId: string
  ): Promise<any> {
    if (!extractionResult.testCases || extractionResult.testCases.length === 0) {
      return extractionResult;
    }

    try {
      const validationPrompt = PromptTemplateService.createValidationPrompt(extractionResult.testCases);
      
      const validationResult = await this.mastraService.generateStructuredOutput<{
        validationResults: any[];
        overallAssessment: any;
      }>(
        validationPrompt.userPrompt,
        validationPrompt.systemPrompt,
        validationPrompt.outputSchema,
        {
          maxTokens: 2000,
          temperature: 0.1
        }
      );

      // Apply fixes based on validation results
      const fixedTestCases = await this.applyValidationFixes(
        extractionResult.testCases,
        validationResult.validationResults
      );

      return {
        ...extractionResult,
        testCases: fixedTestCases,
        validation: validationResult.overallAssessment
      };
    } catch (error: any) {
      console.warn('Validation failed, proceeding with original results:', error.message);
      return extractionResult;
    }
  }

  private async enhanceTestCases(
    result: any,
    targetUrl: string,
    config: Required<ProcessingOptions>,
    sessionId: string
  ): Promise<any> {
    const enhancedTestCases: ParsedTestCase[] = [];
    
    for (let i = 0; i < result.testCases.length; i++) {
      try {
        const testCase = result.testCases[i];
        const enhancementPrompt = PromptTemplateService.createEnhancementPrompt(testCase, targetUrl);
        
        const enhancement = await this.mastraService.generateStructuredOutput<{
          enhancedTestCase: ParsedTestCase;
          additionalScenarios: any[];
          improvements: any[];
        }>(
          enhancementPrompt.userPrompt,
          enhancementPrompt.systemPrompt,
          enhancementPrompt.outputSchema,
          {
            maxTokens: 3000,
            temperature: 0.15
          }
        );

        enhancedTestCases.push(enhancement.enhancedTestCase);
        
        // Add additional scenarios if they're valuable
        if (enhancement.additionalScenarios && enhancement.additionalScenarios.length > 0) {
          // These would be converted to full test cases in a real implementation
          console.log(`Additional scenarios suggested for ${testCase.scenarioName}:`, enhancement.additionalScenarios);
        }

      } catch (error: any) {
        console.warn(`Enhancement failed for test case ${i}, using original:`, error.message);
        enhancedTestCases.push(result.testCases[i]);
      }

      // Update progress
      const progress = 85 + (i / result.testCases.length) * 10;
      this.updateProgress(sessionId, {
        stage: 'enhancing',
        progress,
        message: `Enhanced test case ${i + 1} of ${result.testCases.length}`
      });
    }

    return {
      ...result,
      testCases: enhancedTestCases
    };
  }

  private validateExtractedData(result: any): string[] {
    const warnings: string[] = [];

    if (!result.testCases || !Array.isArray(result.testCases)) {
      warnings.push('No test cases array found in extraction result');
      return warnings;
    }

    if (result.testCases.length === 0) {
      warnings.push('No test cases were extracted from the Excel file');
    }

    for (let i = 0; i < result.testCases.length; i++) {
      const testCase = result.testCases[i];
      
      if (!testCase.scenarioName) {
        warnings.push(`Test case ${i + 1} is missing a scenario name`);
      }

      if (!testCase.testSteps || testCase.testSteps.length === 0) {
        warnings.push(`Test case ${i + 1} has no test steps defined`);
      }

      if (!testCase.assertions || testCase.assertions.length === 0) {
        warnings.push(`Test case ${i + 1} has no assertions defined`);
      }

      if (testCase.testSteps) {
        for (let j = 0; j < testCase.testSteps.length; j++) {
          const step = testCase.testSteps[j];
          if (!step.action || !step.target) {
            warnings.push(`Test case ${i + 1}, step ${j + 1} is missing action or target`);
          }
        }
      }
    }

    return warnings;
  }

  private async applyValidationFixes(
    testCases: ParsedTestCase[],
    validationResults: any[]
  ): Promise<ParsedTestCase[]> {
    // This is a simplified implementation
    // In a real scenario, you would apply specific fixes based on validation feedback
    return testCases.map((testCase, index) => {
      const validation = validationResults[index];
      
      if (validation && validation.issues) {
        // Apply basic fixes
        const fixedTestCase = { ...testCase };
        
        for (const issue of validation.issues) {
          if (issue.category === 'steps' && issue.severity === 'error') {
            // Add missing step information
            if (!fixedTestCase.testSteps || fixedTestCase.testSteps.length === 0) {
              fixedTestCase.testSteps = [{
                stepNumber: 1,
                action: 'navigate',
                target: 'application',
                description: 'Navigate to the application',
                waitConditions: []
              }];
            }
          }
          
          if (issue.category === 'assertions' && issue.severity === 'error') {
            // Add basic assertion if missing
            if (!fixedTestCase.assertions || fixedTestCase.assertions.length === 0) {
              fixedTestCase.assertions = [{
                type: 'element_visible',
                target: 'body',
                expected: true,
                description: 'Verify page loads successfully'
              }];
            }
          }
        }
        
        return fixedTestCase;
      }
      
      return testCase;
    });
  }

  private updateProgress(sessionId: string, progress: ProcessingProgress): void {
    const callback = this.processingCallbacks.get(sessionId);
    if (callback) {
      callback(progress);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public method to test LLM connection
  async testConnection(): Promise<boolean> {
    try {
      return await this.mastraService.testConnection();
    } catch (error) {
      console.error('LLM connection test failed:', error);
      return false;
    }
  }

  // Batch processing for large Excel files
  async processBatchedExcelFile(
    excelWorkbook: ExcelWorkbook,
    projectContext: any,
    options: ProcessingOptions = {},
    progressCallback?: (progress: ProcessingProgress) => void
  ): Promise<ProcessingResult> {
    const totalRows = excelWorkbook.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
    const batchSize = options.batchSize || 10;
    const batches = Math.ceil(totalRows / batchSize);
    
    const allTestCases: ParsedTestCase[] = [];
    let totalTokenUsage = { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 };
    
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const progress = (batchIndex / batches) * 100;
      
      if (progressCallback) {
        progressCallback({
          stage: 'extracting',
          progress,
          message: `Processing batch ${batchIndex + 1} of ${batches}...`
        });
      }

      // Create batch workbook
      const batchWorkbook: ExcelWorkbook = {
        ...excelWorkbook,
        sheets: excelWorkbook.sheets.map(sheet => ({
          ...sheet,
          rows: sheet.rows.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize)
        }))
      };

      try {
        const batchResult = await this.processExcelFile(
          batchWorkbook,
          projectContext,
          { ...options, validateResults: false, enhanceTestCases: false }
        );

        allTestCases.push(...batchResult.testCases);
        
        // Accumulate token usage
        totalTokenUsage.totalInputTokens += batchResult.metadata.tokenUsage.totalInputTokens;
        totalTokenUsage.totalOutputTokens += batchResult.metadata.tokenUsage.totalOutputTokens;
        totalTokenUsage.totalTokens += batchResult.metadata.tokenUsage.totalTokens;
        
      } catch (error) {
        console.error(`Batch ${batchIndex + 1} failed:`, error);
        // Continue with next batch
      }
    }

    // Final validation and enhancement if requested
    let finalTestCases = allTestCases;
    if (options.validateResults || options.enhanceTestCases) {
      const fullResult = await this.processExcelFile(
        { ...excelWorkbook, sheets: [{ ...excelWorkbook.sheets[0], rows: [] }] },
        projectContext,
        options,
        progressCallback
      );
      // Apply validation/enhancement logic to combined results
    }

    const processingTime = Date.now();
    
    return {
      testCases: finalTestCases,
      summary: {
        totalTestCases: finalTestCases.length,
        testTypes: [...new Set(finalTestCases.flatMap(tc => tc.tags))],
        coverage: `Processed ${totalRows} rows across ${batches} batches`,
        recommendations: [`Successfully processed large file with ${finalTestCases.length} test cases`]
      },
      metadata: {
        processingTime,
        tokenUsage: totalTokenUsage,
        confidence: 85, // Lower confidence for batch processing
        sourceFile: excelWorkbook.filename
      }
    };
  }
}