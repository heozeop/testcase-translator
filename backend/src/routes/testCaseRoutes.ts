import express from 'express';
import { Request, Response } from 'express';
import { TestCaseRepository } from '../repositories/TestCaseRepository';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { TestCaseLinkingService } from '../services/TestCaseLinkingService';
import { InputCollectionService } from '../services/InputCollectionService';
import { PageExplorationService } from '../services/PageExplorationService';
import { PuppeteerService } from '../services/PuppeteerService';
import { 
  asyncHandler, 
  validateSchema, 
  HttpError, 
  NotFoundError, 
  ConflictError,
  ServiceUnavailableError
} from '../middleware/errorHandler';
import { 
  sendSuccess, 
  sendPaginatedResponse, 
  getPaginationOptions,
  getFilterOptions,
  sanitizeOutput
} from '../utils/apiHelpers';
import { validationSchemas } from '../utils/validationSchemas';

const router = express.Router();

// Initialize repositories and services
const testCaseRepository = new TestCaseRepository();
const projectRepository = new ProjectRepository();
const testCaseLinkingService = new TestCaseLinkingService();
const inputCollectionService = new InputCollectionService();
const pageExplorationService = new PageExplorationService();
const puppeteerService = new PuppeteerService();

// GET /api/test-cases
router.get('/',
  validateSchema(validationSchemas.testCases.query, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const paginationOptions = getPaginationOptions(req);
    const filters = getFilterOptions(req, [
      'project_id', 'status', 'priority', 'test_type', 
      'created_after', 'created_before'
    ]);

    const result = await testCaseRepository.findAll({
      ...paginationOptions,
      filters
    });

    sendPaginatedResponse(res, result);
  })
);

// GET /api/test-cases/:id
router.get('/:id',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const testCase = await testCaseRepository.findById(id);
    if (!testCase) {
      throw new NotFoundError('Test case');
    }

    // Include related data
    const enrichedTestCase = await testCaseRepository.findWithDetails(id);
    sendSuccess(res, sanitizeOutput(enrichedTestCase));
  })
);

// POST /api/test-cases
router.post('/',
  validateSchema(validationSchemas.testCases.create),
  asyncHandler(async (req: Request, res: Response) => {
    const testCaseData = req.body;

    // Validate project exists
    const project = await projectRepository.findById(testCaseData.project_id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    // Check for duplicate scenario names within the project
    const existingTestCase = await testCaseRepository.findByScenarioName(
      testCaseData.project_id,
      testCaseData.scenario_name
    );
    if (existingTestCase) {
      throw new ConflictError('A test case with this scenario name already exists in the project');
    }

    const testCase = await testCaseRepository.create(testCaseData);
    sendSuccess(res, sanitizeOutput(testCase), 'Test case created successfully', 201);
  })
);

// PUT /api/test-cases/:id
router.put('/:id',
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema(validationSchemas.testCases.update),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    // Check if test case exists
    const existingTestCase = await testCaseRepository.findById(id);
    if (!existingTestCase) {
      throw new NotFoundError('Test case');
    }

    // If scenario name is being updated, check for conflicts
    if (updateData.scenario_name && updateData.scenario_name !== existingTestCase.scenario_name) {
      const nameConflict = await testCaseRepository.findByScenarioName(
        existingTestCase.project_id,
        updateData.scenario_name
      );
      if (nameConflict) {
        throw new ConflictError('A test case with this scenario name already exists in the project');
      }
    }

    const updatedTestCase = await testCaseRepository.update(id, updateData);
    sendSuccess(res, sanitizeOutput(updatedTestCase), 'Test case updated successfully');
  })
);

// DELETE /api/test-cases/:id
router.delete('/:id',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if test case exists
    const testCase = await testCaseRepository.findById(id);
    if (!testCase) {
      throw new NotFoundError('Test case');
    }

    await testCaseRepository.delete(id);
    sendSuccess(res, { id }, 'Test case deleted successfully');
  })
);

// POST /api/test-cases/:id/duplicate
router.post('/:id/duplicate',
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema({
    scenario_name: validationSchemas.common.name
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { scenario_name } = req.body;

    // Check if source test case exists
    const sourceTestCase = await testCaseRepository.findById(id);
    if (!sourceTestCase) {
      throw new NotFoundError('Source test case');
    }

    // Check if new scenario name already exists
    const nameConflict = await testCaseRepository.findByScenarioName(
      sourceTestCase.project_id,
      scenario_name
    );
    if (nameConflict) {
      throw new ConflictError('A test case with this scenario name already exists in the project');
    }

    const duplicatedTestCase = await testCaseRepository.duplicate(id, scenario_name);
    sendSuccess(res, sanitizeOutput(duplicatedTestCase), 'Test case duplicated successfully', 201);
  })
);

