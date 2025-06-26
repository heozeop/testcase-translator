import express from 'express';
import { Request, Response } from 'express';
import Joi from 'joi';
import multer from 'multer';
import { UrlValidationService } from '../services/UrlValidationService';
import { UrlAccessibilityService } from '../services/UrlAccessibilityService';
import { HtmlRetrievalService } from '../services/HtmlRetrievalService';
import { ExcelParserService } from '../services/ExcelParserService';
import { LLMProcessingService } from '../services/LLMProcessingService';
import { TestCaseStorageService } from '../services/TestCaseStorageService';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { TestCaseRepository } from '../repositories/TestCaseRepository';
import { GeneratedCodeRepository } from '../repositories/GeneratedCodeRepository';
import { ApiResponse, ApiErrorResponse, ApiSuccessResponse } from '../types';
import { 
  asyncHandler, 
  validateSchema, 
  HttpError, 
  NotFoundError, 
  ConflictError,
  ServiceUnavailableError,
  ValidationErrorClass
} from '../middleware/errorHandler';
import { 
  sendSuccess, 
  sendError, 
  sendPaginatedResponse, 
  getPaginationOptions,
  getFilterOptions,
  sanitizeOutput
} from '../utils/apiHelpers';
import { validationSchemas } from '../utils/validationSchemas';

const router = express.Router();

// Initialize repositories
const projectRepository = new ProjectRepository();
const testCaseRepository = new TestCaseRepository();
const generatedCodeRepository = new GeneratedCodeRepository();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.'));
    }
  }
});

// Initialize services
const urlValidationService = new UrlValidationService();
const urlAccessibilityService = new UrlAccessibilityService();
const htmlRetrievalService = new HtmlRetrievalService();
const testCaseStorageService = new TestCaseStorageService();

// Initialize LLM service (will be configured with environment variables)
let llmProcessingService: LLMProcessingService | null = null;
try {
  if (process.env.ANTHROPIC_API_KEY) {
    llmProcessingService = new LLMProcessingService({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL,
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4000'),
      temperature: parseFloat(process.env.CLAUDE_TEMPERATURE || '0.1'),
      timeout: parseInt(process.env.CLAUDE_TIMEOUT || '30000')
    });
  }
} catch (error) {
  console.warn('LLM Processing Service not initialized:', error);
}

