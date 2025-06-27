import express from 'express';
import { Request, Response } from 'express';
import Joi from 'joi';
import { 
  CypressGenerationOrchestrator,
  CypressGenerationRequest,
} from '../services/CypressGenerationOrchestrator';
import { ExplorationResultsStorage } from '../services/ExplorationResultsStorage';
import { GeneratedCodeRepository } from '../repositories/GeneratedCodeRepository';
import { ExplorationResultRepository } from '../repositories/ExplorationResultRepository';
import { getPool } from '../db';
import { 
  asyncHandler, 
  validateSchema, 
  HttpError, 
  NotFoundError, 
  ValidationErrorClass
} from '../middleware/errorHandler';
import { 
  sendSuccess, 
  sendPaginatedResponse, 
  sanitizeOutput
} from '../utils/apiHelpers';

const router = express.Router();

// Initialize services and repositories
// Note: In a real implementation, pool would be injected or imported properly
const pool = getPool();
const generatedCodeRepository = new GeneratedCodeRepository(pool);
const explorationResultRepository = new ExplorationResultRepository();
const explorationStorage = new ExplorationResultsStorage(pool);

// Initialize Cypress Generation Orchestrator
const cypressOrchestrator = new CypressGenerationOrchestrator(
  explorationStorage,
  generatedCodeRepository,
  explorationResultRepository,
  {}, // generationOptions
  {}, // organizationOptions 
  {}  // lifecycleConfig
);

// Validation schemas
const generateCypressSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  testCaseId: Joi.string().uuid().optional(),
  explorationResultId: Joi.string().uuid().optional(),
  templateTypes: Joi.array().items(Joi.string().valid('navigation', 'form')).default(['navigation', 'form']),
  generationOptions: Joi.object({
    formatCode: Joi.boolean().default(true),
    includeComments: Joi.boolean().default(true),
    useTypeScript: Joi.boolean().default(false),
    indentSize: Joi.number().min(2).max(8).default(2),
    maxLineLength: Joi.number().min(80).max(200).default(100),
    optimizeSelectors: Joi.boolean().default(true)
  }).optional(),
  organizationOptions: Joi.object({
    baseDirectory: Joi.string().default('./generated-tests'),
    createTimestampedFolders: Joi.boolean().default(true),
    overwriteExisting: Joi.boolean().default(false),
    generateReadme: Joi.boolean().default(true)
  }).optional(),
  lifecycleConfig: Joi.object({
    fixtureStrategy: Joi.string().valid('static', 'dynamic', 'mixed').default('mixed'),
    seedDatabase: Joi.boolean().default(false),
    cleanupStrategy: Joi.string().valid('none', 'soft', 'full').default('soft'),
    environmentIsolation: Joi.boolean().default(true)
  }).optional(),
  environment: Joi.object({
    name: Joi.string().default('test'),
    baseUrl: Joi.string().uri().optional(),
    environmentVariables: Joi.object().default({})
  }).optional()
});

const regenerateSchema = Joi.object({
  generationId: Joi.string().uuid().required(),
  templateTypes: Joi.array().items(Joi.string().valid('navigation', 'form')).optional(),
  generationOptions: Joi.object().optional(),
  organizationOptions: Joi.object().optional()
});

const queryGenerationsSchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  testCaseId: Joi.string().uuid().optional(),
  explorationResultId: Joi.string().uuid().optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(10),
  orderBy: Joi.string().valid('created_at', 'updated_at').default('created_at'),
  orderDirection: Joi.string().valid('ASC', 'DESC').default('DESC')
});

