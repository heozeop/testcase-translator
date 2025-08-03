import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from '../interfaces';
import { Project } from '../models/Project.entity';
import { ProjectRepository } from '../repositories';

@Injectable()
export class ProjectManagementService {
  constructor(private readonly projectRepository: ProjectRepository) {}

  async findAll(query: ProjectQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions: any = {};
    if (query.search) {
      whereConditions.name = { $like: `%${query.search}%` };
    }

    // Build order conditions
    const orderBy = query.orderBy || 'createdAt';
    const order = query.order || 'DESC';
    const orderConditions = { [orderBy]: order };

    // Get projects with pagination
    const projects = await this.projectRepository.findAll();
    const total = await this.projectRepository.count();

    // Add counts to each project
    const projectsWithCounts = projects.map(project => ({
      ...project,
      test_case_count: project.testCases?.length || 0,
      generated_code_count: project.generatedCodes?.length || 0,
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

  async findOne(id: string): Promise<Project | null> {
    return this.projectRepository.findWithTestCases(id);
  }

  async create(createProjectDto: CreateProjectDto): Promise<Project> {
    const project = {
      name: createProjectDto.name,
      targetUrl: createProjectDto.targetUrl,
      description: createProjectDto.description,
    } as Partial<Project>;

    return this.projectRepository.create(project);
  }

  async update(id: string, updateProjectDto: UpdateProjectDto): Promise<Project> {
    const project = await this.projectRepository.update(id, updateProjectDto);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.projectRepository.delete(id);
    if (!deleted) {
      throw new NotFoundException('Project not found');
    }

    return { message: 'Project deleted successfully' };
  }

  async getStatistics(projectId?: string) {
    let total = 0;

    if (projectId) {
      const exists = await this.projectRepository.exists(projectId);
      total = exists ? 1 : 0;
    } else {
      total = await this.projectRepository.count();
    }

    return {
      totalProjects: total,
    };
  }
}
