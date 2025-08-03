import { Injectable } from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { GeneratedCode } from '../models/GeneratedCode.entity';
import { BaseRepository } from './base.repository';
import { GeneratedCodeRepositoryInterface } from './generated-code.repository.interface';

@Injectable()
export class GeneratedCodeRepository
  extends BaseRepository<GeneratedCode>
  implements GeneratedCodeRepositoryInterface
{
  constructor(
    @InjectRepository(GeneratedCode)
    repository: EntityRepository<GeneratedCode>,
    em: EntityManager,
  ) {
    super(repository, em);
  }

  async findByProjectId(projectId: string): Promise<GeneratedCode[]> {
    return this.repository.find({ project: projectId }, { orderBy: { createdAt: 'DESC' } });
  }

  async findLatestByProjectId(projectId: string): Promise<GeneratedCode | null> {
    return this.repository.findOne({ project: projectId }, { orderBy: { createdAt: 'DESC' } });
  }

  async findWithFiles(id: string): Promise<GeneratedCode | null> {
    return this.repository.findOne({ id }, { populate: ['files'] });
  }

  async deleteOldGenerationsForProject(projectId: string, keepCount: number): Promise<boolean> {
    const generations = await this.repository.find(
      { project: projectId },
      { orderBy: { createdAt: 'DESC' }, limit: keepCount, offset: keepCount },
    );

    if (generations.length === 0) {
      return true;
    }

    await this.em.removeAndFlush(generations);
    return true;
  }
}
