import express from 'express';
import { Request, Response } from 'express';
import { TestCaseRepository } from '../repositories/TestCaseRepository';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { GeneratedCodeRepository } from '../repositories/GeneratedCodeRepository';
import { CypressScriptGenerator } from '../services/CypressScriptGenerator';
// import { TestCaseToCypressConverter } from '../services/TestCaseToCypressConverter';
import { CypressScriptOptimizer } from '../services/CypressScriptOptimizer';
import { CypressTemplateEngine } from '../services/CypressTemplateEngine';
import { CypressOutputManager } from '../services/CypressOutputManager';
import { TestCaseLinkingService } from '../services/TestCaseLinkingService';
// import { PageExplorationService } from '../services/PageExplorationService';
import { 
  asyncHandler, 
  validateSchema, 
  HttpError, 
  NotFoundError, 
  // ConflictError
  // ServiceUnavailableError
} from '../middleware/errorHandler';
import { 
  sendSuccess, 
  sendPaginatedResponse, 
  getPaginationOptions,
  getFilterOptions,
  sanitizeOutput,
  measurePerformance
} from '../utils/apiHelpers';
import { validationSchemas } from '../utils/validationSchemas';

const router = express.Router();

// Initialize repositories and services
const testCaseRepository = new TestCaseRepository();
const projectRepository = new ProjectRepository();
const { pool } = require('../db');
const generatedCodeRepository = new GeneratedCodeRepository(pool);
const scriptGenerator = new CypressScriptGenerator();
// const converter = new TestCaseToCypressConverter(scriptGenerator);
const optimizer = new CypressScriptOptimizer();
const templateEngine = new CypressTemplateEngine();
const outputManager = new CypressOutputManager();
const linkingService = new TestCaseLinkingService();
// const explorationService = new PageExplorationService();

// GET /api/scripts
router.get('/',
  validateSchema({
    page: validationSchemas.common.page,
    limit: validationSchemas.common.limit,
    project_id: validationSchemas.common.optionalId,
    status: validationSchemas.common.optional.string,
    orderBy: validationSchemas.common.string.valid('created_at', 'updated_at', 'name').default('created_at'),
    order: validationSchemas.common.order
  }, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const paginationOptions = getPaginationOptions(req);
    const filters = getFilterOptions(req, ['project_id', 'status', 'created_after', 'created_before']);

    const result = await generatedCodeRepository.findAll({
      ...paginationOptions,
      ...filters
    });

    sendPaginatedResponse(res, result);
  })
);

// GET /api/scripts/:id
router.get('/:id',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const script = await generatedCodeRepository.findById(id);
    if (!script) {
      throw new NotFoundError('Script');
    }

    sendSuccess(res, sanitizeOutput(script));
  })
);

