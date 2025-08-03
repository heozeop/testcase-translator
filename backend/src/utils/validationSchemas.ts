import Joi from 'joi';

// Common field validations
export const commonFields = {
  id: Joi.string().uuid().required().messages({
    'string.uuid': 'Invalid ID format',
    'any.required': 'ID is required',
  }),

  optionalId: Joi.string().uuid().optional().messages({
    'string.uuid': 'Invalid ID format',
  }),

  name: Joi.string().min(1).max(255).required().messages({
    'string.min': 'Name cannot be empty',
    'string.max': 'Name cannot exceed 255 characters',
    'any.required': 'Name is required',
  }),

  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),

  url: Joi.string().uri().required().messages({
    'string.uri': 'Please provide a valid URL',
    'any.required': 'URL is required',
  }),

  optionalUrl: Joi.string().uri().optional().allow('').messages({
    'string.uri': 'Please provide a valid URL',
  }),

  description: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'Description cannot exceed 1000 characters',
  }),

  page: Joi.number().min(1).default(1).messages({
    'number.min': 'Page must be at least 1',
  }),

  limit: Joi.number().min(1).max(100).default(10).messages({
    'number.min': 'Limit must be at least 1',
    'number.max': 'Limit cannot exceed 100',
  }),

  orderBy: Joi.string().default('created_at'),

  order: Joi.string().valid('ASC', 'DESC').default('DESC').messages({
    'any.only': 'Order must be either ASC or DESC',
  }),

  status: Joi.string().valid('active', 'inactive', 'pending', 'completed', 'failed').messages({
    'any.only': 'Invalid status value',
  }),

  timestamp: Joi.date().iso().messages({
    'date.format': 'Invalid date format, please use ISO 8601',
  }),

  boolean: Joi.boolean(),
  number: Joi.number(),
  string: Joi.string(),
  array: Joi.array(),

  optional: {
    boolean: Joi.boolean().optional(),
    number: Joi.number().optional(),
    string: Joi.string().optional(),
    array: Joi.array().optional(),
  },
};

// Project validation schemas
export const projectSchemas = {
  create: Joi.object({
    name: commonFields.name,
    target_url: commonFields.url,
    description: commonFields.description,
  }),

  update: Joi.object({
    name: commonFields.name.optional(),
    target_url: commonFields.optionalUrl,
    description: commonFields.description,
  })
    .min(1)
    .messages({
      'object.min': 'At least one field must be provided for update',
    }),

  query: Joi.object({
    page: commonFields.page,
    limit: commonFields.limit,
    orderBy: Joi.string().valid('name', 'created_at', 'updated_at').default('created_at'),
    order: commonFields.order,
    search: Joi.string().max(100).optional(),
    status: commonFields.status.optional(),
  }),
};

// Test case validation schemas
export const testCaseSchemas = {
  create: Joi.object({
    project_id: commonFields.id,
    scenario_name: commonFields.name,
    description: commonFields.description,
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    test_type: Joi.string()
      .valid('functional', 'integration', 'regression', 'smoke')
      .default('functional'),
    expected_results: Joi.array().items(Joi.string().max(500)).optional(),
    test_data: Joi.object().optional(),
    steps: Joi.array()
      .items(
        Joi.object({
          step: Joi.number().min(1).required(),
          description: Joi.string().min(1).max(500).required(),
          action: Joi.string().max(1000).optional(),
          expected_result: Joi.string().max(500).optional(),
          test_data: Joi.object().optional(),
        }),
      )
      .min(1)
      .required(),
  }),

  update: Joi.object({
    scenario_name: commonFields.name.optional(),
    description: commonFields.description,
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    test_type: Joi.string().valid('functional', 'integration', 'regression', 'smoke').optional(),
    expected_results: Joi.array().items(Joi.string().max(500)).optional(),
    test_data: Joi.object().optional(),
    status: Joi.string().valid('draft', 'ready', 'processed', 'failed').optional(),
    steps: Joi.array()
      .items(
        Joi.object({
          step: Joi.number().min(1).required(),
          description: Joi.string().min(1).max(500).required(),
          action: Joi.string().max(1000).optional(),
          expected_result: Joi.string().max(500).optional(),
          test_data: Joi.object().optional(),
        }),
      )
      .optional(),
  }).min(1),

  query: Joi.object({
    page: commonFields.page,
    limit: commonFields.limit,
    orderBy: Joi.string()
      .valid('scenario_name', 'priority', 'status', 'created_at', 'updated_at')
      .default('created_at'),
    order: commonFields.order,
    search: Joi.string().max(100).optional(),
    status: Joi.string().valid('draft', 'ready', 'processed', 'failed').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    test_type: Joi.string().valid('functional', 'integration', 'regression', 'smoke').optional(),
  }),
};

