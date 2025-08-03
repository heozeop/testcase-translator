import { ExecutionResult } from '../models/ExecutionResult.entity';
import { BaseRepositoryInterface } from './base.repository.interface';

export interface ExecutionResultRepositoryInterface
  extends BaseRepositoryInterface<ExecutionResult> {
  findByProjectId(projectId: string): Promise<ExecutionResult[]>;
  findByGeneratedCodeId(generatedCodeId: string): Promise<ExecutionResult[]>;
  findLatestByProjectId(projectId: string): Promise<ExecutionResult | null>;
  deleteOldExecutionsForProject(projectId: string, keepCount: number): Promise<boolean>;
}
