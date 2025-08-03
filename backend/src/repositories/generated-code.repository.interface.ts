import { GeneratedCode } from '../models/GeneratedCode.entity';
import { BaseRepositoryInterface } from './base.repository.interface';

export interface GeneratedCodeRepositoryInterface extends BaseRepositoryInterface<GeneratedCode> {
  findByProjectId(projectId: string): Promise<GeneratedCode[]>;
  findLatestByProjectId(projectId: string): Promise<GeneratedCode | null>;
  findWithFiles(id: string): Promise<GeneratedCode | null>;
  deleteOldGenerationsForProject(projectId: string, keepCount: number): Promise<boolean>;
}