// URL validation schemas
export const urlSchemas = {
  validate: Joi.object({
    url: commonFields.url,
    options: Joi.object({
      timeout: Joi.number().min(1000).max(30000).default(10000),
      checkAccessibility: Joi.boolean().default(true),
      retrieveContent: Joi.boolean().default(false),
      extractMetadata: Joi.boolean().default(true),
      followRedirects: Joi.boolean().default(true),
      maxSize: Joi.number()
        .min(1024)
        .max(10 * 1024 * 1024)
        .default(5 * 1024 * 1024),
    }).default({}),
  }),

  exploration: Joi.object({
    url: commonFields.url,
    options: Joi.object({
      maxDepth: Joi.number().min(1).max(5).default(2),
      maxPages: Joi.number().min(1).max(50).default(10),
      includeExternal: Joi.boolean().default(false),
      extractForms: Joi.boolean().default(true),
      extractImages: Joi.boolean().default(false),
      timeout: Joi.number().min(5000).max(60000).default(30000),
      waitFor: Joi.string().max(100).optional(),
      userAgent: Joi.string().max(200).optional(),
    }).default({}),
  }),
};

// File upload schemas
export const fileSchemas = {
  upload: Joi.object({
    options: Joi.object({
      parseHeaders: Joi.boolean().default(true),
      headerRow: Joi.number().min(1).max(10).default(1),
      maxRows: Joi.number().min(1).max(10000).default(1000),
      maxColumns: Joi.number().min(1).max(100).default(50),
      includeEmptyRows: Joi.boolean().default(false),
      sheetName: Joi.string().max(50).optional(),
      validateData: Joi.boolean().default(true),
      preserveFormulas: Joi.boolean().default(false),
    }).default({}),
  }),

  process: Joi.object({
    project_id: commonFields.id,
    processing_options: Joi.object({
      validateResults: Joi.boolean().default(true),
      enhanceTestCases: Joi.boolean().default(false),
      maxRetries: Joi.number().min(0).max(5).default(2),
      timeout: Joi.number().min(10000).max(120000).default(60000),
      generateSteps: Joi.boolean().default(true),
      extractTestData: Joi.boolean().default(true),
    }).default({}),
  }),
};

// Script generation schemas
export const scriptSchemas = {
  generate: Joi.object({
    test_case_ids: Joi.array().items(commonFields.id).min(1).max(50).required(),
    options: Joi.object({
      includeSetup: Joi.boolean().default(true),
      includeTeardown: Joi.boolean().default(true),
      usePageObjects: Joi.boolean().default(false),
      includeDataTables: Joi.boolean().default(true),
      includeAssertions: Joi.boolean().default(true),
      fileNaming: Joi.string().valid('kebab-case', 'camelCase', 'snake_case').default('kebab-case'),
      includeComments: Joi.boolean().default(true),
      cypressVersion: Joi.string().valid('12', '13', 'latest').default('latest'),
      customCommands: Joi.array().items(Joi.string()).default([]),
      viewport: Joi.object({
        width: Joi.number().min(320).max(3840).default(1280),
        height: Joi.number().min(240).max(2160).default(720),
      }).default({}),
      baseUrl: commonFields.optionalUrl,
      targetDirectory: Joi.string().max(200).default('./cypress/e2e'),
    }).default({}),
  }),

  optimize: Joi.object({
    script_ids: Joi.array().items(commonFields.id).min(1).max(50).required(),
    optimization_options: Joi.object({
      optimizeSelectors: Joi.boolean().default(true),
      consolidateWaits: Joi.boolean().default(true),
      improveAssertions: Joi.boolean().default(true),
      removeRedundancy: Joi.boolean().default(true),
      addBestPractices: Joi.boolean().default(true),
      validateSyntax: Joi.boolean().default(true),
      generateReport: Joi.boolean().default(true),
    }).default({}),
  }),

  export: Joi.object({
    project_id: commonFields.id,
    export_options: Joi.object({
      format: Joi.string().valid('cypress', 'zip', 'tar', 'json').default('cypress'),
      includeReports: Joi.boolean().default(true),
      includeSourceMaps: Joi.boolean().default(false),
      compression: Joi.boolean().default(true),
      excludePatterns: Joi.array().items(Joi.string()).default([]),
      outputDirectory: Joi.string().max(200).optional(),
    }).default({}),
  }),
};

