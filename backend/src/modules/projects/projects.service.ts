import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/core';
import { Project } from '../../entities/Project.entity';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: EntityRepository<Project>,
    private readonly em: EntityManager,
  ) {}

  async findAll(query: ProjectQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const orderBy: any = {};
    
    if (query.orderBy) {
      orderBy[query.orderBy] = query.order || 'DESC';
    } else {
      orderBy.createdAt = 'DESC';
    }

    const where: any = {};
    if (query.search) {
      where.name = { $ilike: `%${query.search}%` };
    }

    const [projects, total] = await this.projectRepository.findAndCount(
      where,
      {
        limit,
        offset,
        orderBy,
      }
    );

    const totalPages = Math.ceil(total / limit);
    
    return {
      data: projects,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      message: 'Projects retrieved successfully',
    };
  }

  async findOne(id: string) {
    const project = await this.projectRepository.findOne({ id });
    return {
      data: project,
      message: 'Project retrieved successfully',
    };
  }

  async create(createProjectDto: CreateProjectDto) {
    const project = new Project(
      createProjectDto.name,
      createProjectDto.targetUrl,
      createProjectDto.description
    );
    
    await this.em.persistAndFlush(project);
    
    return {
      data: project,
      message: 'Project created successfully',
    };
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.projectRepository.findOneOrFail({ id });
    
    if (updateProjectDto.name !== undefined) {
      project.name = updateProjectDto.name;
    }
    if (updateProjectDto.targetUrl !== undefined) {
      project.targetUrl = updateProjectDto.targetUrl;
    }
    if (updateProjectDto.description !== undefined) {
      project.description = updateProjectDto.description;
    }

    await this.em.flush();
    
    return {
      data: project,
      message: 'Project updated successfully',
    };
  }

  async remove(id: string): Promise<boolean> {
    const project = await this.projectRepository.findOne({ id });
    if (!project) {
      return false;
    }
    
    await this.em.removeAndFlush(project);
    return true;
  }

  async validateUrl(url: string, _options?: any) {
    // This would integrate with the URL validation service
    // For now, return a mock response
    return {
      data: {
        url,
        isValid: true,
        isSafe: true,
        normalizedUrl: url,
        accessibility: {
          accessible: true,
          status: 200,
          responseTime: 250,
        },
      },
      message: 'URL validation completed successfully',
    };
  }

  async uploadTestCases(projectId: string, file: Express.Multer.File) {
    // This would integrate with the Excel parsing service
    // For now, return a mock response
    return {
      data: {
        projectId,
        fileName: file.originalname,
        fileSize: file.size,
        testCasesExtracted: 5,
        status: 'processed',
      },
      message: 'Test cases uploaded and processed successfully',
    };
  }

  async exploreAndGenerate(
    projectId: string,
    url: string,
    explorationOptions?: any,
    cypressOptions?: any,
  ) {
    const processId = `exploration-${Date.now()}`;
    
    return {
      data: {
        processId,
        projectId,
        status: 'initiated',
        url,
        explorationOptions,
        cypressOptions,
        estimatedDuration: '2-5 minutes',
        statusEndpoint: `/api/projects/${projectId}/explore-status/${processId}`,
      },
      message: 'Exploration and generation process initiated successfully',
    };
  }

  async getExploreStatus(projectId: string, processId: string) {
    // Mock status response
    return {
      data: {
        processId,
        projectId,
        status: 'in_progress',
        progress: {
          exploration: 'completed',
          inputCollection: 'in_progress',
          cypressGeneration: 'pending',
        },
        currentStep: 'Collecting user inputs via WebSocket',
        estimatedTimeRemaining: '2 minutes',
        startedAt: new Date(Date.now() - 120000).toISOString(),
        results: {
          pagesExplored: 3,
          formsFound: 2,
          inputsCollected: 5,
          screenshotsTaken: 8,
        },
      },
      message: 'Process status retrieved successfully',
    };
  }

  async getStatistics(id: string) {
    // Mock statistics response
    return {
      data: {
        projectId: id,
        testCases: {
          total: 15,
          pending: 3,
          processed: 10,
          failed: 2,
        },
        generations: {
          total: 8,
          successful: 6,
          failed: 2,
        },
        lastActivity: new Date().toISOString(),
      },
      message: 'Project statistics retrieved successfully',
    };
  }

  async getTestCases(_projectId: string, _query: any) {
    // Mock test cases response
    return {
      data: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
      message: 'Test cases retrieved successfully',
    };
  }
}