// POST /api/test-cases/:id/process
router.post('/:id/process',
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema({
    options: {
      explore_page: validationSchemas.common.optional.boolean.default(true),
      collect_inputs: validationSchemas.common.optional.boolean.default(true),
      link_data: validationSchemas.common.optional.boolean.default(true),
      generate_steps: validationSchemas.common.optional.boolean.default(true),
      timeout: validationSchemas.common.optional.number.min(10000).max(300000).default(60000)
    }
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { options } = req.body;
    const wsEndpoints = req.app.locals.wsEndpoints;

    // Check if test case exists
    const testCase = await testCaseRepository.findById(id);
    if (!testCase) {
      throw new NotFoundError('Test case');
    }

    // Get project details
    const project = await projectRepository.findById(testCase.project_id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    let processingResult: any = {
      testCaseId: id,
      status: 'processing',
      steps: [],
      explorationResult: null,
      linkedData: null,
      errors: [],
      warnings: []
    };

    try {
      // Step 1: Page exploration (if enabled)
      if (options.explore_page) {
        if (wsEndpoints) {
          wsEndpoints.broadcastNotificationToProject(
            project.id,
            'Processing Started',
            `Starting page exploration for test case: ${testCase.scenario_name}`,
            'info'
          );
        }

        const explorationResult = await pageExplorationService.exploreUrl(
          project.target_url,
          {
            maxDepth: 2,
            maxPages: 5,
            extractForms: true,
            extractImages: false,
            timeout: options.timeout
          }
        );

        processingResult.explorationResult = explorationResult;
        
        if (explorationResult.errors.length > 0) {
          processingResult.warnings.push(`Page exploration completed with ${explorationResult.errors.length} errors`);
        }
      }

      // Step 2: Input collection (if enabled)
      if (options.collect_inputs) {
        if (wsEndpoints) {
          wsEndpoints.broadcastNotificationToProject(
            project.id,
            'Input Collection',
            `Analyzing input requirements for test case: ${testCase.scenario_name}`,
            'info'
          );
        }

        const inputRequirements = await inputCollectionService.analyzeTestCaseInputs(
          testCase,
          processingResult.explorationResult
        );

        processingResult.inputRequirements = inputRequirements;
      }

      // Step 3: Data linking (if enabled)
      if (options.link_data) {
        if (wsEndpoints) {
          wsEndpoints.broadcastNotificationToProject(
            project.id,
            'Data Linking',
            `Linking test data for test case: ${testCase.scenario_name}`,
            'info'
          );
        }

        const linkedData = await testCaseLinkingService.linkTestCaseData(
          testCase,
          processingResult.explorationResult || {},
          processingResult.inputRequirements || []
        );

        processingResult.linkedData = linkedData;
      }

      // Step 4: Generate processing steps (if enabled)
      if (options.generate_steps) {
        if (wsEndpoints) {
          wsEndpoints.broadcastNotificationToProject(
            project.id,
            'Step Generation',
            `Generating executable steps for test case: ${testCase.scenario_name}`,
            'info'
          );
        }

        const generatedSteps = await testCaseLinkingService.generateExecutableSteps(
          testCase,
          processingResult.linkedData || {}
        );

        processingResult.steps = generatedSteps;
      }

      // Update test case status
      await testCaseRepository.update(id, {
        status: 'processed',
        processed_at: new Date()
      });

      processingResult.status = 'completed';

      // Notify completion
      if (wsEndpoints) {
        wsEndpoints.broadcastNotificationToProject(
          project.id,
          'Processing Complete',
          `Test case processing completed: ${testCase.scenario_name}`,
          'success'
        );
      }

    } catch (error: any) {
      processingResult.status = 'failed';
      processingResult.errors.push(error.message);

      // Update test case status
      await testCaseRepository.update(id, {
        status: 'failed',
        error_message: error.message
      });

      // Notify failure
      if (wsEndpoints) {
        wsEndpoints.broadcastNotificationToProject(
          project.id,
          'Processing Failed',
          `Test case processing failed: ${testCase.scenario_name}`,
          'error'
        );
      }

      throw error;
    }

    sendSuccess(res, sanitizeOutput(processingResult), 'Test case processed successfully');
  })
);

// POST /api/test-cases/batch-process
router.post('/batch-process',
  validateSchema({
    test_case_ids: validationSchemas.common.array.items(validationSchemas.common.id).min(1).max(50).required(),
    options: {
      explore_page: validationSchemas.common.optional.boolean.default(true),
      collect_inputs: validationSchemas.common.optional.boolean.default(true),
      link_data: validationSchemas.common.optional.boolean.default(true),
      generate_steps: validationSchemas.common.optional.boolean.default(true),
      timeout: validationSchemas.common.optional.number.min(10000).max(300000).default(60000),
      parallel: validationSchemas.common.optional.boolean.default(false),
      max_concurrent: validationSchemas.common.optional.number.min(1).max(10).default(3)
    }
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { test_case_ids, options } = req.body;
    const wsEndpoints = req.app.locals.wsEndpoints;

    // Validate all test cases exist
    const testCases = await Promise.all(
      test_case_ids.map((id: string) => testCaseRepository.findById(id))
    );

    const notFound = testCases.findIndex(tc => !tc);
    if (notFound !== -1) {
      throw new NotFoundError(`Test case at index ${notFound}`);
    }

    let results: any[] = [];

    if (options.parallel) {
      // Process in parallel with concurrency limit
      const chunks = [];
      for (let i = 0; i < test_case_ids.length; i += options.max_concurrent) {
        chunks.push(test_case_ids.slice(i, i + options.max_concurrent));
      }

      for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
          chunk.map((id: string) => processTestCase(id, options, wsEndpoints))
        );

        results.push(...chunkResults.map((result, index) => ({
          testCaseId: chunk[index],
          status: result.status,
          ...(result.status === 'fulfilled' ? { data: result.value } : { error: result.reason?.message })
        })));
      }
    } else {
      // Process sequentially
      for (const id of test_case_ids) {
        try {
          const result = await processTestCase(id, options, wsEndpoints);
          results.push({
            testCaseId: id,
            status: 'fulfilled',
            data: result
          });
        } catch (error: any) {
          results.push({
            testCaseId: id,
            status: 'rejected',
            error: error.message
          });
        }
      }
    }

    const summary = {
      total: test_case_ids.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results
    };

    sendSuccess(res, sanitizeOutput(summary), 'Batch processing completed');
  })
);

