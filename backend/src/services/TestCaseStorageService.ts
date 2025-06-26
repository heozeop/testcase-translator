import { TestCaseRepository } from '../repositories/TestCaseRepository';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { 
  TestCase, 
  CreateTestCaseInput, 
  TestCaseStatus, 
  TestCaseData 
} from '../types/database';
import { ParsedTestCase, TestStep, Assertion } from './PromptTemplateService';
import { ProcessingResult } from './LLMProcessingService';
import { transaction } from '../db';

export interface StorageResult {
  stored: TestCase[];
  errors: StorageError[];
  summary: {
    totalProcessed: number;
    successfullyStored: number;
    failed: number;
    duplicates: number;
    updated: number;
  };
}

export interface StorageError {
  testCaseIndex: number;
  scenarioName: string;
  error: string;
  severity: 'warning' | 'error';
}

export interface StorageOptions {
  overwriteExisting?: boolean;
  validateBeforeStore?: boolean;
  batchSize?: number;
  createProject?: boolean;
  projectName?: string;
  targetUrl?: string;
}

export class TestCaseStorageService {
  private testCaseRepository: TestCaseRepository;
  private projectRepository: ProjectRepository;

  constructor() {
    this.testCaseRepository = new TestCaseRepository();
    this.projectRepository = new ProjectRepository();
  }