// POST /api/scripts/generate
router.post('/generate',
  validateSchema(validationSchemas.scripts.generate),
  asyncHandler(async (req: Request, res: Response) => {
    const { test_case_ids, options } = req.body;
    const wsEndpoints = req.app.locals.wsEndpoints;

    // Validate all test cases exist and are processed
    const testCases = await Promise.all(
      test_case_ids.map((id: string) => testCaseRepository.findById(id))
    );

    const notFound = testCases.findIndex(tc => !tc);
    if (notFound !== -1) {
      throw new NotFoundError(`Test case at index ${notFound}`);
    }

    const unprocessed = testCases.filter(tc => tc.status !== 'processed');
    if (unprocessed.length > 0) {
      throw new HttpError(
        `${unprocessed.length} test cases are not processed. Please process them first.`,
        400,
        'UNPROCESSED_TEST_CASES'
      );
    }

    // Group test cases by project
    const projectGroups = new Map<string, any[]>();
    testCases.forEach(tc => {
      if (!projectGroups.has(tc.project_id)) {
        projectGroups.set(tc.project_id, []);
      }
      projectGroups.get(tc.project_id)!.push(tc);
    });

    const generationResults: any[] = [];

    // Generate scripts for each project group
    for (const [projectId, projectTestCases] of projectGroups) {
      try {
        const project = await projectRepository.findById(projectId);
        if (!project) {
          throw new Error(`Project ${projectId} not found`);
        }

        if (wsEndpoints) {
          wsEndpoints.broadcastNotificationToProject(
            projectId,
            'Script Generation Started',
            `Generating Cypress scripts for ${projectTestCases.length} test cases`,
            'info'
          );
        }

        // Get linked data and exploration results for each test case
        const linkedDataMap = new Map();
        const explorationResults = new Map();
        const pageAnalyses = new Map();

        for (const testCase of projectTestCases) {
          try {
            const linkedData = await linkingService.getLinkedTestData(testCase.id);
            linkedDataMap.set(testCase.id, linkedData);

            const explorationResult = { pageAnalysis: null }; // await explorationService.getExplorationResult(project.target_url);
            explorationResults.set(testCase.id, explorationResult);

            // Use exploration result for page analysis
            pageAnalyses.set(testCase.id, explorationResult.pageAnalysis || {
              url: project.target_url,
              title: 'Page',
              forms: [],
              links: [],
              images: [],
              interactiveElements: [],
              errors: []
            });
          } catch (error) {
            console.warn(`Failed to get data for test case ${testCase.id}:`, error);
          }
        }

        // Generate scripts
        const { result: scripts } = await measurePerformance(
          () => scriptGenerator.generateMultipleScripts(
            projectTestCases,
            linkedDataMap,
            explorationResults,
            pageAnalyses
          ),
          `Script generation for project ${projectId}`
        );

        // Store generated scripts
        const storedScripts = await Promise.all(
          scripts.map(async (script: any) => {
            const stored = await generatedCodeRepository.create({
              project_id: projectId,
              test_case_id: script.metadata?.testCaseId,
              file_name: script.fileName || 'generated_script.cy.js',
              file_path: script.filePath || '/cypress/e2e',
              content: script.content || '',
              metadata: script.metadata || {},
              status: 'generated'
            });
            return stored;
          })
        );

        generationResults.push({
          projectId,
          projectName: project.name,
          testCaseCount: projectTestCases.length,
          scriptsGenerated: scripts.length,
          scripts: storedScripts.map((s: any) => ({
            id: s.id,
            fileName: s.file_name,
            testCaseId: s.test_case_id
          }))
        });

        if (wsEndpoints) {
          wsEndpoints.broadcastNotificationToProject(
            projectId,
            'Script Generation Complete',
            `Generated ${scripts.length} Cypress scripts successfully`,
            'success'
          );
        }

      } catch (error: any) {
        generationResults.push({
          projectId,
          error: error.message,
          testCaseCount: projectTestCases.length,
          scriptsGenerated: 0
        });

        if (wsEndpoints) {
          wsEndpoints.broadcastNotificationToProject(
            projectId,
            'Script Generation Failed',
            `Failed to generate scripts: ${error.message}`,
            'error'
          );
        }
      }
    }

    const summary = {
      totalTestCases: test_case_ids.length,
      totalScriptsGenerated: generationResults.reduce((sum, r) => sum + (r.scriptsGenerated || 0), 0),
      projectResults: generationResults,
      options
    };

    sendSuccess(res, sanitizeOutput(summary), 'Script generation completed');
  })
);

// POST /api/scripts/:id/optimize
router.post('/:id/optimize',
  validateSchema(validationSchemas.common.id, 'params'),
  validateSchema(validationSchemas.scripts.optimize),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { optimization_options: _optimization_options } = req.body;

    // Check if script exists
    const script = await generatedCodeRepository.findById(id);
    if (!script) {
      throw new NotFoundError('Script');
    }

    // Create GeneratedScript object for optimizer
    const script_any = script as any;
    const generatedScript = {
      fileName: script_any.file_name || 'script.cy.js',
      filePath: script_any.file_path || '/cypress/e2e',
      content: script_any.content || '',
      metadata: script_any.metadata || {}
    };

    // Optimize the script
    const { result: optimizationResult } = await measurePerformance(
      () => optimizer.optimizeScript(generatedScript),
      `Script optimization for ${(script as any).file_name || 'script'}`
    );

    // Update the script with optimized content
    const updatedScript = await generatedCodeRepository.update(id, {
      content: optimizationResult.optimizedScript,
      metadata: {
        ...script.metadata,
        optimized: true,
        optimizationResult: {
          appliedOptimizations: optimizationResult.appliedOptimizations.length,
          improvements: optimizationResult.metrics.improvement,
          warnings: optimizationResult.warnings,
          optimizedAt: new Date().toISOString()
        }
      },
      status: 'optimized'
    });

    sendSuccess(res, {
      script: sanitizeOutput(updatedScript),
      optimization: sanitizeOutput(optimizationResult)
    }, 'Script optimized successfully');
  })
);