// Input collection schemas
export const inputSchemas = {
  request: Joi.object({
    session_id: Joi.string().min(1).max(100).optional(),
    input_requests: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().required(),
          type: Joi.string()
            .valid('text', 'number', 'email', 'password', 'select', 'checkbox', 'radio', 'file')
            .required(),
          prompt: Joi.string().min(1).max(500).required(),
          description: Joi.string().max(1000).optional(),
          required: Joi.boolean().default(true),
          category: Joi.string()
            .valid('authentication', 'form-data', 'navigation', 'verification')
            .required(),
          validationRules: Joi.array()
            .items(
              Joi.object({
                type: Joi.string()
                  .valid('required', 'minLength', 'maxLength', 'pattern', 'email', 'url')
                  .required(),
                value: Joi.any().required(),
                message: Joi.string().optional(),
              }),
            )
            .default([]),
          options: Joi.array()
            .items(
              Joi.object({
                value: Joi.any().required(),
                label: Joi.string().required(),
                selected: Joi.boolean().default(false),
              }),
            )
            .optional(),
          defaultValue: Joi.any().optional(),
          metadata: Joi.object().default({}),
        }),
      )
      .min(1)
      .required(),
    timeout: Joi.number().min(5000).max(300000).default(30000),
  }),

  response: Joi.object({
    session_id: Joi.string().required(),
    responses: Joi.array()
      .items(
        Joi.object({
          input_id: Joi.string().required(),
          value: Joi.any().required(),
          timestamp: commonFields.timestamp.default(() => new Date()),
        }),
      )
      .min(1)
      .required(),
  }),
};

// WebSocket message schemas
export const websocketSchemas = {
  connection: Joi.object({
    client_id: Joi.string().min(1).max(100).optional(),
    project_id: commonFields.optionalId,
    subscribe_to: Joi.array()
      .items(
        Joi.string().valid('file-upload', 'test-extraction', 'script-generation', 'notifications'),
      )
      .default(['notifications']),
  }),

  message: Joi.object({
    type: Joi.string()
      .valid(
        'file-upload-progress',
        'test-case-extraction',
        'script-generation-progress',
        'input-request',
        'notification',
        'error',
      )
      .required(),
    payload: Joi.object().required(),
    timestamp: commonFields.timestamp.default(() => new Date()),
    correlation_id: Joi.string().optional(),
  }),
};

// Search and filter schemas
export const searchSchemas = {
  global: Joi.object({
    query: Joi.string().min(1).max(100).required(),
    types: Joi.array()
      .items(Joi.string().valid('projects', 'test-cases', 'scripts'))
      .default(['projects', 'test-cases']),
    limit: Joi.number().min(1).max(50).default(20),
    filters: Joi.object({
      project_id: commonFields.optionalId,
      status: Joi.array().items(Joi.string()).optional(),
      date_from: commonFields.timestamp.optional(),
      date_to: commonFields.timestamp.optional(),
    }).optional(),
  }),
};

// Batch operation schemas
export const batchSchemas = {
  operation: Joi.object({
    operation: Joi.string().valid('delete', 'update', 'process', 'export').required(),
    target_ids: Joi.array().items(commonFields.id).min(1).max(100).required(),
    options: Joi.object().optional(),
    confirmation: Joi.boolean()
      .default(false)
      .when('operation', {
        is: 'delete',
        then: Joi.boolean().valid(true).required().messages({
          'any.only': 'Confirmation required for delete operations',
        }),
      }),
  }),
};

// System configuration schemas
export const systemSchemas = {
  settings: Joi.object({
    max_file_size: Joi.number()
      .min(1024 * 1024)
      .max(100 * 1024 * 1024)
      .optional(), // 1MB to 100MB
    max_test_cases_per_project: Joi.number().min(1).max(10000).optional(),
    default_timeout: Joi.number().min(5000).max(300000).optional(),
    enable_websockets: Joi.boolean().optional(),
    enable_caching: Joi.boolean().optional(),
    log_level: Joi.string().valid('error', 'warn', 'info', 'debug').optional(),
    rate_limit: Joi.object({
      window_ms: Joi.number().min(1000).max(3600000).optional(),
      max_requests: Joi.number().min(1).max(10000).optional(),
    }).optional(),
  }),
};

// Export all schemas for easy access
export const validationSchemas = {
  common: commonFields,
  projects: projectSchemas,
  testCases: testCaseSchemas,
  urls: urlSchemas,
  files: fileSchemas,
  scripts: scriptSchemas,
  inputs: inputSchemas,
  websocket: websocketSchemas,
  search: searchSchemas,
  batch: batchSchemas,
  system: systemSchemas,
};
