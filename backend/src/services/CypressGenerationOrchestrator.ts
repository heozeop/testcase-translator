import { 
  CypressTemplateEngine, 
  CypressTemplateContext,
  CypressTestSuite 
} from './CypressTemplateEngine';
import { 
  CypressSyntaxGenerator, 
  GeneratedCypressFiles,
  CypressGenerationOptions 
} from './CypressSyntaxGenerator';
import { 
  CypressFileOrganizer, 
  OrganizedProject,
  FileOrganizationOptions 
} from './CypressFileOrganizer';
import { 
  CypressTestLifecycleManager,
  TestDataConfiguration,
  TestEnvironment,
  SetupTeardownContext,
  TestDataset
} from './CypressTestLifecycleManager';
import { ExplorationResultsStorage, ExplorationResult } from './ExplorationResultsStorage';
import { GeneratedCodeRepository } from '../repositories/GeneratedCodeRepository';
import { ExplorationResultRepository } from '../repositories/ExplorationResultRepository';

export interface CypressGenerationRequest {
  projectId: string;
  testCaseId?: string;
  explorationResultId?: string;
  templateTypes?: string[];
  generationOptions?: Partial<CypressGenerationOptions>;
  organizationOptions?: Partial<FileOrganizationOptions>;
  lifecycleConfig?: Partial<TestDataConfiguration>;
  environment?: Partial<TestEnvironment>;
  outputPath?: string;
}

export interface CypressGenerationResult {
  id: string;
  projectId: string;
  testCaseId?: string;
  explorationResultId?: string;
  organizationResult: OrganizedProject;
  testSuite: CypressTestSuite;
  generatedFiles: GeneratedCypressFiles;
  metadata: {
    templatesUsed: string[];
    generationTime: number;
    fileCount: number;
    totalLines: number;
    generatedAt: string;
    version: string;
  };
  status: 'success' | 'failed' | 'partial';
  errors: string[];
}