// POST /api/scripts/batch-optimize
router.post('/batch-optimize',
  validateSchema(validationSchemas.scripts.optimize),
  asyncHandler(async (req: Request, res: Response) => {
    const { script_ids, optimization_options: _optimization_options } = req.body;

    // Validate all scripts exist
    const scripts = await Promise.all(
      script_ids.map((id: string) => generatedCodeRepository.findById(id))
    );

    const notFound = scripts.findIndex(s => !s);
    if (notFound !== -1) {
      throw new NotFoundError(`Script at index ${notFound}`);
    }

    const optimizationResults: any[] = [];

    for (const script of scripts) {
      try {
        const script_any = script as any;
        const generatedScript = {
          fileName: script_any.file_name,
          filePath: script_any.file_path,
          content: script_any.content,
          metadata: script_any.metadata
        };

        const optimizationResult = await optimizer.optimizeScript(generatedScript);

        await generatedCodeRepository.update(script.id, {
          content: optimizationResult.optimizedScript,
          metadata: {
            ...script.metadata,
            optimized: true,
            optimizationResult: {
              appliedOptimizations: optimizationResult.appliedOptimizations.length,
              improvements: optimizationResult.metrics.improvement,
              warnings: optimizationResult.warnings,
              optimizedAt: new Date().toISOString()
            }
          },
          status: 'optimized'
        });

        optimizationResults.push({
          scriptId: script.id,
          fileName: (script as any).file_name,
          status: 'success',
          appliedOptimizations: optimizationResult.appliedOptimizations.length,
          improvements: optimizationResult.metrics.improvement
        });

      } catch (error: any) {
        optimizationResults.push({
          scriptId: script.id,
          fileName: (script as any).file_name,
          status: 'failed',
          error: error.message
        });
      }
    }

    const summary = {
      totalScripts: script_ids.length,
      successful: optimizationResults.filter(r => r.status === 'success').length,
      failed: optimizationResults.filter(r => r.status === 'failed').length,
      results: optimizationResults
    };

    sendSuccess(res, sanitizeOutput(summary), 'Batch optimization completed');
  })
);

// POST /api/scripts/:id/validate
router.post('/:id/validate',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if script exists
    const script = await generatedCodeRepository.findById(id);
    if (!script) {
      throw new NotFoundError('Script');
    }

    // Validate the script
    const { result: validationResult } = await measurePerformance(
      () => optimizer.validateScript((script as any).content),
      `Script validation for ${(script as any).file_name}`
    );

    // Update script status based on validation
    const status = validationResult.isValid ? 'validated' : 'validation_failed';
    await generatedCodeRepository.update(id, {
      metadata: {
        ...script.metadata,
        validated: true,
        validationResult: {
          isValid: validationResult.isValid,
          errors: validationResult.syntaxErrors.length + validationResult.logicalErrors.length,
          warnings: validationResult.warnings.length,
          confidence: validationResult.confidence,
          validatedAt: new Date().toISOString()
        }
      },
      status
    });

    sendSuccess(res, sanitizeOutput(validationResult), 'Script validation completed');
  })
);

