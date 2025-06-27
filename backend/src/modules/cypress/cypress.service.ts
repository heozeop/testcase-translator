import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/core';
import { GeneratedCode } from '../../entities/GeneratedCode.entity';
import { GeneratedCodeFile } from '../../entities/GeneratedCodeFile.entity';
import { ExplorationResult } from '../../entities/ExplorationResult.entity';
import { ExplorationSession } from '../../entities/ExplorationSession.entity';
import { Project } from '../../entities/Project.entity';
import { CypressTemplateEngine } from '../../services/CypressTemplateEngine';
import { 
  GenerateCypressDto, 
  RegenerateCypressDto, 
  CypressQueryDto 
} from './dto/cypress.dto';
import * as fs from 'fs';
import * as path from 'path';

// Mock interfaces for Cypress generation
interface CypressGenerationRequest {
  projectId: string;
  sessionId?: string;
  baseUrl?: string;
  suiteName?: string;
  description?: string;
  options?: any;
  testCaseIds?: string[];
}

interface CypressGenerationResult {
  id: string;
  projectId: string;
  status: string;
  outputPath?: string;
  metadata?: any;
}

@Injectable()
export class CypressService {
  private readonly logger = new Logger(CypressService.name);
  private readonly templateEngine: CypressTemplateEngine;

  constructor(
    @InjectRepository(GeneratedCode)
    private readonly generatedCodeRepository: EntityRepository<GeneratedCode>,
    @InjectRepository(GeneratedCodeFile)
    private readonly generatedCodeFileRepository: EntityRepository<GeneratedCodeFile>,
    @InjectRepository(ExplorationResult)
    private readonly explorationResultRepository: EntityRepository<ExplorationResult>,
    @InjectRepository(ExplorationSession)
    private readonly explorationSessionRepository: EntityRepository<ExplorationSession>,
    @InjectRepository(Project)
    private readonly projectRepository: EntityRepository<Project>,
    private readonly em: EntityManager,
  ) {
    this.templateEngine = new CypressTemplateEngine();
  }

  async generate(generateDto: GenerateCypressDto): Promise<CypressGenerationResult> {
    this.logger.log(`Starting Cypress generation for project ${generateDto.projectId}`);

    try {
      const project = await this.projectRepository.findOneOrFail({ id: generateDto.projectId });
      
      // Create generated code record
      const generatedCode = new GeneratedCode(project, `/tmp/cypress-${Date.now()}`);
      generatedCode.sessionId = generateDto.sessionId;
      generatedCode.suiteName = generateDto.suiteName || `${project.name} Tests`;
      generatedCode.description = generateDto.description || 'Generated Cypress test suite';
      generatedCode.baseUrl = generateDto.baseUrl;
      generatedCode.status = 'completed';
      generatedCode.metadata = {
        options: generateDto.options,
        testCaseIds: generateDto.testCaseIds,
        generatedAt: new Date().toISOString(),
      };

      await this.em.persistAndFlush(generatedCode);

      // Create mock test files
      const testFile = new GeneratedCodeFile(
        generatedCode,
        'test',
        'example.cy.js',
        '/cypress/e2e/example.cy.js',
        `describe('${generatedCode.suiteName}', () => {
  it('should load the page', () => {
    cy.visit('${generateDto.baseUrl || project.targetUrl}');
    cy.contains('Welcome');
  });
});`
      );

      await this.em.persistAndFlush(testFile);

      const result: CypressGenerationResult = {
        id: generatedCode.id,
        projectId: generateDto.projectId,
        status: 'completed',
        outputPath: generatedCode.outputPath,
        metadata: generatedCode.metadata,
      };

      this.logger.log(`Cypress generation completed for project ${generateDto.projectId}: ${result.status}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to generate Cypress project for ${generateDto.projectId}:`, error);
      throw error;
    }
  }