  async storeProcessingResult(
    processingResult: ProcessingResult,
    projectId: string,
    options: StorageOptions = {}
  ): Promise<StorageResult> {
    const defaults: Required<StorageOptions> = {
      overwriteExisting: false,
      validateBeforeStore: true,
      batchSize: 10,
      createProject: false,
      projectName: '',
      targetUrl: ''
    };

    const config = { ...defaults, ...options };
    
    // Verify project exists
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    const result: StorageResult = {
      stored: [],
      errors: [],
      summary: {
        totalProcessed: processingResult.testCases.length,
        successfullyStored: 0,
        failed: 0,
        duplicates: 0,
        updated: 0
      }
    };

    // Process test cases in batches
    const batches = this.createBatches(processingResult.testCases, config.batchSize);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        const batchResult = await this.processBatch(
          batch,
          projectId,
          config,
          batchIndex * config.batchSize
        );
        
        result.stored.push(...batchResult.stored);
        result.errors.push(...batchResult.errors);
        result.summary.successfullyStored += batchResult.summary.successfullyStored;
        result.summary.failed += batchResult.summary.failed;
        result.summary.duplicates += batchResult.summary.duplicates;
        result.summary.updated += batchResult.summary.updated;
        
      } catch (error: any) {
        console.error(`Batch ${batchIndex} storage failed:`, error);
        
        // Add errors for all test cases in this batch
        batch.forEach((testCase, index) => {
          result.errors.push({
            testCaseIndex: batchIndex * config.batchSize + index,
            scenarioName: testCase.scenarioName,
            error: `Batch processing failed: ${error.message}`,
            severity: 'error'
          });
          result.summary.failed++;
        });
      }
    }

    return result;
  }

  private async processBatch(
    batch: ParsedTestCase[],
    projectId: string,
    config: Required<StorageOptions>,
    startIndex: number
  ): Promise<StorageResult> {
    const result: StorageResult = {
      stored: [],
      errors: [],
      summary: {
        totalProcessed: batch.length,
        successfullyStored: 0,
        failed: 0,
        duplicates: 0,
        updated: 0
      }
    };

    return transaction(async (client) => {
      for (let i = 0; i < batch.length; i++) {
        const testCase = batch[i];
        const testCaseIndex = startIndex + i;
        
        try {
          // Validate test case if requested
          if (config.validateBeforeStore) {
            const validationErrors = this.validateTestCase(testCase);
            if (validationErrors.length > 0) {
              result.errors.push({
                testCaseIndex,
                scenarioName: testCase.scenarioName,
                error: `Validation failed: ${validationErrors.join(', ')}`,
                severity: 'warning'
              });
              
              // Skip if critical validation errors
              if (validationErrors.some(err => err.includes('missing'))) {
                result.summary.failed++;
                continue;
              }
            }
          }

          // Check for existing test case with same name
          const existingTestCases = await this.testCaseRepository.findByProjectId(projectId, {
            limit: 100
          });
          
          const duplicate = existingTestCases.data.find(
            existing => existing.scenario_name.toLowerCase() === testCase.scenarioName.toLowerCase()
          );

          let storedTestCase: TestCase;

          if (duplicate) {
            if (config.overwriteExisting) {
              // Update existing test case
              const updateData = this.convertToTestCaseData(testCase);
              const updated = await this.testCaseRepository.update(duplicate.id, {
                scenario_name: testCase.scenarioName,
                test_data: updateData,
                status: TestCaseStatus.PENDING
              });

              if (updated) {
                storedTestCase = updated;
                result.summary.updated++;
              } else {
                throw new Error('Failed to update existing test case');
              }
            } else {
              result.errors.push({
                testCaseIndex,
                scenarioName: testCase.scenarioName,
                error: 'Test case with same name already exists',
                severity: 'warning'
              });
              result.summary.duplicates++;
              continue;
            }
          } else {
            // Create new test case
            const createData: CreateTestCaseInput = {
              project_id: projectId,
              scenario_name: testCase.scenarioName,
              test_data: this.convertToTestCaseData(testCase),
              status: TestCaseStatus.PENDING
            };

            storedTestCase = await this.testCaseRepository.create(createData);
            result.summary.successfullyStored++;
          }

          result.stored.push(storedTestCase);

        } catch (error: any) {
          console.error(`Failed to store test case ${testCaseIndex}:`, error);
          result.errors.push({
            testCaseIndex,
            scenarioName: testCase.scenarioName,
            error: error.message,
            severity: 'error'
          });
          result.summary.failed++;
        }
      }

      return result;
    });
  }

  private convertToTestCaseData(parsedTestCase: ParsedTestCase): TestCaseData {
    return {
      steps: parsedTestCase.testSteps.map(step => ({
        action: step.action,
        target: step.target,
        value: step.value,
        description: step.description
      })),
      assertions: parsedTestCase.assertions.map(assertion => ({
        type: assertion.type,
        target: assertion.target,
        expected: assertion.expected,
        description: assertion.description
      })),
      inputs: parsedTestCase.inputData,
      metadata: {
        priority: parsedTestCase.priority,
        tags: parsedTestCase.tags,
        sourceRow: parsedTestCase.metadata.sourceRow,
        sourceSheet: parsedTestCase.metadata.sourceSheet,
        estimatedDuration: parsedTestCase.metadata.estimatedDuration,
        expectedResults: parsedTestCase.expectedResults,
        description: parsedTestCase.description
      }
    };
  }

  private validateTestCase(testCase: ParsedTestCase): string[] {
    const errors: string[] = [];

    if (!testCase.scenarioName || testCase.scenarioName.trim().length === 0) {
      errors.push('Scenario name is missing or empty');
    }

    if (!testCase.testSteps || testCase.testSteps.length === 0) {
      errors.push('Test steps are missing');
    } else {
      testCase.testSteps.forEach((step, index) => {
        if (!step.action) {
          errors.push(`Step ${index + 1} is missing action`);
        }
        if (!step.target) {
          errors.push(`Step ${index + 1} is missing target`);
        }
        if (!step.description) {
          errors.push(`Step ${index + 1} is missing description`);
        }
      });
    }

    if (!testCase.assertions || testCase.assertions.length === 0) {
      errors.push('Assertions are missing');
    } else {
      testCase.assertions.forEach((assertion, index) => {
        if (!assertion.type) {
          errors.push(`Assertion ${index + 1} is missing type`);
        }
        if (!assertion.target) {
          errors.push(`Assertion ${index + 1} is missing target`);
        }
        if (assertion.expected === undefined || assertion.expected === null) {
          errors.push(`Assertion ${index + 1} is missing expected value`);
        }
      });
    }

    if (!testCase.priority || !['high', 'medium', 'low'].includes(testCase.priority)) {
      errors.push('Invalid or missing priority');
    }

    if (!testCase.metadata || !testCase.metadata.sourceRow) {
      errors.push('Missing source metadata');
    }

    return errors;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  async createProjectFromProcessingResult(
    processingResult: ProcessingResult,
    projectName: string,
    targetUrl: string,
    description?: string
  ): Promise<string> {
    // Check if project already exists
    const existingProject = await this.projectRepository.findByName(projectName);
    if (existingProject) {
      throw new Error(`Project with name "${projectName}" already exists`);
    }

    // Create new project
    const project = await this.projectRepository.create({
      name: projectName,
      target_url: targetUrl,
      description: description || `Generated from ${processingResult.metadata.sourceFile}`
    });

    return project.id;
  }

  async getStorageStatistics(projectId: string): Promise<{
    totalTestCases: number;
    byStatus: Record<TestCaseStatus, number>;
    byPriority: Record<string, number>;
    byTags: Record<string, number>;
    lastUpdated?: Date;
  }> {
    const testCases = await this.testCaseRepository.findByProjectId(projectId, {
      limit: 1000 // Adjust based on needs
    });

    const stats = {
      totalTestCases: testCases.total,
      byStatus: {} as Record<TestCaseStatus, number>,
      byPriority: {} as Record<string, number>,
      byTags: {} as Record<string, number>,
      lastUpdated: undefined as Date | undefined
    };

    // Initialize counters
    Object.values(TestCaseStatus).forEach(status => {
      stats.byStatus[status] = 0;
    });

    let latestUpdate: Date | undefined;

    testCases.data.forEach(testCase => {
      // Count by status
      stats.byStatus[testCase.status]++;

      // Count by priority
      const priority = testCase.test_data.metadata?.priority || 'unknown';
      stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

      // Count by tags
      const tags = testCase.test_data.metadata?.tags || [];
      tags.forEach(tag => {
        stats.byTags[tag] = (stats.byTags[tag] || 0) + 1;
      });

      // Track latest update
      if (!latestUpdate || testCase.updated_at > latestUpdate) {
        latestUpdate = testCase.updated_at;
      }
    });

    stats.lastUpdated = latestUpdate;
    return stats;
  }

  async deleteTestCasesByProject(projectId: string): Promise<number> {
    // Get all test cases for the project
    const testCases = await this.testCaseRepository.findByProjectId(projectId, {
      limit: 10000 // High limit to get all
    });

    let deletedCount = 0;
    
    // Delete in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < testCases.data.length; i += batchSize) {
      const batch = testCases.data.slice(i, i + batchSize);
      
      for (const testCase of batch) {
        const deleted = await this.testCaseRepository.delete(testCase.id);
        if (deleted) {
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  async bulkUpdateTestCaseStatus(
    projectId: string,
    fromStatus: TestCaseStatus,
    toStatus: TestCaseStatus
  ): Promise<number> {
    const testCases = await this.testCaseRepository.findByStatus(fromStatus, {
      limit: 1000
    });

    const projectTestCases = testCases.data.filter(tc => tc.project_id === projectId);
    let updatedCount = 0;

    for (const testCase of projectTestCases) {
      const updated = await this.testCaseRepository.updateStatus(testCase.id, toStatus);
      if (updated) {
        updatedCount++;
      }
    }

    return updatedCount;
  }
}