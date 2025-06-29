import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

// Modules
import { ProjectsModule } from './modules/projects/projects.module';
// import { TestCasesModule } from './modules/testcases/testcases.module';
// import { CypressModule } from './modules/cypress/cypress.module';
import { StatusModule } from './modules/status/status.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { DatabaseModule } from './modules/database/database.module';

// Global filters and interceptors
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Core modules
    DatabaseModule,
    
    // Feature modules
    StatusModule,
    WebsocketModule,
    ProjectsModule,
    // TestCasesModule,  // TODO: Fix MikroORM dependencies
    // CypressModule,    // TODO: Fix MikroORM dependencies
  ],
  providers: [
    // Global validation pipe
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    
    // Global interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}