  async getGenerations(query: CypressQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const orderBy: any = {};
    
    if (query.orderBy) {
      orderBy[query.orderBy === 'created_at' ? 'createdAt' : query.orderBy] = query.order || 'DESC';
    } else {
      orderBy.createdAt = 'DESC';
    }

    const where: any = {};
    if (query.projectId) {
      where.project = { id: query.projectId };
    }
    if (query.status) {
      where.status = query.status;
    }

    try {
      const [generations, total] = await this.generatedCodeRepository.findAndCount(
        where,
        {
          limit,
          offset,
          orderBy,
          populate: ['project'],
        }
      );

      const totalPages = Math.ceil(total / limit);
      
      return {
        data: generations,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        message: 'Generated Cypress projects retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve generations:', error);
      throw error;
    }
  }

  async getGeneration(id: string) {
    try {
      const generation = await this.generatedCodeRepository.findOne({ id }, { populate: ['project', 'files'] });
      return generation;
    } catch (error) {
      this.logger.error(`Failed to retrieve generation ${id}:`, error);
      throw error;
    }
  }

  async getFileContent(generationId: string, fileName: string): Promise<string | null> {
    try {
      const file = await this.generatedCodeFileRepository.findOne({
        generatedCode: { id: generationId },
        fileName: fileName,
      });
      
      return file?.content || null;

    } catch (error) {
      this.logger.error(`Failed to get file content for ${fileName} in generation ${generationId}:`, error);
      return null;
    }
  }