export interface StoredCypressGeneration {
  id: string;
  projectId: string;
  testCaseId?: string;
  explorationResultId?: string;
  projectPath: string;
  configFile: string;
  testFiles: { name: string; path: string; content: string }[];
  fixtureFiles: { name: string; path: string; content: string }[];
  supportFiles: { name: string; path: string; content: string }[];
  packageJson?: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export class CypressGenerationOrchestrator {
  private templateEngine: CypressTemplateEngine;
  private syntaxGenerator: CypressSyntaxGenerator;
  private fileOrganizer: CypressFileOrganizer;
  private lifecycleManager: CypressTestLifecycleManager;
  private explorationStorage: ExplorationResultsStorage;
  private generatedCodeRepository: GeneratedCodeRepository;
  private explorationResultRepository: ExplorationResultRepository;

  constructor(
    explorationStorage: ExplorationResultsStorage,
    generatedCodeRepository: GeneratedCodeRepository,
    explorationResultRepository: ExplorationResultRepository,
    generationOptions: Partial<CypressGenerationOptions> = {},
    organizationOptions: Partial<FileOrganizationOptions> = {},
    lifecycleConfig: Partial<TestDataConfiguration> = {}
  ) {
    this.templateEngine = new CypressTemplateEngine();
    this.syntaxGenerator = new CypressSyntaxGenerator(generationOptions);
    this.fileOrganizer = new CypressFileOrganizer(organizationOptions);
    this.lifecycleManager = new CypressTestLifecycleManager(lifecycleConfig);
    this.explorationStorage = explorationStorage;
    this.generatedCodeRepository = generatedCodeRepository;
    this.explorationResultRepository = explorationResultRepository;
  }

  async generateCypressProject(request: CypressGenerationRequest): Promise<CypressGenerationResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // 1. Load exploration data
      const explorationData = await this.loadExplorationData(request);
      if (!explorationData) {
        throw new Error(`Exploration data not found for request: ${JSON.stringify(request)}`);
      }

      // 2. Create template context
      const context = this.createTemplateContext(explorationData, request);

      // 3. Generate test suite using templates
      const testSuite = this.templateEngine.generateTestSuite(
        context,
        request.templateTypes || ['navigation', 'form']
      );

      // 4. Generate Cypress files
      const generatedFiles = this.syntaxGenerator.generateFiles(testSuite, context);

      // 5. Create lifecycle management context
      const lifecycleContext = this.createLifecycleContext(testSuite, context, request);

      // 6. Enhance files with setup/teardown
      const enhancedFiles = this.enhanceFilesWithLifecycle(generatedFiles, lifecycleContext);

      // 7. Organize files into project structure
      const organizationResult = await this.fileOrganizer.organizeFiles(enhancedFiles, context);

      // 8. Store in database
      const generationId = await this.storeGenerationResult(
        request,
        organizationResult,
        testSuite,
        enhancedFiles,
        explorationData
      );

      // 9. Create result
      const endTime = Date.now();
      const result: CypressGenerationResult = {
        id: generationId,
        projectId: request.projectId,
        testCaseId: request.testCaseId,
        explorationResultId: request.explorationResultId,
        organizationResult,
        testSuite,
        generatedFiles: enhancedFiles,
        metadata: {
          templatesUsed: request.templateTypes || ['navigation', 'form'],
          generationTime: endTime - startTime,
          fileCount: this.countGeneratedFiles(enhancedFiles),
          totalLines: this.countTotalLines(enhancedFiles),
          generatedAt: new Date().toISOString(),
          version: '1.0.0'
        },
        status: 'success',
        errors
      };

      return result;

    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      
      // Return partial result with error information
      return {
        id: '',
        projectId: request.projectId,
        testCaseId: request.testCaseId,
        explorationResultId: request.explorationResultId,
        organizationResult: {} as OrganizedProject,
        testSuite: {} as CypressTestSuite,
        generatedFiles: {
          testFiles: new Map(),
          fixtureFiles: new Map(),
          supportFiles: new Map(),
          configFile: ''
        },
        metadata: {
          templatesUsed: [],
          generationTime: Date.now() - startTime,
          fileCount: 0,
          totalLines: 0,
          generatedAt: new Date().toISOString(),
          version: '1.0.0'
        },
        status: 'failed',
        errors
      };
    }
  }

  private async loadExplorationData(request: CypressGenerationRequest): Promise<ExplorationResult | null> {
    if (request.explorationResultId) {
      return await this.explorationResultRepository.getExplorationResult(request.explorationResultId);
    }
    
    if (request.testCaseId) {
      // Find the most recent exploration result for this test case
      const results = await this.explorationResultRepository.getExplorationResultsByTestCase(request.testCaseId);
      return results.length > 0 ? results[0] : null;
    }

    if (request.projectId) {
      // Find the most recent exploration result for this project
      const results = await this.explorationResultRepository.getExplorationResultsByProject(request.projectId);
      return results.length > 0 ? results[0] : null;
    }

    return null;
  }

  private createTemplateContext(
    explorationData: ExplorationResult,
    request: CypressGenerationRequest
  ): CypressTemplateContext {
    const baseUrl = explorationData.sessions[0]?.navigationSequences[0]?.startUrl || 'http://localhost:3000';
    
    return {
      projectName: `Project-${request.projectId}`,
      testCaseName: explorationData.testCaseId || `TestCase-${Date.now()}`,
      baseUrl,
      actions: explorationData.sessions.flatMap(s => 
        s.navigationSequences.flatMap(seq => seq.actions)
      ),
      pageStates: explorationData.sessions.flatMap(s => 
        s.navigationSequences.flatMap(seq => seq.pageStates)
      ),
      collectedInputs: explorationData.sessions.flatMap(s => 
        s.navigationSequences.flatMap(seq => seq.collectedInputs)
      ),
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        description: `Generated from exploration result ${explorationData.id}`
      }
    };
  }

  private createLifecycleContext(
    testSuite: CypressTestSuite,
    templateContext: CypressTemplateContext,
    request: CypressGenerationRequest
  ): SetupTeardownContext {
    const environment: TestEnvironment = {
      name: 'test',
      baseUrl: templateContext.baseUrl,
      environmentVariables: {
        NODE_ENV: 'test',
        TEST_MODE: 'true'
      },
      cleanupRules: [
        { type: 'localStorage', target: '*', scope: 'test' },
        { type: 'sessionStorage', target: '*', scope: 'test' },
        { type: 'cookies', target: '*', scope: 'test' }
      ],
      ...request.environment
    };

    const datasets: TestDataset[] = [];
    
    // Create form dataset if we have form inputs
    if (templateContext.collectedInputs.length > 0) {
      datasets.push({
        name: 'formData',
        description: 'Form input data collected during exploration',
        data: templateContext.collectedInputs.reduce((acc, input) => {
          acc[input.fieldName] = input.value;
          return acc;
        }, {} as Record<string, any>)
      });
    }

    // Create navigation dataset
    if (templateContext.pageStates.length > 0) {
      datasets.push({
        name: 'navigationData',
        description: 'Page navigation data from exploration',
        data: {
          pages: templateContext.pageStates.map(state => ({
            url: state.url,
            title: state.title,
            timestamp: state.timestamp
          }))
        }
      });
    }

    return {
      testSuiteName: testSuite.suiteName,
      testCaseName: templateContext.testCaseName,
      environment,
      datasets,
      context: templateContext,
      configuration: this.lifecycleManager['configuration']
    };
  }

  private enhanceFilesWithLifecycle(
    files: GeneratedCypressFiles,
    lifecycleContext: SetupTeardownContext
  ): GeneratedCypressFiles {
    const enhancedFiles = { ...files };

    // Add setup/teardown commands to support files
    const setupCommands = this.lifecycleManager.generateSetupCommands(lifecycleContext);
    const teardownCommands = this.lifecycleManager.generateTeardownCommands(lifecycleContext);
    const customCommands = this.lifecycleManager.generateCustomCommands(lifecycleContext);

    // Enhance commands.js
    const existingCommands = files.supportFiles.get('commands.js') || '';
    const enhancedCommands = [
      existingCommands,
      '',
      '// Setup and Teardown Commands',
      '// Generated by CypressTestLifecycleManager',
      '',
      ...customCommands,
      '',
      `// Global setup commands
Cypress.Commands.add('globalSetup', () => {
  ${setupCommands.map(cmd => `  ${cmd};`).join('\n  ')}
});`,
      '',
      `// Global teardown commands
Cypress.Commands.add('globalTeardown', () => {
  ${teardownCommands.map(cmd => `  ${cmd};`).join('\n  ')}
});`
    ].join('\n');

    enhancedFiles.supportFiles.set('commands.js', enhancedCommands);

    // Create setup.js for node tasks
    const nodeTasks = this.lifecycleManager.generateNodeTasks(lifecycleContext);
    const setupContent = `
// Node.js tasks for Cypress
// Generated by CypressTestLifecycleManager

module.exports = {
  ${Object.entries(nodeTasks).map(([name, func]) => `${name}: ${func}`).join(',\n  ')}
};
`;

    enhancedFiles.supportFiles.set('setup.js', setupContent);

    return enhancedFiles;
  }

  private async storeGenerationResult(
    request: CypressGenerationRequest,
    organizationResult: OrganizedProject,
    testSuite: CypressTestSuite,
    generatedFiles: GeneratedCypressFiles,
    explorationData: ExplorationResult
  ): Promise<string> {
    const generationData: Omit<StoredCypressGeneration, 'id' | 'createdAt' | 'updatedAt'> = {
      projectId: request.projectId,
      testCaseId: request.testCaseId,
      explorationResultId: request.explorationResultId,
      projectPath: organizationResult.projectPath,
      configFile: generatedFiles.configFile,
      testFiles: Array.from(generatedFiles.testFiles.entries()).map(([name, content]) => ({
        name,
        path: `${organizationResult.testPath}/${name}`,
        content
      })),
      fixtureFiles: Array.from(generatedFiles.fixtureFiles.entries()).map(([name, content]) => ({
        name,
        path: `${organizationResult.fixturePath}/${name}`,
        content
      })),
      supportFiles: Array.from(generatedFiles.supportFiles.entries()).map(([name, content]) => ({
        name,
        path: `${organizationResult.supportPath}/${name}`,
        content
      })),
      packageJson: generatedFiles.packageJson,
      metadata: {
        testSuite,
        organizationResult,
        explorationData: explorationData.id,
        generationRequest: request
      }
    };

    return await this.generatedCodeRepository.saveGeneratedCode(generationData);
  }

  private countGeneratedFiles(files: GeneratedCypressFiles): number {
    return files.testFiles.size + files.fixtureFiles.size + files.supportFiles.size + 1; // +1 for config
  }

  private countTotalLines(files: GeneratedCypressFiles): number {
    let totalLines = 0;

    for (const content of files.testFiles.values()) {
      totalLines += content.split('\n').length;
    }

    for (const content of files.fixtureFiles.values()) {
      totalLines += content.split('\n').length;
    }

    for (const content of files.supportFiles.values()) {
      totalLines += content.split('\n').length;
    }

    totalLines += files.configFile.split('\n').length;

    if (files.packageJson) {
      totalLines += files.packageJson.split('\n').length;
    }

    return totalLines;
  }

  // Public methods for querying stored generations
  async getGenerationResult(generationId: string): Promise<StoredCypressGeneration | null> {
    return await this.generatedCodeRepository.getGeneratedCode(generationId);
  }

  async getGenerationsByProject(projectId: string): Promise<StoredCypressGeneration[]> {
    return await this.generatedCodeRepository.getGeneratedCodeByProject(projectId);
  }

  async getGenerationsByTestCase(testCaseId: string): Promise<StoredCypressGeneration[]> {
    return await this.generatedCodeRepository.getGeneratedCodeByTestCase(testCaseId);
  }

  async deleteGeneration(generationId: string): Promise<boolean> {
    const generation = await this.generatedCodeRepository.getGeneratedCode(generationId);
    if (!generation) {
      return false;
    }

    // Clean up files
    try {
      await this.fileOrganizer.archiveProject(generation.projectPath);
    } catch (error) {
      console.warn('Failed to archive project files:', error);
    }

    // Delete from database
    return await this.generatedCodeRepository.deleteGeneratedCode(generationId);
  }

  async regenerateProject(
    generationId: string,
    newRequest?: Partial<CypressGenerationRequest>
  ): Promise<CypressGenerationResult> {
    const existingGeneration = await this.generatedCodeRepository.getGeneratedCode(generationId);
    if (!existingGeneration) {
      throw new Error(`Generation not found: ${generationId}`);
    }

    const originalRequest = existingGeneration.metadata.generationRequest as CypressGenerationRequest;
    const request = { ...originalRequest, ...newRequest };

    return await this.generateCypressProject(request);
  }

  // Utility methods
  getAvailableTemplates(): string[] {
    return this.templateEngine.getAvailableTemplates();
  }

  async validateGenerationRequest(request: CypressGenerationRequest): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    if (!request.projectId) {
      errors.push('Project ID is required');
    }

    if (!request.testCaseId && !request.explorationResultId) {
      errors.push('Either testCaseId or explorationResultId must be provided');
    }

    // Check if exploration data exists
    try {
      const explorationData = await this.loadExplorationData(request);
      if (!explorationData) {
        errors.push('No exploration data found for the given criteria');
      }
    } catch (error) {
      errors.push(`Failed to load exploration data: ${error}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}