// POST /api/cypress/generate
// Generate new Cypress project from exploration results
router.post('/generate',
  validateSchema(generateCypressSchema),
  asyncHandler(async (req: Request, res: Response) => {
    console.log('Generating Cypress project with request:', JSON.stringify(req.body, null, 2));

    const request: CypressGenerationRequest = req.body;

    // Validate the generation request
    const validation = await cypressOrchestrator.validateGenerationRequest(request);
    if (!validation.isValid) {
      throw new ValidationErrorClass(
        validation.errors.map(error => ({ field: 'request', message: error })),
        'Invalid generation request'
      );
    }

    try {
      const result = await cypressOrchestrator.generateCypressProject(request);
      
      if (result.status === 'success') {
        sendSuccess(res, {
          generationId: result.id,
          projectPath: result.organizationResult.projectPath,
          metadata: result.metadata,
          testSuite: {
            suiteName: result.testSuite.suiteName,
            description: result.testSuite.description,
            baseUrl: result.testSuite.baseUrl,
            testCaseCount: result.testSuite.testCases.length,
            fixtureCount: Object.keys(result.testSuite.fixtures).length,
            customCommandCount: result.testSuite.customCommands.length
          }
        }, 'Cypress project generated successfully', 201);
      } else {
        throw new HttpError(
          'Failed to generate Cypress project: ' + result.errors.join(', '),
          500,
          'GENERATION_FAILED',
          true,
          { errors: result.errors }
        );
      }

    } catch (error: any) {
      console.error('Cypress generation error:', error);
      throw new HttpError(
        `Cypress generation failed: ${error.message}`,
        500,
        'GENERATION_ERROR',
        true,
        { originalError: error.message }
      );
    }
  })
);

// GET /api/cypress/generations
// List generated Cypress projects with filtering and pagination
router.get('/generations',
  validateSchema(queryGenerationsSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      projectId, 
      testCaseId, 
      explorationResultId, 
      page, 
      limit, 
      orderBy, 
      orderDirection 
    } = req.query as any;

    const options = {
      projectId,
      testCaseId,
      explorationResultId,
      limit,
      offset: (page - 1) * limit,
      orderBy,
      orderDirection
    };

    const generations = await generatedCodeRepository.queryGeneratedCode(options);
    
    // Get total count for pagination
    const totalCount = await generatedCodeRepository.queryGeneratedCode({
      ...options,
      limit: undefined,
      offset: undefined
    });

    const paginationResult = {
      data: generations.map(gen => sanitizeOutput({
        id: gen.id,
        projectId: gen.projectId,
        testCaseId: gen.testCaseId,
        explorationResultId: gen.explorationResultId,
        projectPath: gen.projectPath,
        testFileCount: gen.testFiles.length,
        fixtureFileCount: gen.fixtureFiles.length,
        supportFileCount: gen.supportFiles.length,
        createdAt: gen.createdAt,
        updatedAt: gen.updatedAt,
        metadata: gen.metadata
      })),
      page,
      limit,
      total: totalCount.length,
      totalPages: Math.ceil(totalCount.length / limit),
      hasNext: page * limit < totalCount.length,
      hasPrev: page > 1
    };

    sendPaginatedResponse(res, paginationResult, 'Generated Cypress projects retrieved successfully');
  })
);

// GET /api/cypress/generations/:id
// Get detailed information about a specific generation
router.get('/generations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!Joi.string().uuid().validate(id).error) {
      const generation = await cypressOrchestrator.getGenerationResult(id);
      
      if (!generation) {
        throw new NotFoundError('Generated Cypress project');
      }

      sendSuccess(res, sanitizeOutput({
        id: generation.id,
        projectId: generation.projectId,
        testCaseId: generation.testCaseId,
        explorationResultId: generation.explorationResultId,
        projectPath: generation.projectPath,
        configFile: generation.configFile,
        packageJson: generation.packageJson,
        testFiles: generation.testFiles.map(f => ({
          name: f.name,
          path: f.path,
          contentLength: f.content.length
        })),
        fixtureFiles: generation.fixtureFiles.map(f => ({
          name: f.name,
          path: f.path,
          contentLength: f.content.length
        })),
        supportFiles: generation.supportFiles.map(f => ({
          name: f.name,
          path: f.path,
          contentLength: f.content.length
        })),
        metadata: generation.metadata,
        createdAt: generation.createdAt,
        updatedAt: generation.updatedAt
      }), 'Generation details retrieved successfully');
    } else {
      throw new ValidationErrorClass([{ field: 'id', message: 'Invalid generation ID format' }]);
    }
  })
);