  async regenerate(regenerateDto: RegenerateCypressDto): Promise<CypressGenerationResult> {
    this.logger.log(`Starting Cypress regeneration for generation ${regenerateDto.generationId}`);

    try {
      // Get the original generation
      const originalGeneration = await this.generatedCodeRepository.findById(regenerateDto.generationId);
      if (!originalGeneration) {
        throw new Error(`Generation ${regenerateDto.generationId} not found`);
      }

      // Create new generation request based on original with updated options
      const request: CypressGenerationRequest = {
        projectId: originalGeneration.project_id,
        sessionId: originalGeneration.session_id || '',
        baseUrl: originalGeneration.base_url || '',
        suiteName: originalGeneration.suite_name || 'Regenerated Test Suite',
        description: originalGeneration.description || 'Regenerated Cypress test suite',
        options: {
          includeScreenshots: regenerateDto.options?.includeScreenshots ?? true,
          generateFixtures: regenerateDto.options?.generateFixtures ?? true,
          templateTypes: regenerateDto.options?.templateTypes || ['navigation', 'form'],
          customCommands: regenerateDto.options?.customCommands ?? true,
          dataTestAttributes: regenerateDto.options?.dataTestAttributes ?? false,
          viewportSizes: regenerateDto.options?.viewportSizes || ['1280x720'],
        },
        testCaseIds: regenerateDto.testCaseIds,
      };

      // Generate new Cypress project
      const result = await this.orchestrator.generateCypressProject(request);

      this.logger.log(`Cypress regeneration completed for generation ${regenerateDto.generationId}: ${result.status}`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to regenerate Cypress project for ${regenerateDto.generationId}:`, error);
      throw error;
    }
  }

  async deleteGeneration(id: string): Promise<boolean> {
    try {
      const deleted = await this.generatedCodeRepository.delete(id);
      
      if (deleted) {
        this.logger.log(`Generation ${id} deleted successfully`);
      }
      
      return deleted;
    } catch (error) {
      this.logger.error(`Failed to delete generation ${id}:`, error);
      throw error;
    }
  }

  async getTemplates() {
    try {
      const templateNames = this.templateEngine.getAvailableTemplates();
      
      // Create template metadata since the engine only returns names
      const templates = templateNames.map(name => ({
        id: name,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        description: this.getTemplateDescription(name),
        category: this.getTemplateCategory(name),
        supportedActions: this.getSupportedActions(name),
        requiredInputs: this.getRequiredInputs(name),
      }));
      
      return {
        data: {
          templates,
          totalCount: templates.length,
        },
        message: 'Available templates retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve templates:', error);
      throw error;
    }
  }

  private getTemplateDescription(templateName: string): string {
    const descriptions: Record<string, string> = {
      navigation: 'Basic page navigation and URL verification template',
      form: 'Form interaction and validation template',
      interaction: 'Element interaction and click-based actions template',
      validation: 'Content and element validation template',
    };
    return descriptions[templateName] || `${templateName} template`;
  }

  private getTemplateCategory(templateName: string): string {
    const categories: Record<string, string> = {
      navigation: 'navigation',
      form: 'form',
      interaction: 'interaction',
      validation: 'validation',
    };
    return categories[templateName] || 'general';
  }

  private getSupportedActions(templateName: string): string[] {
    const actions: Record<string, string[]> = {
      navigation: ['visit', 'url', 'go'],
      form: ['type', 'select', 'click', 'submit'],
      interaction: ['click', 'hover', 'scroll', 'drag'],
      validation: ['should', 'contains', 'visible', 'exist'],
    };
    return actions[templateName] || ['click', 'type', 'should'];
  }

  private getRequiredInputs(templateName: string): string[] {
    const inputs: Record<string, string[]> = {
      navigation: ['baseUrl', 'targetUrl'],
      form: ['formData', 'selectors'],
      interaction: ['elements', 'actions'],
      validation: ['assertions', 'expectedValues'],
    };
    return inputs[templateName] || ['baseUrl'];
  }

  async getStatistics(projectId?: string) {
    try {
      const stats = await this.generatedCodeRepository.getStatistics(projectId);
      
      return {
        data: {
          projectId,
          generations: {
            total: stats.totalGenerations || 0,
            successful: stats.successfulGenerations || 0,
            failed: stats.failedGenerations || 0,
            pending: stats.pendingGenerations || 0,
          },
          files: {
            totalGenerated: stats.totalFiles || 0,
            averageFilesPerGeneration: stats.averageFilesPerGeneration || 0,
          },
          usage: {
            totalTestCases: stats.totalTestCases || 0,
            averageTestCasesPerGeneration: stats.averageTestCasesPerGeneration || 0,
          },
          performance: {
            averageGenerationTime: stats.averageGenerationTime || 0,
            lastGeneration: stats.lastGenerationTime,
          },
        },
        message: 'Generation statistics retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve statistics:', error);
      throw error;
    }
  }

  async validateRequest(generateDto: GenerateCypressDto) {
    const validationResults = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
      recommendations: [] as string[],
    };

    try {
      // Validate project exists
      // Note: In a real implementation, you'd check if the project exists
      if (!generateDto.projectId) {
        validationResults.isValid = false;
        validationResults.errors.push('Project ID is required');
      }

      // Validate session exists and has data
      if (!generateDto.sessionId) {
        validationResults.isValid = false;
        validationResults.errors.push('Session ID is required');
      } else {
        // Check if session has exploration data
        const sessionData = await this.explorationResultRepository.findBySessionId(generateDto.sessionId);
        if (!sessionData || sessionData.length === 0) {
          validationResults.isValid = false;
          validationResults.errors.push('No exploration data found for the specified session');
        } else {
          const pageStates = sessionData.filter(result => result.page_states && result.page_states.length > 0);
          if (pageStates.length === 0) {
            validationResults.warnings.push('No page states found in exploration data');
          }
        }
      }

      // Validate base URL format
      if (generateDto.baseUrl) {
        try {
          new URL(generateDto.baseUrl);
        } catch {
          validationResults.warnings.push('Base URL format appears invalid');
        }
      } else {
        validationResults.recommendations.push('Consider providing a base URL for better test organization');
      }

      // Validate template types
      if (generateDto.options?.templateTypes) {
        const validTemplates = ['navigation', 'form', 'interaction', 'validation'];
        const invalidTemplates = generateDto.options.templateTypes.filter(
          type => !validTemplates.includes(type)
        );
        if (invalidTemplates.length > 0) {
          validationResults.warnings.push(
            `Unknown template types: ${invalidTemplates.join(', ')}`
          );
        }
      }

      // Performance recommendations
      if (generateDto.testCaseIds && generateDto.testCaseIds.length > 50) {
        validationResults.recommendations.push(
          'Large number of test cases may result in longer generation time'
        );
      }

      return {
        data: validationResults,
        message: 'Request validation completed',
      };

    } catch (error) {
      this.logger.error('Failed to validate request:', error);
      return {
        data: {
          isValid: false,
          errors: ['Validation failed due to internal error'],
          warnings: [],
          recommendations: [],
        },
        message: 'Request validation failed',
      };
    }
  }
}