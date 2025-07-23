import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FileStorageService {
  private readonly storageDir = path.join(process.cwd(), 'storage');
  private readonly generatedCodeDir = path.join(this.storageDir, 'generated-code');

  constructor() {
    this.ensureDirectories();
  }

  private async ensureDirectories() {
    try {
      await fs.access(this.storageDir);
    } catch {
      await fs.mkdir(this.storageDir, { recursive: true });
    }

    try {
      await fs.access(this.generatedCodeDir);
    } catch {
      await fs.mkdir(this.generatedCodeDir, { recursive: true });
    }
  }

  async saveGeneratedCodeFile(
    projectId: string,
    fileName: string,
    content: string,
    generationId?: string
  ): Promise<string> {
    try {
      console.log('🗃️ FileStorageService.saveGeneratedCodeFile called:', {
        projectId,
        fileName,
        contentLength: content.length,
        generationId
      });

      await this.ensureDirectories();
      
      const projectDir = path.join(this.generatedCodeDir, projectId);
      console.log('📁 Project directory:', projectDir);
      
      // Create project directory if it doesn't exist
      try {
        await fs.access(projectDir);
        console.log('✅ Project directory exists');
      } catch {
        console.log('📁 Creating project directory...');
        await fs.mkdir(projectDir, { recursive: true });
      }

      // Create generation directory if generationId is provided
      let targetDir = projectDir;
      if (generationId) {
        targetDir = path.join(projectDir, generationId);
        console.log('📁 Target directory:', targetDir);
        try {
          await fs.access(targetDir);
          console.log('✅ Target directory exists');
        } catch {
          console.log('📁 Creating target directory...');
          await fs.mkdir(targetDir, { recursive: true });
        }
      }

      const filePath = path.join(targetDir, fileName);
      console.log('📄 Full file path:', filePath);
      
      // Ensure parent directories exist for nested file paths (e.g., support/e2e.js)
      const fileDir = path.dirname(filePath);
      if (fileDir !== targetDir) {
        console.log('📁 Creating nested directory:', fileDir);
        try {
          await fs.access(fileDir);
          console.log('✅ Nested directory exists');
        } catch {
          console.log('📁 Creating nested directory...');
          await fs.mkdir(fileDir, { recursive: true });
        }
      }
      
      // Save file content
      console.log('💾 Writing file content...');
      await fs.writeFile(filePath, content, 'utf-8');
      console.log('✅ File written successfully');
      
      // Return relative path from storage root for database storage
      const relativePath = path.relative(this.storageDir, filePath);
      console.log('📄 Relative path:', relativePath);
      
      return relativePath;
    } catch (error) {
      console.error('❌ Error in saveGeneratedCodeFile:', error);
      throw error;
    }
  }

  async readGeneratedCodeFile(relativePath: string): Promise<string> {
    const fullPath = path.join(this.storageDir, relativePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async deleteGeneratedCodeFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.storageDir, relativePath);
    await fs.unlink(fullPath);
  }

  async deleteProjectGeneratedCode(projectId: string): Promise<void> {
    const projectDir = path.join(this.generatedCodeDir, projectId);
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to delete generated code directory for project ${projectId}:`, error);
    }
  }

  getFullPath(relativePath: string): string {
    return path.join(this.storageDir, relativePath);
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  getGeneratedCodeDir(): string {
    return this.generatedCodeDir;
  }
}