// POST /api/projects/validate-url
router.post('/validate-url', 
  validateSchema(validationSchemas.urls.validate),
  asyncHandler(async (req: Request, res: Response) => {

    const { url, options } = req.body;
    
    console.log(`Validating URL: ${url} with options:`, options);

    // Step 1: URL format validation and security checks
    const validation = UrlValidationService.validateUrl(url);
    if (!validation.isValid || !validation.isSafe) {
      throw new HttpError(
        validation.error || 'URL validation failed',
        400,
        'URL_VALIDATION_FAILED'
      );
    }

    const result: any = {
      url,
      normalizedUrl: UrlValidationService.normalizeUrl(url),
      isValid: true,
      isSafe: true,
      warnings: validation.warnings
    };

    // Step 2: Accessibility check (if requested)
    if (options.checkAccessibility) {
      try {
        const accessibilityResult = await urlAccessibilityService.checkAccessibility(url, {
          timeout: options.timeout,
          followRedirects: options.followRedirects
        });

        result.accessibility = {
          accessible: accessibilityResult.accessible,
          status: accessibilityResult.status,
          statusText: accessibilityResult.statusText,
          responseTime: accessibilityResult.responseTime,
          redirectChain: accessibilityResult.redirectChain,
          finalUrl: accessibilityResult.finalUrl,
          details: accessibilityResult.details
        };

        if (accessibilityResult.error) {
          result.accessibility.error = accessibilityResult.error;
        }

        // If not accessible and content retrieval is requested, skip it
        if (!accessibilityResult.accessible && options.retrieveContent) {
          result.content = {
            retrieved: false,
            error: 'Cannot retrieve content from inaccessible URL'
          };
          options.retrieveContent = false;
        }
      } catch (error: any) {
        result.accessibility = {
          accessible: false,
          error: error.message
        };
        if (options.retrieveContent) {
          result.content = {
            retrieved: false,
            error: 'Cannot retrieve content due to accessibility check failure'
          };
          options.retrieveContent = false;
        }
      }
    }

    // Step 3: Content retrieval and metadata extraction (if requested)
    if (options.retrieveContent || options.extractMetadata) {
      try {
        const htmlOptions = {
          timeout: options.timeout,
          maxSize: options.maxSize,
          followRedirects: options.followRedirects,
          extractLinks: options.retrieveContent,
          extractImages: options.retrieveContent,
          extractForms: options.retrieveContent,
          extractHeadings: options.retrieveContent
        };

        if (options.extractMetadata && !options.retrieveContent) {
          // Only extract metadata without full content
          const metadata = await htmlRetrievalService.retrieveMetadataOnly(url);
          result.metadata = metadata;
        } else if (options.retrieveContent) {
          // Retrieve full content
          const htmlContent = await htmlRetrievalService.retrieveHtmlContent(url, htmlOptions);
          
          result.content = {
            retrieved: true,
            size: htmlContent.size,
            loadTime: htmlContent.loadTime,
            encoding: htmlContent.encoding,
            finalUrl: htmlContent.finalUrl,
            redirectChain: htmlContent.redirectChain
          };

          if (options.extractMetadata) {
            result.metadata = htmlContent.metadata;
          }

          // Include extracted content if requested
          if (options.retrieveContent) {
            result.content.links = htmlContent.links;
            result.content.images = htmlContent.images;
            result.content.forms = htmlContent.forms;
            result.content.headings = htmlContent.headings;
          }
        }
      } catch (error: any) {
        if (options.retrieveContent) {
          result.content = {
            retrieved: false,
            error: error.message
          };
        }
        if (options.extractMetadata) {
          result.metadata = {
            error: error.message
          };
        }
      }
    }

    sendSuccess(res, sanitizeOutput(result, ['internalHeaders']));
  })
);

// GET /api/projects
router.get('/', 
  validateSchema(validationSchemas.projects.query, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const paginationOptions = getPaginationOptions(req);
    const filters = getFilterOptions(req, ['status', 'created_after', 'created_before']);

    const result = await projectRepository.findAll({
      ...paginationOptions,
      filters
    });

    sendPaginatedResponse(res, result);
  })
);

// POST /api/projects
router.post('/', 
  validateSchema(validationSchemas.projects.create),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, target_url, description } = req.body;

    // Check if project with same name already exists
    const existingProject = await projectRepository.findByName(name);
    if (existingProject) {
      throw new ConflictError('A project with this name already exists');
    }

    // Validate target URL
    const urlValidation = UrlValidationService.validateUrl(target_url);
    if (!urlValidation.isValid || !urlValidation.isSafe) {
      throw new HttpError(
        urlValidation.error || 'Target URL is invalid or unsafe',
        400,
        'INVALID_TARGET_URL'
      );
    }

    // Create project
    const project = await projectRepository.create({
      name,
      target_url: UrlValidationService.normalizeUrl(target_url),
      description: description || undefined
    });

    sendSuccess(res, sanitizeOutput(project), 'Project created successfully', 201);
  })
);

// GET /api/projects/:id
router.get('/:id', 
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const project = await projectRepository.findWithStats(id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    sendSuccess(res, sanitizeOutput(project));
  })
);

