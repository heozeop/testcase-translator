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
import { ApiResponse, ApiErrorResponse, ApiSuccessResponse } from '../types';

const router = express.Router();

// Validation schemas
const validateUrlSchema = Joi.object({
  url: Joi.string().uri().required().messages({
    'string.uri': 'Please provide a valid URL',
    'any.required': 'URL is required'
  }),
  options: Joi.object({
    timeout: Joi.number().min(1000).max(30000).default(10000),
    checkAccessibility: Joi.boolean().default(true),
    retrieveContent: Joi.boolean().default(false),
    extractMetadata: Joi.boolean().default(true),
    followRedirects: Joi.boolean().default(true),
    maxSize: Joi.number().min(1024).max(10 * 1024 * 1024).default(5 * 1024 * 1024) // 5MB default
  }).default({})
});

const createProjectSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().messages({
    'string.min': 'Project name cannot be empty',
    'string.max': 'Project name cannot exceed 255 characters',
    'any.required': 'Project name is required'
  }),
  target_url: Joi.string().uri().required().messages({
    'string.uri': 'Please provide a valid target URL',
    'any.required': 'Target URL is required'
  }),
  description: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'Description cannot exceed 1000 characters'
  })
});

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
const projectRepository = new ProjectRepository();
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
router.post('/validate-url', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { error, value } = validateUrlSchema.validate(req.body);
    if (error) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(errorResponse);
    }

    const { url, options } = value;
    
    console.log(`Validating URL: ${url} with options:`, options);

    // Step 1: URL format validation and security checks
    const validation = UrlValidationService.validateUrl(url);
    if (!validation.isValid || !validation.isSafe) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'URL_VALIDATION_FAILED',
          message: validation.error || 'URL validation failed'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(errorResponse);
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

    const successResponse: ApiSuccessResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };

    res.json(successResponse);
  } catch (error: any) {
    console.error('URL validation error:', error);
    
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during URL validation'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// GET /api/projects
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const result = await projectRepository.findAll({
      limit,
      offset,
      orderBy: 'created_at',
      order: 'DESC'
    });

    const successResponse: ApiSuccessResponse = {
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    };

    // Add pagination info to response
    (successResponse as any).pagination = {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages
    };

    res.json(successResponse);
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve projects'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/projects
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { error, value } = createProjectSchema.validate(req.body);
    if (error) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(errorResponse);
    }

    // Check if project with same name already exists
    const existingProject = await projectRepository.findByName(value.name);
    if (existingProject) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'PROJECT_EXISTS',
          message: 'A project with this name already exists'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(409).json(errorResponse);
    }

    // Validate target URL
    const urlValidation = UrlValidationService.validateUrl(value.target_url);
    if (!urlValidation.isValid || !urlValidation.isSafe) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'INVALID_TARGET_URL',
          message: urlValidation.error || 'Target URL is invalid or unsafe'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(errorResponse);
    }

    // Create project
    const project = await projectRepository.create({
      name: value.name,
      target_url: UrlValidationService.normalizeUrl(value.target_url),
      description: value.description || undefined
    });

    const successResponse: ApiSuccessResponse = {
      success: true,
      data: project,
      timestamp: new Date().toISOString()
    };

    res.status(201).json(successResponse);
  } catch (error: any) {
    console.error('Error creating project:', error);
    
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create project'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// GET /api/projects/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const project = await projectRepository.findWithStats(id);
    if (!project) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(errorResponse);
    }

    const successResponse: ApiSuccessResponse = {
      success: true,
      data: project,
      timestamp: new Date().toISOString()
    };

    res.json(successResponse);
  } catch (error: any) {
    console.error('Error fetching project:', error);
    
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve project'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// POST /api/projects/:id/test-cases/upload
router.post('/:id/test-cases/upload', upload.single('excelFile'), async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const file = req.file;

    // Validate project exists
    const project = await projectRepository.findById(projectId);
    if (!project) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(errorResponse);
    }

    // Validate file upload
    if (!file) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'FILE_REQUIRED',
          message: 'Excel file is required'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(errorResponse);
    }

    // Check if LLM service is available
    if (!llmProcessingService) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'LLM_SERVICE_UNAVAILABLE',
          message: 'AI processing service is not configured. Please check ANTHROPIC_API_KEY environment variable.'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(503).json(errorResponse);
    }

    // Parse Excel file
    let workbook;
    try {
      workbook = await ExcelParserService.parseExcelFile(
        file.buffer,
        file.originalname,
        {
          parseHeaders: true,
          headerRow: 1,
          maxRows: 1000,
          maxColumns: 50,
          includeEmptyRows: false
        }
      );
    } catch (error: any) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'EXCEL_PARSE_ERROR',
          message: `Failed to parse Excel file: ${error.message}`
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(errorResponse);
    }

    // Process with LLM
    let processingResult;
    try {
      processingResult = await llmProcessingService.processExcelFile(
        workbook,
        {
          projectName: project.name,
          targetUrl: project.target_url,
          description: project.description || undefined
        },
        {
          validateResults: true,
          enhanceTestCases: false, // Keep simple for now
          maxRetries: 2,
          timeout: 60000
        }
      );
    } catch (error: any) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'LLM_PROCESSING_ERROR',
          message: `Failed to process Excel file with AI: ${error.message}`
        },
        timestamp: new Date().toISOString()
      };
      return res.status(500).json(errorResponse);
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
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: `Failed to store test cases: ${error.message}`
        },
        timestamp: new Date().toISOString()
      };
      return res.status(500).json(errorResponse);
    }

    const successResponse: ApiSuccessResponse = {
      success: true,
      data: {
        processingResult: {
          summary: processingResult.summary,
          metadata: processingResult.metadata,
          warnings: processingResult.warnings
        },
        storageResult: {
          summary: storageResult.summary,
          errors: storageResult.errors
        },
        testCases: storageResult.stored.map(tc => ({
          id: tc.id,
          scenarioName: tc.scenario_name,
          status: tc.status,
          createdAt: tc.created_at
        }))
      },
      timestamp: new Date().toISOString()
    };

    res.status(201).json(successResponse);
  } catch (error: any) {
    console.error('Excel upload error:', error);
    
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during file processing'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

// GET /api/projects/:id/test-cases
router.get('/:id/test-cases', async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    // Validate project exists
    const project = await projectRepository.findById(projectId);
    if (!project) {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(errorResponse);
    }

    const testCaseRepository = new (await import('../repositories/TestCaseRepository')).TestCaseRepository();
    const result = await testCaseRepository.findByProjectId(projectId, {
      limit,
      offset,
      orderBy: 'created_at',
      order: 'DESC'
    });

    const successResponse: ApiSuccessResponse = {
      success: true,
      data: result.data,
      timestamp: new Date().toISOString()
    };

    // Add pagination info
    (successResponse as any).pagination = {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages
    };

    res.json(successResponse);
  } catch (error: any) {
    console.error('Error fetching test cases:', error);
    
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to retrieve test cases'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(errorResponse);
  }
});

export default router;