// GET /api/cypress/generations/:id/files/:fileName
// Get the content of a specific generated file
router.get('/generations/:id/files/:fileName',
  asyncHandler(async (req: Request, res: Response) => {
    const { id, fileName } = req.params;

    if (!Joi.string().uuid().validate(id).error) {
      const content = await generatedCodeRepository.getFileContent(id, fileName);
      
      if (!content) {
        throw new NotFoundError('Generated file');
      }

      // Determine content type based on file extension
      const extension = fileName.split('.').pop()?.toLowerCase();
      let contentType = 'text/plain';
      
      switch (extension) {
        case 'js':
          contentType = 'application/javascript';
          break;
        case 'ts':
          contentType = 'application/typescript';
          break;
        case 'json':
          contentType = 'application/json';
          break;
        case 'md':
          contentType = 'text/markdown';
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.send(content);
    } else {
      throw new ValidationErrorClass([{ field: 'id', message: 'Invalid generation ID format' }]);
    }
  })
);

// POST /api/cypress/regenerate
// Regenerate an existing Cypress project with new options
router.post('/regenerate',
  validateSchema(regenerateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { generationId, ...newRequest } = req.body;

    try {
      const result = await cypressOrchestrator.regenerateProject(generationId, newRequest);
      
      if (result.status === 'success') {
        sendSuccess(res, {
          generationId: result.id,
          projectPath: result.organizationResult.projectPath,
          metadata: result.metadata,
          testSuite: {
            suiteName: result.testSuite.suiteName,
            description: result.testSuite.description,
            baseUrl: result.testSuite.baseUrl,
            testCaseCount: result.testSuite.testCases.length
          }
        }, 'Cypress project regenerated successfully');
      } else {
        throw new HttpError(
          'Failed to regenerate Cypress project: ' + result.errors.join(', '),
          500,
          'REGENERATION_FAILED',
          true,
          { errors: result.errors }
        );
      }

    } catch (error: any) {
      console.error('Cypress regeneration error:', error);
      throw new HttpError(
        `Cypress regeneration failed: ${error.message}`,
        500,
        'REGENERATION_ERROR',
        true,
        { originalError: error.message }
      );
    }
  })
);

// DELETE /api/cypress/generations/:id
// Delete a generated Cypress project
router.delete('/generations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!Joi.string().uuid().validate(id).error) {
      const deleted = await cypressOrchestrator.deleteGeneration(id);
      
      if (!deleted) {
        throw new NotFoundError('Generated Cypress project');
      }

      sendSuccess(res, { deleted: true }, 'Cypress project deleted successfully');
    } else {
      throw new ValidationErrorClass([{ field: 'id', message: 'Invalid generation ID format' }]);
    }
  })
);

// GET /api/cypress/templates
// Get available Cypress templates
router.get('/templates',
  asyncHandler(async (_req: Request, res: Response) => {
    const templates = cypressOrchestrator.getAvailableTemplates();
    
    sendSuccess(res, {
      templates: templates.map(name => ({
        name,
        description: getTemplateDescription(name)
      }))
    }, 'Available templates retrieved successfully');
  })
);

// GET /api/cypress/statistics
// Get generation statistics
router.get('/statistics',
  asyncHandler(async (req: Request, res: Response) => {
    const { projectId } = req.query;
    
    const stats = await generatedCodeRepository.getGenerationStatistics(projectId as string);
    
    sendSuccess(res, stats, 'Generation statistics retrieved successfully');
  })
);

// POST /api/cypress/validate-request
// Validate a generation request without executing it
router.post('/validate-request',
  validateSchema(generateCypressSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const request: CypressGenerationRequest = req.body;
    
    const validation = await cypressOrchestrator.validateGenerationRequest(request);
    
    if (validation.isValid) {
      sendSuccess(res, { 
        valid: true, 
        message: 'Generation request is valid' 
      }, 'Request validation successful');
    } else {
      sendSuccess(res, { 
        valid: false, 
        errors: validation.errors 
      }, 'Request validation completed with errors', 400);
    }
  })
);

// Helper function to get template descriptions
function getTemplateDescription(templateName: string): string {
  const descriptions: Record<string, string> = {
    navigation: 'Template for testing page navigation flows, URL changes, and routing',
    form: 'Template for testing form interactions, input validation, and submission'
  };
  
  return descriptions[templateName] || 'Custom template';
}

export default router;