// PUT /api/projects/:id
router.put('/:id', 
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema(validationSchemas.projects.update),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    // Check if project exists
    const existingProject = await projectRepository.findById(id);
    if (!existingProject) {
      throw new NotFoundError('Project');
    }

    // If name is being updated, check for conflicts
    if (updateData.name && updateData.name !== existingProject.name) {
      const nameConflict = await projectRepository.findByName(updateData.name);
      if (nameConflict) {
        throw new ConflictError('A project with this name already exists');
      }
    }

    // Validate target URL if provided
    if (updateData.target_url) {
      const urlValidation = UrlValidationService.validateUrl(updateData.target_url);
      if (!urlValidation.isValid || !urlValidation.isSafe) {
        throw new HttpError(
          urlValidation.error || 'Target URL is invalid or unsafe',
          400,
          'INVALID_TARGET_URL'
        );
      }
      updateData.target_url = UrlValidationService.normalizeUrl(updateData.target_url);
    }

    const updatedProject = await projectRepository.update(id, updateData);
    sendSuccess(res, sanitizeOutput(updatedProject), 'Project updated successfully');
  })
);

// DELETE /api/projects/:id
router.delete('/:id',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if project exists
    const project = await projectRepository.findById(id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    // Check if project has test cases or generated code
    const testCaseCount = await testCaseRepository.countByProjectId(id);
    const generatedCodeCount = await generatedCodeRepository.countByProjectId(id);

    if (testCaseCount > 0 || generatedCodeCount > 0) {
      throw new ConflictError(
        'Cannot delete project with existing test cases or generated code. Delete associated data first.'
      );
    }

    await projectRepository.delete(id);
    sendSuccess(res, { id }, 'Project deleted successfully');
  })
);

// GET /api/projects/:id/statistics
router.get('/:id/statistics',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if project exists
    const project = await projectRepository.findById(id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    const stats = await projectRepository.getProjectStatistics(id);
    sendSuccess(res, stats);
  })
);

// POST /api/projects/:id/duplicate
router.post('/:id/duplicate',
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema(Joi.object({
    name: validationSchemas.common.name,
    copy_test_cases: Joi.boolean().default(false),
    copy_generated_code: Joi.boolean().default(false)
  })),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, copy_test_cases, copy_generated_code } = req.body;

    // Check if source project exists
    const sourceProject = await projectRepository.findById(id);
    if (!sourceProject) {
      throw new NotFoundError('Source project');
    }

    // Check if new name already exists
    const nameConflict = await projectRepository.findByName(name);
    if (nameConflict) {
      throw new ConflictError('A project with this name already exists');
    }

    const duplicatedProject = await projectRepository.duplicate(id, {
      name,
      copy_test_cases,
      copy_generated_code
    });

    sendSuccess(res, sanitizeOutput(duplicatedProject), 'Project duplicated successfully', 201);
  })
);

