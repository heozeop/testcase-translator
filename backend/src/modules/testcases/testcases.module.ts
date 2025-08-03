import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { TestCasesController } from './testcases.controller';
import { TestCasesService } from './testcases.service';
import { TestCase } from '../../models/TestCase.entity';
import { Project } from '../../models/Project.entity';

@Module({
  imports: [MikroOrmModule.forFeature([TestCase, Project])],
  controllers: [TestCasesController],
  providers: [TestCasesService],
  exports: [TestCasesService],
})
export class TestCasesModule {}