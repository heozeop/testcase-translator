import { Injectable } from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { ExecutionResult } from '../models/ExecutionResult.entity';
import { BaseRepository } from './base.repository';
import { ExecutionResultRepositoryInterface } from './execution-result.repository.interface';

@Injectable()
export class ExecutionResultRepository
  extends BaseRepository<ExecutionResult>
  implements ExecutionResultRepositoryInterface
{
  constructor(
    @InjectRepository(ExecutionResult)
    repository: EntityRepository<ExecutionResult>,
    em: EntityManager,
  ) {
    super(repository, em);
  }

  async findByProjectId(projectId: string): Promise<ExecutionResult[]> {
    return this.repository.find({ project: projectId }, { orderBy: { createdAt: 'DESC' } });
  }

  async findByGeneratedCodeId(generatedCodeId: string): Promise<ExecutionResult[]> {
    return this.repository.find(
      { generatedCode: generatedCodeId },
      { orderBy: { createdAt: 'DESC' } },
    );
  }

  async findLatestByProjectId(projectId: string): Promise<ExecutionResult | null> {
    return this.repository.findOne({ project: projectId }, { orderBy: { createdAt: 'DESC' } });
  }

  async deleteOldExecutionsForProject(projectId: string, keepCount: number): Promise<boolean> {
    const executions = await this.repository.find(
      { project: projectId },
      { orderBy: { createdAt: 'DESC' }, limit: keepCount, offset: keepCount },
    );

    if (executions.length === 0) {
      return true;
    }

    await this.em.removeAndFlush(executions);
    return true;
  }
}