// POST /api/projects/:id/test-cases/upload
router.post('/:id/test-cases/upload', 
  validateSchema(validationSchemas.common.id, 'params'),
  upload.single('excelFile'),
  validateSchema(validationSchemas.files.process),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;
    const file = req.file;
    const wsEndpoints = req.app.locals.wsEndpoints;
    const { processing_options } = req.body;

    // Validate project exists
    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    // Validate file upload
    if (!file) {
      throw new HttpError('Excel file is required', 400, 'FILE_REQUIRED');
    }

    // Check if LLM service is available
    if (!llmProcessingService) {
      throw new ServiceUnavailableError(
        'AI processing',
        'AI processing service is not configured. Please check ANTHROPIC_API_KEY environment variable.'
      );
    }

    // Notify clients about file upload start
    if (wsEndpoints) {
      wsEndpoints.notifyFileUploadProgress(
        projectId,
        `file_${Date.now()}`,
        file.originalname,
        10,
        'validating',
        'Validating Excel file...'
      );
    }

    // Parse Excel file
    let workbook;
    try {
      // Notify parsing start
      if (wsEndpoints) {
        wsEndpoints.notifyFileUploadProgress(
          projectId,
          `file_${Date.now()}`,
          file.originalname,
          30,
          'parsing',
          'Parsing Excel content...'
        );
      }

      workbook = await ExcelParserService.parseExcelFile(
        file.buffer,
        file.originalname,
        {
          parseHeaders: true,
          headerRow: 1,
          maxRows: 1000,
          maxColumns: 50,
          includeEmptyRows: false,
          ...processing_options
        }
      );
    } catch (error: any) {
      throw new HttpError(
        `Failed to parse Excel file: ${error.message}`,
        400,
        'EXCEL_PARSE_ERROR'
      );
    }

    // Process with LLM
    let processingResult;
    try {
      // Notify LLM processing start
      if (wsEndpoints) {
        wsEndpoints.notifyFileUploadProgress(
          projectId,
          `file_${Date.now()}`,
          file.originalname,
          50,
          'processing',
          'Processing test cases with AI...'
        );
      }

      processingResult = await llmProcessingService.processExcelFile(
        workbook,
        {
          projectName: project.name,
          targetUrl: project.target_url,
          description: project.description || undefined
        },
        {
          validateResults: processing_options?.validateResults ?? true,
          enhanceTestCases: processing_options?.enhanceTestCases ?? false,
          maxRetries: processing_options?.maxRetries ?? 2,
          timeout: processing_options?.timeout ?? 60000
        }
      );
    } catch (error: any) {
      throw new HttpError(
        `Failed to process Excel file with AI: ${error.message}`,
        500,
        'LLM_PROCESSING_ERROR'
      );
    }

    // Store test cases in database
    let storageResult;
    try {
      storageResult = await testCaseStorageService.storeProcessingResult(
        processingResult,
        projectId,
        {
          overwriteExisting: false,
          validateBeforeStore: true,
          batchSize: 10
        }
      );
    } catch (error: any) {
      throw new HttpError(
        `Failed to store test cases: ${error.message}`,
        500,
        'STORAGE_ERROR'
      );
    }

    // Notify completion
    if (wsEndpoints) {
      wsEndpoints.notifyFileUploadProgress(
        projectId,
        `file_${Date.now()}`,
        file.originalname,
        100,
        'completed',
        `Successfully processed ${storageResult.stored.length} test cases`
      );

      // Send test case extraction notification
      wsEndpoints.notifyTestCaseExtraction(
        projectId,
        `file_${Date.now()}`,
        processingResult.extractedTestCases.length,
        storageResult.stored.length,
        storageResult.errors.length,
        storageResult.stored.map(tc => ({
          id: tc.id,
          name: tc.scenario_name,
          status: tc.status === 'processed' ? 'valid' : 'invalid',
          issues: []
        }))
      );

      // Send success notification
      wsEndpoints.broadcastNotificationToProject(
        projectId,
        'Processing Complete',
        `Successfully processed ${storageResult.stored.length} test cases from ${file.originalname}`,
        'success'
      );
    }

    const responseData = {
      processingResult: {
        summary: processingResult.summary,
        metadata: processingResult.metadata,
        warnings: processingResult.warnings
      },
      storageResult: {
        summary: storageResult.summary,
        errors: storageResult.errors
      },
      testCases: storageResult.stored.map((tc: any) => ({
        id: tc.id,
        scenarioName: tc.scenario_name,
        status: tc.status,
        createdAt: tc.created_at
      }))
    };

    sendSuccess(res, sanitizeOutput(responseData), 'Test cases uploaded and processed successfully', 201);
  })
);

// GET /api/projects/:id/test-cases
router.get('/:id/test-cases', 
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema(validationSchemas.testCases.query, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;
    const paginationOptions = getPaginationOptions(req);
    const filters = getFilterOptions(req, ['status', 'priority', 'test_type', 'created_after', 'created_before']);

    // Validate project exists
    const project = await projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project');
    }

    const result = await testCaseRepository.findByProjectId(projectId, {
      ...paginationOptions,
      filters
    });

    sendPaginatedResponse(res, result);
  })
);

export default router;