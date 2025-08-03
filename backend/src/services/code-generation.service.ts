import { Injectable, NotFoundException } from '@nestjs/common';
import { GeneratedCode } from '../models/GeneratedCode.entity';
import { GeneratedCodeFile } from '../models/GeneratedCodeFile.entity';
import { Project } from '../models/Project.entity';
import { ProjectRepository, GeneratedCodeRepository } from '../repositories';
import { AICypressService } from './ai-cypress.service';
import { FileStorageService } from './file-storage.service';

export interface CodeGenerationResult {
  message: string;
  projectId: string;
  projectName: string;
  projectUrl: string;
  testCasesCount: number;
  filesGenerated: number;
  files: Array<{
    fileName: string;
    content: string;
    type: string;
    filePath: string;
    fileSize: number;
  }>;
  generationId: string;
  createdAt: string;
  aiGenerated: boolean;
}

@Injectable()
export class CodeGenerationService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly generatedCodeRepository: GeneratedCodeRepository,
    private readonly aiCypressService: AICypressService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  async generateCypressCode(projectId: string): Promise<CodeGenerationResult> {
    const project = await this.projectRepository.findWithTestCases(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    try {
      // Get test cases for the project
      const testCases = project.testCases || [];

      if (testCases.length === 0) {
        throw new Error('No test cases found for this project');
      }

      const testCasesArray = Array.isArray(testCases) ? testCases : Array.from(testCases);

      console.log('🤖 Using AI to generate intelligent Cypress code for project:', project.name);
      console.log('📊 Test cases to process:', testCasesArray.length);

      // Prepare context for AI generation
      const context = this.prepareAIContext(project, testCasesArray);

      // Generate code using AI
      const generatedCode = await this.aiCypressService.generateIntelligentCypressCode(context);

      console.log('✅ AI generation completed successfully');

      // Create generation record and save files
      const result = await this.saveGeneratedCode(project, generatedCode, testCasesArray.length);

      return result;
    } catch (error) {
      console.error('Error generating Cypress code:', error);
      throw new Error(`Failed to generate Cypress tests: ${(error as Error).message}`);
    }
  }

  async updateGeneratedCodeFiles(
    projectId: string,
    generationId: string,
    updatedFiles: Array<{
      fileName: string;
      content: string;
      type: 'test' | 'config' | 'support';
    }>,
  ) {
    try {
      console.log('🔄 Updating generated code files:', {
        projectId,
        generationId,
        fileCount: updatedFiles.length,
      });

      // Verify the generated code exists
      const generatedCode = await this.generatedCodeRepository.findWithFiles(generationId);

      if (!generatedCode) {
        throw new NotFoundException('Generated code not found');
      }

      console.log('📄 Found generated code with existing files:', generatedCode.files?.length || 0);

      const updatedFileRecords = [];

      // Update each file
      for (const fileUpdate of updatedFiles) {
        console.log(`🔄 Processing file update: ${fileUpdate.fileName}`);

        // Find the existing file record
        const existingFiles = generatedCode.files?.getItems() || [];
        const existingFile = existingFiles.find(f => f.fileName === fileUpdate.fileName);

        if (!existingFile) {
          console.warn(`⚠️ File not found in generation: ${fileUpdate.fileName}`);
          continue;
        }

        // Update file content in storage
        console.log('💾 Updating file in storage...');
        await this.fileStorageService.updateGeneratedCodeFile(
          projectId,
          fileUpdate.fileName,
          fileUpdate.content,
          generationId,
        );

        // Update database record metadata only (no content stored in DB)
        existingFile.fileSize = fileUpdate.content.length;

        console.log(`✅ Updated file: ${fileUpdate.fileName}`);
        updatedFileRecords.push({
          fileName: fileUpdate.fileName,
          type: fileUpdate.type,
          filePath: existingFile.filePath,
          fileSize: existingFile.fileSize,
        });
      }

      console.log('✅ All files updated successfully');

      return {
        success: true,
        data: {
          message: `Updated ${updatedFileRecords.length} files successfully`,
          generationId,
          updatedFiles: updatedFileRecords,
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ Error updating generated code files:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to update generated code files: ${(error as Error).message}`);
    }
  }

  private prepareAIContext(project: Project, testCases: any[]) {
    return {
      project: {
        id: project.id,
        name: project.name,
        targetUrl: project.targetUrl,
        description: project.description || '',
      },
      testCases: testCases.map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        description: tc.description || '',
        steps: tc.steps || [],
        expectedResults: tc.expectedResults || [],
        priority: tc.priority || 'medium',
        category: tc.category || '',
      })),
      config: {
        baseUrl: project.targetUrl,
        viewport: { width: 1280, height: 720 },
        testTimeout: 30000,
        pageLoadTimeout: 10000,
      },
    };
  }

  private async saveGeneratedCode(
    project: Project,
    generatedCode: any,
    testCasesCount: number,
  ): Promise<CodeGenerationResult> {
    // Create generation record
    const generatedCodeEntity = new GeneratedCode(project, '');
    const generationId = generatedCodeEntity.id;
    const outputPath = `generated-code/${project.id}/${generationId}`;

    // Update the output path and session ID
    generatedCodeEntity.outputPath = outputPath;
    generatedCodeEntity.sessionId = generationId;
    generatedCodeEntity.baseUrl = project.targetUrl;
    generatedCodeEntity.status = 'completed';
    generatedCodeEntity.suiteName = project.name;
    generatedCodeEntity.description = `AI-generated Cypress tests for ${project.name}`;

    // Prepare files to save
    const files = [
      {
        fileName: `${project.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.cy.js`,
        content: generatedCode.testFile,
        type: 'test',
      },
      {
        fileName: 'cypress.config.js',
        content: generatedCode.configFile,
        type: 'config',
      },
      {
        fileName: 'support/e2e.js',
        content: generatedCode.supportFile,
        type: 'support',
      },
    ];

    const savedFiles = [];

    for (const file of files) {
      console.log(`🔄 Processing file: ${file.fileName} (${file.content.length} chars)`);

      // Clean up markdown code blocks from generated content
      const cleanContent = this.cleanMarkdownCodeBlocks(file.content);
      console.log(`🧹 Cleaned content: ${cleanContent.length} chars (was ${file.content.length})`);

      // Save file to storage
      console.log('📞 Calling fileStorageService.saveGeneratedCodeFile...');
      const relativePath = await this.fileStorageService.saveGeneratedCodeFile(
        project.id,
        file.fileName,
        cleanContent,
        generationId,
      );
      console.log(`✅ File saved to storage: ${relativePath}`);

      // Create database record
      console.log('💾 Creating database record for file...');
      const fileEntity = new GeneratedCodeFile(
        generatedCodeEntity,
        file.type,
        file.fileName,
        relativePath,
        cleanContent.length,
      );

      generatedCodeEntity.files.add(fileEntity);
      console.log(`✅ File entity added to generation: ${file.fileName}`);

      savedFiles.push({
        fileName: file.fileName,
        content: cleanContent,
        type: file.type,
        filePath: relativePath,
        fileSize: cleanContent.length,
      });
    }

    // Save to database
    await this.generatedCodeRepository.create(generatedCodeEntity as any);

    console.log('💾 Files saved to storage and database records created');

    return {
      message: 'AI-powered Cypress tests generated successfully',
      projectId: project.id,
      projectName: project.name,
      projectUrl: project.targetUrl,
      testCasesCount,
      filesGenerated: savedFiles.length,
      files: savedFiles,
      generationId,
      createdAt: new Date().toISOString(),
      aiGenerated: true,
    };
  }

  /**
   * Clean up markdown code blocks from generated content
   * Removes ```javascript and ``` markers that AI sometimes includes
   */
  private cleanMarkdownCodeBlocks(content: string): string {
    if (!content) return content;

    let cleanContent = content;

    // Remove ```javascript blocks
    if (cleanContent.includes('```javascript')) {
      cleanContent = cleanContent.replace(/```javascript\n?/g, '').replace(/```\n?/g, '');
    }

    // Remove any remaining ``` blocks
    if (cleanContent.includes('```')) {
      cleanContent = cleanContent.replace(/```[\s\S]*?\n/g, '').replace(/```/g, '');
    }

    // Trim any extra whitespace
    cleanContent = cleanContent.trim();

    return cleanContent;
  }
}
