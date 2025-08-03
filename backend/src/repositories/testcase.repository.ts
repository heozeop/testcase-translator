import { Injectable } from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { TestCase } from '../models/TestCase.entity';
import { BaseRepository } from './base.repository';
import { TestCaseRepositoryInterface } from './testcase.repository.interface';

@Injectable()
export class TestCaseRepository
  extends BaseRepository<TestCase>
  implements TestCaseRepositoryInterface
{
  constructor(
    @InjectRepository(TestCase)
    repository: EntityRepository<TestCase>,
    em: EntityManager,
  ) {
    super(repository, em);
  }

  async findByProjectId(projectId: string): Promise<TestCase[]> {
    return this.repository.find({ project: projectId });
  }

  async findByStatus(status: string): Promise<TestCase[]> {
    return this.repository.find({ status });
  }

  async bulkCreate(testCases: Partial<TestCase>[]): Promise<TestCase[]> {
    const entities = testCases.map(testCase => this.repository.create(testCase));
    await this.em.persistAndFlush(entities);
    return entities;
  }

  async bulkUpdate(updates: { id: string; data: Partial<TestCase> }[]): Promise<TestCase[]> {
    const entities: TestCase[] = [];

    for (const update of updates) {
      const entity = await this.findById(update.id);
      if (entity) {
        this.repository.assign(entity, update.data);
        entities.push(entity);
      }
    }

    if (entities.length > 0) {
      await this.em.persistAndFlush(entities);
    }

    return entities;
  }

  async deleteByProjectId(projectId: string): Promise<boolean> {
    const testCases = await this.findByProjectId(projectId);
    if (testCases.length === 0) {
      return true;
    }

    await this.em.removeAndFlush(testCases);
    return true;
  }
}