// POST /api/scripts/export
router.post('/export',
  validateSchema(validationSchemas.scripts.export),
  asyncHandler(async (req: Request, res: Response) => {
    const { project_id, export_options } = req.body;

    // Validate project exists
    const project = await projectRepository.findById(project_id);
    if (!project) {
      throw new NotFoundError('Project');
    }

    // Get all scripts for the project
    const scripts = await generatedCodeRepository.findByProjectId(project_id);
    if (scripts.length === 0) {
      throw new HttpError('No scripts found for this project', 404, 'NO_SCRIPTS_FOUND');
    }

    // Convert to GeneratedScript format
    const generatedScripts = scripts.map((s: any) => ({
      fileName: s.file_name,
      filePath: s.file_path,
      content: s.content,
      metadata: s.metadata
    }));

    // Get optimization and validation results
    const optimizationResults = new Map();
    const validationResults = new Map();

    scripts.forEach(script => {
      if (script.metadata?.optimizationResult) {
        optimizationResults.set(script.file_name, script.metadata.optimizationResult);
      }
      if (script.metadata?.validationResult) {
        validationResults.set(script.file_name, script.metadata.validationResult);
      }
    });

    // Generate project structure
    const { result: outputResult } = await measurePerformance(
      () => outputManager.generateProjectStructure(
        generatedScripts,
        optimizationResults,
        validationResults
      ),
      `Project export for ${project.name}`
    );

    if (!outputResult.success) {
      throw new HttpError(
        `Export failed: ${outputResult.errors.join(', ')}`,
        500,
        'EXPORT_FAILED'
      );
    }

    // Export in requested format
    let exportPath = '';
    if (export_options.format !== 'cypress') {
      exportPath = await outputManager.exportProject(export_options);
    } else {
      exportPath = outputManager.getConfiguration().baseDirectory;
    }

    // Store export record for auditing
    const exportRecord = {
      project_id,
      export_format: export_options.format,
      file_count: outputResult.summary.totalFiles,
      total_size: outputResult.summary.totalSize,
      export_path: exportPath,
      created_at: new Date()
    };
    
    // Log export activity for audit trail
    console.log('Project export completed:', exportRecord);

    const exportResult = {
      exportId: `export_${Date.now()}`,
      projectName: project.name,
      format: export_options.format,
      summary: outputResult.summary,
      downloadPath: exportPath,
      files: outputResult.generatedFiles.map(f => ({
        name: f.fileName,
        type: f.fileType,
        size: f.size
      }))
    };

    sendSuccess(res, sanitizeOutput(exportResult), 'Project exported successfully');
  })
);

// GET /api/scripts/:id/download
router.get('/:id/download',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if script exists
    const script = await generatedCodeRepository.findById(id);
    if (!script) {
      throw new NotFoundError('Script');
    }

    const script_any = script as any;
    // Set appropriate headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${script_any.file_name}"`);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Content-Length', Buffer.byteLength(script_any.content, 'utf8'));

    res.send(script_any.content);
  })
);

// DELETE /api/scripts/:id
router.delete('/:id',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if script exists
    const script = await generatedCodeRepository.findById(id);
    if (!script) {
      throw new NotFoundError('Script');
    }

    await generatedCodeRepository.delete(id);
    sendSuccess(res, { id }, 'Script deleted successfully');
  })
);

// GET /api/scripts/templates
router.get('/templates',
  asyncHandler(async (_req: Request, res: Response) => {
    const templates = (templateEngine as any).getAllTemplates?.() || [];
    sendSuccess(res, sanitizeOutput(templates));
  })
);

// GET /api/scripts/templates/:id
router.get('/templates/:id',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const template = templateEngine.getTemplate(id);
    if (!template) {
      throw new NotFoundError('Template');
    }

    sendSuccess(res, sanitizeOutput(template));
  })
);

// POST /api/scripts/templates/:id/preview
router.post('/templates/:id/preview',
  validateSchema(validationSchemas.common.id, 'params'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { variables } = req.body;

    const preview = templateEngine.previewTemplate(id, variables || {});
    sendSuccess(res, sanitizeOutput(preview));
  })
);

// GET /api/scripts/statistics
router.get('/statistics',
  asyncHandler(async (req: Request, res: Response) => {
    const project_id = req.query.project_id as string;

    const stats = await generatedCodeRepository.getStatistics(project_id);
    sendSuccess(res, sanitizeOutput(stats));
  })
);

export default router;