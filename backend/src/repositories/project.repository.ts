import { Injectable } from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Project } from '../models/Project.entity';
import { BaseRepository } from './base.repository';
import { ProjectRepositoryInterface } from './project.repository.interface';

@Injectable()
export class ProjectRepository
  extends BaseRepository<Project>
  implements ProjectRepositoryInterface
{
  constructor(
    @InjectRepository(Project)
    repository: EntityRepository<Project>,
    em: EntityManager,
  ) {
    super(repository, em);
  }

  async findByUrl(url: string): Promise<Project | null> {
    return this.repository.findOne({ url });
  }

  async findByUserId(userId: string): Promise<Project[]> {
    return this.repository.find({ userId });
  }

  async findWithTestCases(id: string): Promise<Project | null> {
    return this.repository.findOne({ id }, { populate: ['testCases'] });
  }

  async findWithGeneratedCode(id: string): Promise<Project | null> {
    return this.repository.findOne({ id }, { populate: ['generatedCodes'] });
  }
}
