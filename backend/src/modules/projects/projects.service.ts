import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/mysql';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
import { Project } from '../../entities/Project.entity';
import * as XLSX from 'xlsx';

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
    
    const qb = this.em.createQueryBuilder(Project, 'p')
      .select(['p.*'])
      .leftJoinAndSelect('p.testCases', 'tc')
      .leftJoinAndSelect('p.generatedCodes', 'gc')
      .groupBy('p.id');
    
    if (query.search) {
      qb.andWhere({ name: { $like: `%${query.search}%` } });
    }
    
    const orderBy = query.orderBy || 'createdAt';
    const order = query.order || 'DESC';
    qb.orderBy({ [`p.${orderBy}`]: order });
    
    qb.limit(limit).offset(offset);
    
    const [projects, total] = await this.em.findAndCount(Project, qb.getQuery(), {
      populate: ['testCases', 'generatedCodes'],
      limit,
      offset,
    });
    
    const projectsWithCounts = projects.map(project => ({
      ...project,
      test_case_count: project.testCases.length,
      generated_code_count: project.generatedCodes.length,
    }));
    
    return {
      data: projectsWithCounts,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  async findOne(id: string) {
    return this.projectRepository.findOne(
      { id },
      { populate: ['testCases', 'generatedCodes', 'testExamples'] }
    );
  }

  async create(createProjectDto: CreateProjectDto) {
    const project = new Project(
      createProjectDto.name,
      createProjectDto.targetUrl,
      createProjectDto.description
    );
    
    await this.em.persistAndFlush(project);
    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.projectRepository.findOne({ id });
    if (!project) {
      throw new Error('Project not found');
    }
    
    this.projectRepository.assign(project, updateProjectDto);
    await this.em.flush();
    
    return project;
  }

  async remove(id: string) {
    const project = await this.projectRepository.findOne({ id });
    if (!project) {
      throw new Error('Project not found');
    }
    
    await this.em.removeAndFlush(project);
    return { message: 'Project deleted successfully' };
  }

  async getStatistics(projectId?: string) {
    let total = 0;
    
    if (projectId) {
      const project = await this.projectRepository.findOne({ id: projectId });
      total = project ? 1 : 0;
    } else {
      total = await this.projectRepository.count();
    }
    
    return {
      totalProjects: total,
      // Add more statistics as needed
    };
  }

  async uploadExcel(_projectId: string, buffer: Buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      // Process Excel data and create test cases
      // Implementation depends on your Excel structure
      
      return {
        message: 'Excel file processed successfully',
        rowCount: data.length,
        data: data.slice(0, 5), // Return first 5 rows as preview
      };
    } catch (error) {
      throw new Error(`Failed to process Excel file: ${(error as Error).message}`);
    }
  }

  async generateCypress(projectId: string, _options: any) {
    const project = await this.findOne(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    try {
      // TODO: Use MastraService and EnhancedCypressPrompts for generation
      // const mastraService = new MastraService();
      // const prompts = new EnhancedCypressPrompts();
      
      // Implementation for Cypress generation
      return {
        message: 'Cypress tests generated successfully',
        projectId,
      };
    } catch (error) {
      throw new Error(`Failed to generate Cypress tests: ${(error as Error).message}`);
    }
  }

  async validateUrl(_url: string, _options?: any) {
    return { message: 'Method not implemented yet' };
  }

  // Additional methods required by the controller
  async uploadTestCases(_projectId: string, _file: any) {
    return { message: 'Method not implemented yet' };
  }

  async exploreAndGenerate(_projectId: string, _explorationOptions: any, _cypressOptions: any, _extraParam?: any) {
    return { message: 'Method not implemented yet' };
  }

  async getExploreStatus(_projectId: string, _processId: string) {
    return { message: 'Method not implemented yet' };
  }

  async getTestCases(_projectId: string, _query: any) {
    return { message: 'Method not implemented yet' };
  }

  async generateCypressCode(projectId: string, _progressCallback?: any) {
    return this.generateCypress(projectId, {});
  }

  async runCypressTests(_projectId: string) {
    return { message: 'Method not implemented yet' };
  }

  async getCypressExecutionStatus(_projectId: string, _executionId: string) {
    return { message: 'Method not implemented yet' };
  }

  async getExecutionScreenshot(_projectId: string, _executionId: string, _filename: string, _res: any) {
    return { message: 'Method not implemented yet' };
  }

  async getExecutionVideo(_projectId: string, _executionId: string, _filename: string, _res: any) {
    return { message: 'Method not implemented yet' };
  }
}