// Helper function for processing individual test cases
async function processTestCase(id: string, options: any, wsEndpoints: any) {
  // This is a simplified version of the individual processing logic
  const testCase = await testCaseRepository.findById(id);
  if (!testCase) {
    throw new Error('Test case not found');
  }

  const project = await projectRepository.findById(testCase.project_id);
  if (!project) {
    throw new Error('Project not found');
  }

  // Simulate processing steps
  const processingResult: any = {
    testCaseId: id,
    status: 'completed',
    steps: [],
    warnings: []
  };

  if (options.explore_page) {
    const explorationResult = await pageExplorationService.exploreUrl(
      project.target_url,
      { maxDepth: 1, maxPages: 1, timeout: options.timeout }
    );
    processingResult.explorationResult = explorationResult;
  }

  if (options.collect_inputs) {
    const inputRequirements = await inputCollectionService.analyzeTestCaseInputs(
      testCase,
      processingResult.explorationResult
    );
    processingResult.inputRequirements = inputRequirements;
  }

  if (options.link_data) {
    const linkedData = await testCaseLinkingService.linkTestCaseData(
      testCase,
      processingResult.explorationResult || {},
      processingResult.inputRequirements || []
    );
    processingResult.linkedData = linkedData;
  }

  // Update test case status
  await testCaseRepository.update(id, {
    status: 'processed',
    processed_at: new Date()
  });

  return processingResult;
}

// GET /api/test-cases/:id/inputs
router.get('/:id/inputs',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if test case exists
    const testCase = await testCaseRepository.findById(id);
    if (!testCase) {
      throw new NotFoundError('Test case');
    }

    const inputs = await inputCollectionService.getTestCaseInputs(id);
    sendSuccess(res, sanitizeOutput(inputs));
  })
);

// POST /api/test-cases/:id/inputs
router.post('/:id/inputs',
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema(validationSchemas.inputs.response),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { responses } = req.body;

    // Check if test case exists
    const testCase = await testCaseRepository.findById(id);
    if (!testCase) {
      throw new NotFoundError('Test case');
    }

    const result = await inputCollectionService.submitTestCaseInputs(id, responses);
    sendSuccess(res, sanitizeOutput(result), 'Inputs submitted successfully');
  })
);

// GET /api/test-cases/:id/linked-data
router.get('/:id/linked-data',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if test case exists
    const testCase = await testCaseRepository.findById(id);
    if (!testCase) {
      throw new NotFoundError('Test case');
    }

    const linkedData = await testCaseLinkingService.getLinkedData(id);
    sendSuccess(res, sanitizeOutput(linkedData));
  })
);

// GET /api/test-cases/:id/exploration
router.get('/:id/exploration',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if test case exists
    const testCase = await testCaseRepository.findById(id);
    if (!testCase) {
      throw new NotFoundError('Test case');
    }

    const project = await projectRepository.findById(testCase.project_id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    const explorationData = await pageExplorationService.getExplorationResult(project.target_url);
    sendSuccess(res, sanitizeOutput(explorationData));
  })
);

export default router;