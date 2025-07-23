import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { AICypressService } from '../../services/ai-cypress.service';
import { CypressExecutorService } from '../../services/cypress-executor.service';
import { FileStorageService } from '../../services/file-storage.service';
import { Project } from '../../entities/Project.entity';
import { GeneratedCode } from '../../entities/GeneratedCode.entity';
import { GeneratedCodeFile } from '../../entities/GeneratedCodeFile.entity';

@Module({
  imports: [MikroOrmModule.forFeature([Project, GeneratedCode, GeneratedCodeFile])],
  controllers: [ProjectsController],
  providers: [ProjectsService, AICypressService, CypressExecutorService, FileStorageService],
  exports: [ProjectsService],
})
export class ProjectsModule {}