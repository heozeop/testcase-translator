import { TestCase } from '../models/TestCase.entity';
import { BaseRepositoryInterface } from './base.repository.interface';

export interface TestCaseRepositoryInterface extends BaseRepositoryInterface<TestCase> {
  findByProjectId(projectId: string): Promise<TestCase[]>;
  findByStatus(status: string): Promise<TestCase[]>;
  bulkCreate(testCases: Partial<TestCase>[]): Promise<TestCase[]>;
  bulkUpdate(updates: { id: string; data: Partial<TestCase> }[]): Promise<TestCase[]>;
  deleteByProjectId(projectId: string): Promise<boolean>;
}
