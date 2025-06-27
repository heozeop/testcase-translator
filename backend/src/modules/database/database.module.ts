import { Module, Global } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from '../../mikro-orm.config';
import * as entities from '../../entities';

@Global()
@Module({
  imports: [
    MikroOrmModule.forRoot({
      ...mikroOrmConfig,
      autoLoadEntities: true,
    }),
    MikroOrmModule.forFeature([
      entities.Project,
      entities.TestCase,
      entities.GeneratedCode,
      entities.GeneratedCodeFile,
      entities.ExplorationSession,
      entities.ExplorationResult,
      entities.ExecutionResult,
    ]),
  ],
  exports: [MikroOrmModule],
})
export class DatabaseModule {}