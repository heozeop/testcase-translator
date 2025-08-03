import { Project } from '../models/Project.entity';
import { BaseRepositoryInterface } from './base.repository.interface';

export interface ProjectRepositoryInterface extends BaseRepositoryInterface<Project> {
  findByUrl(url: string): Promise<Project | null>;
  findByUserId(userId: string): Promise<Project[]>;
  findWithTestCases(id: string): Promise<Project | null>;
  findWithGeneratedCode(id: string): Promise<Project | null>;
}
