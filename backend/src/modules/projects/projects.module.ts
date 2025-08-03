import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ServicesModule } from '../../services/services.module';
import { Project } from '../../models/Project.entity';
import { GeneratedCode } from '../../models/GeneratedCode.entity';
import { GeneratedCodeFile } from '../../models/GeneratedCodeFile.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([Project, GeneratedCode, GeneratedCodeFile]),
    ServicesModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}