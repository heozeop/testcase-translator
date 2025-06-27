import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { CypressController } from './cypress.controller';
import { CypressService } from './cypress.service';
import { GeneratedCode } from '../../entities/GeneratedCode.entity';
import { GeneratedCodeFile } from '../../entities/GeneratedCodeFile.entity';
import { ExplorationResult } from '../../entities/ExplorationResult.entity';
import { ExplorationSession } from '../../entities/ExplorationSession.entity';
import { Project } from '../../entities/Project.entity';

@Module({
  imports: [MikroOrmModule.forFeature([GeneratedCode, GeneratedCodeFile, ExplorationResult, ExplorationSession, Project])],
  controllers: [CypressController],
  providers: [CypressService],
  exports: [CypressService],
})
export class CypressModule {}