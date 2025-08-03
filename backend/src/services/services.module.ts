import { Module } from '@nestjs/common';
import { RepositoryModule } from '../repositories/repository.module';

// New clean architecture services
import { ProjectManagementService } from './project-management.service';
import { UrlValidationService } from './url-validation.service';
import { TestCaseUploadService } from './testcase-upload.service';
import { CodeGenerationService } from './code-generation.service';

// Core services
import { AICypressService } from './ai-cypress.service';
import { CypressExecutorService } from './cypress-executor.service';
import { FileStorageService } from './file-storage.service';

@Module({
  imports: [RepositoryModule],
  providers: [
    // New clean architecture services
    ProjectManagementService,
    UrlValidationService,
    TestCaseUploadService,
    CodeGenerationService,
    
    // Core services
    AICypressService,
    CypressExecutorService,
    FileStorageService,
  ],
  exports: [
    // New clean architecture services
    ProjectManagementService,
    UrlValidationService,
    TestCaseUploadService,
    CodeGenerationService,
    
    // Core services
    AICypressService,
    CypressExecutorService,
    FileStorageService,
  ],
})
export class ServicesModule {}