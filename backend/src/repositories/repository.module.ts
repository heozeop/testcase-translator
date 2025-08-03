import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Project } from '../models/Project.entity';
import { TestCase } from '../models/TestCase.entity';
import { GeneratedCode } from '../models/GeneratedCode.entity';
import { ExecutionResult } from '../models/ExecutionResult.entity';
import { ProjectRepository } from './project.repository';
import { TestCaseRepository } from './testcase.repository';
import { GeneratedCodeRepository } from './generated-code.repository';
import { ExecutionResultRepository } from './execution-result.repository';

@Module({
  imports: [MikroOrmModule.forFeature([Project, TestCase, GeneratedCode, ExecutionResult])],
  providers: [
    ProjectRepository,
    TestCaseRepository,
    GeneratedCodeRepository,
    ExecutionResultRepository,
  ],
  exports: [
    ProjectRepository,
    TestCaseRepository,
    GeneratedCodeRepository,
    ExecutionResultRepository,
  ],
})
export class RepositoryModule {}
