import * as fs from 'fs/promises';
import * as path from 'path';
import { CypressTemplateContext } from './CypressTemplateEngine';
import { GeneratedCypressFiles } from './CypressSyntaxGenerator';

export interface FileOrganizationOptions {
  baseDirectory: string;
  projectSubdirectory?: string;
  createTimestampedFolders: boolean;
  overwriteExisting: boolean;
  createProjectStructure: boolean;
  generateReadme: boolean;
  compressOldVersions: boolean;
  maxVersionsToKeep: number;
}

export interface OrganizedProject {
  rootPath: string;
  projectPath: string;
  cypressPath: string;
  testPath: string;
  fixturePath: string;
  supportPath: string;
  timestamp: string;
  manifest: ProjectManifest;
}

export interface ProjectManifest {
  projectName: string;
  generatedAt: string;
  version: string;
  testCaseCount: number;
  fixtureCount: number;
  customCommandCount: number;
  baseUrl: string;
  testFiles: string[];
  fixtureFiles: string[];
  supportFiles: string[];
  metadata: {
    originalContext: CypressTemplateContext;
    generationOptions: any;
  };
}

export class CypressFileOrganizer {
  private options: FileOrganizationOptions;

  constructor(options: Partial<FileOrganizationOptions> = {}) {
    this.options = {
      baseDirectory: './generated-tests',
      createTimestampedFolders: true,
      overwriteExisting: false,
      createProjectStructure: true,
      generateReadme: true,
      compressOldVersions: false,
      maxVersionsToKeep: 5,
      ...options
    };
  }

  async organizeFiles(
    files: GeneratedCypressFiles,
    context: CypressTemplateContext
  ): Promise<OrganizedProject> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = this.sanitizeProjectName(context.projectName);
    
    // Create directory structure
    const project = await this.createProjectStructure(projectName, timestamp);
    
    // Write all files
    await this.writeTestFiles(files.testFiles, project.testPath);
    await this.writeFixtureFiles(files.fixtureFiles, project.fixturePath);
    await this.writeSupportFiles(files.supportFiles, project.supportPath);
    
    // Write configuration files
    await this.writeConfigFile(files.configFile, project.cypressPath);
    
    if (files.packageJson) {
      await this.writePackageJson(files.packageJson, project.projectPath);
    }

    // Generate project manifest
    const manifest = this.createProjectManifest(files, context, project);
    await this.writeManifest(manifest, project.projectPath);

    // Generate README
    if (this.options.generateReadme) {
      await this.generateReadme(project, manifest);
    }

    // Cleanup old versions if needed
    if (this.options.compressOldVersions) {
      await this.cleanupOldVersions(projectName);
    }

    console.log(`Generated Cypress project at: ${project.projectPath}`);
    return project;
  }

  private async createProjectStructure(projectName: string, timestamp: string): Promise<OrganizedProject> {
    const baseDir = path.resolve(this.options.baseDirectory);
    
    let projectPath: string;
    if (this.options.createTimestampedFolders) {
      projectPath = path.join(baseDir, `${projectName}-${timestamp}`);
    } else {
      projectPath = path.join(baseDir, projectName);
      
      // Handle existing directory
      if (!this.options.overwriteExisting) {
        let counter = 1;
        let originalPath = projectPath;
        while (await this.directoryExists(projectPath)) {
          projectPath = `${originalPath}-${counter}`;
          counter++;
        }
      }
    }

    const cypressPath = path.join(projectPath, 'cypress');
    const testPath = path.join(cypressPath, 'e2e');
    const fixturePath = path.join(cypressPath, 'fixtures');
    const supportPath = path.join(cypressPath, 'support');

    // Create directories
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(cypressPath, { recursive: true });
    await fs.mkdir(testPath, { recursive: true });
    await fs.mkdir(fixturePath, { recursive: true });
    await fs.mkdir(supportPath, { recursive: true });

    return {
      rootPath: baseDir,
      projectPath,
      cypressPath,
      testPath,
      fixturePath,
      supportPath,
      timestamp,
      manifest: {} as ProjectManifest // Will be filled later
    };
  }

  private async writeTestFiles(testFiles: Map<string, string>, testPath: string): Promise<void> {
    for (const [fileName, content] of testFiles) {
      const filePath = path.join(testPath, fileName);
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`Generated test file: ${fileName}`);
    }
  }

  private async writeFixtureFiles(fixtureFiles: Map<string, string>, fixturePath: string): Promise<void> {
    for (const [fileName, content] of fixtureFiles) {
      const filePath = path.join(fixturePath, fileName);
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`Generated fixture file: ${fileName}`);
    }
  }

  private async writeSupportFiles(supportFiles: Map<string, string>, supportPath: string): Promise<void> {
    for (const [fileName, content] of supportFiles) {
      const filePath = path.join(supportPath, fileName);
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`Generated support file: ${fileName}`);
    }
  }

  private async writeConfigFile(configContent: string, cypressPath: string): Promise<void> {
    const configPath = path.join(cypressPath, '..', 'cypress.config.js');
    await fs.writeFile(configPath, configContent, 'utf8');
    console.log('Generated cypress.config.js');
  }

  private async writePackageJson(packageContent: string, projectPath: string): Promise<void> {
    const packagePath = path.join(projectPath, 'package.json');
    await fs.writeFile(packagePath, packageContent, 'utf8');
    console.log('Generated package.json');
  }

  private createProjectManifest(
    files: GeneratedCypressFiles,
    context: CypressTemplateContext,
    project: OrganizedProject
  ): ProjectManifest {
    return {
      projectName: context.projectName,
      generatedAt: new Date().toISOString(),
      version: context.metadata.version,
      testCaseCount: files.testFiles.size,
      fixtureCount: files.fixtureFiles.size,
      customCommandCount: files.supportFiles.size,
      baseUrl: context.baseUrl,
      testFiles: Array.from(files.testFiles.keys()),
      fixtureFiles: Array.from(files.fixtureFiles.keys()),
      supportFiles: Array.from(files.supportFiles.keys()),
      metadata: {
        originalContext: context,
        generationOptions: this.options
      }
    };
  }

  private async writeManifest(manifest: ProjectManifest, projectPath: string): Promise<void> {
    const manifestPath = path.join(projectPath, 'manifest.json');
    const content = JSON.stringify(manifest, null, 2);
    await fs.writeFile(manifestPath, content, 'utf8');
  }

  private async generateReadme(project: OrganizedProject, manifest: ProjectManifest): Promise<void> {
    const readmeContent = this.generateReadmeContent(manifest);
    const readmePath = path.join(project.projectPath, 'README.md');
    await fs.writeFile(readmePath, readmeContent, 'utf8');
    console.log('Generated README.md');
  }

  private generateReadmeContent(manifest: ProjectManifest): string {
    const lines = [
      `# ${manifest.projectName} - Cypress Tests`,
      '',
      `Generated on: ${new Date(manifest.generatedAt).toLocaleString()}`,
      `Base URL: ${manifest.baseUrl}`,
      '',
      '## Overview',
      '',
      `This project contains automatically generated Cypress end-to-end tests for **${manifest.projectName}**.`,
      'The tests were generated from exploration results and user input collection.',
      '',
      '## Project Structure',
      '',
      '```',
      '├── cypress/',
      '│   ├── e2e/           # Test files',
      '│   ├── fixtures/      # Test data',
      '│   └── support/       # Custom commands and utilities',
      '├── cypress.config.js  # Cypress configuration',
      '├── package.json       # NPM dependencies and scripts',
      '├── manifest.json      # Generation metadata',
      '└── README.md          # This file',
      '```',
      '',
      '## Test Files',
      '',
      'The following test files have been generated:',
      ''
    ];

    for (let i = 0; i < manifest.testFiles.length; i++) {
      const testFile = manifest.testFiles[i];
      lines.push(`${i + 1}. \`${testFile}\``);
    }

    lines.push(
      '',
      '## Fixtures',
      '',
      'Test data is stored in the following fixture files:',
      ''
    );

    for (const fixtureFile of manifest.fixtureFiles) {
      lines.push(`- \`${fixtureFile}\``);
    }

    lines.push(
      '',
      '## Getting Started',
      '',
      '### Prerequisites',
      '',
      '- Node.js (version 14 or higher)',
      '- npm or yarn',
      '',
      '### Installation',
      '',
      '1. Install dependencies:',
      '   ```bash',
      '   npm install',
      '   ```',
      '',
      '2. Verify Cypress installation:',
      '   ```bash',
      '   npx cypress verify',
      '   ```',
      '',
      '### Running Tests',
      '',
      '#### Interactive Mode (Cypress GUI)',
      '```bash',
      'npm run cypress:open',
      '# or',
      'npx cypress open',
      '```',
      '',
      '#### Headless Mode',
      '```bash',
      'npm run cypress:run',
      '# or',
      'npx cypress run',
      '```',
      '',
      '#### Specific Browser',
      '```bash',
      'npm run cypress:run:chrome',
      'npm run cypress:run:firefox',
      '```',
      '',
      '### Available Scripts',
      '',
      '- `npm test` - Run all tests in headless mode',
      '- `npm run test:headed` - Run tests with browser visible',
      '- `npm run test:gui` - Open Cypress GUI',
      '- `npm run cypress:open` - Open Cypress interactive mode',
      '- `npm run cypress:run` - Run tests in headless mode',
      '',
      '## Test Configuration',
      '',
      `- **Base URL**: ${manifest.baseUrl}`,
      '- **Viewport**: 1280x720',
      '- **Command Timeout**: 10 seconds',
      '- **Page Load Timeout**: 30 seconds',
      '- **Screenshots**: Enabled on failure',
      '- **Videos**: Enabled',
      '',
      '## Custom Commands',
      '',
      'The following custom commands are available:',
      '',
      '- `cy.waitForPageLoad()` - Wait for page to fully load',
      '- `cy.fillFormWithFixture(fixtureName)` - Fill form using fixture data',
      '- `cy.screenshotWithContext(name)` - Take contextual screenshot',
      '',
      '## Fixtures',
      '',
      'Test data is organized in fixture files:',
      ''
    );

    for (const fixtureFile of manifest.fixtureFiles) {
      lines.push(`- **${fixtureFile}**: Contains test data for form inputs and navigation`);
    }

    lines.push(
      '',
      '## Troubleshooting',
      '',
      '### Common Issues',
      '',
      '1. **Cypress fails to start**',
      '   - Ensure Node.js version is 14 or higher',
      '   - Clear npm cache: `npm cache clean --force`',
      '   - Reinstall dependencies: `rm -rf node_modules package-lock.json && npm install`',
      '',
      '2. **Tests fail due to timeouts**',
      '   - Check if the base URL is accessible',
      '   - Increase timeout values in cypress.config.js',
      '   - Check network connectivity',
      '',
      '3. **Element selectors not working**',
      '   - Verify elements exist on the page',
      '   - Check if page structure has changed',
      '   - Update selectors in test files',
      '',
      '### Updating Tests',
      '',
      'These tests were automatically generated. To update them:',
      '',
      '1. Modify the source exploration data',
      '2. Re-run the test generation process',
      '3. Review and merge changes',
      '',
      '### Support',
      '',
      'For issues with the generated tests, check the manifest.json file for generation details and context.',
      '',
      '---',
      '',
      `*Generated by Testcase Translator on ${new Date(manifest.generatedAt).toLocaleString()}*`
    );

    return lines.join('\n');
  }

  private sanitizeProjectName(projectName: string): string {
    return projectName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private async cleanupOldVersions(projectName: string): Promise<void> {
    try {
      const baseDir = path.resolve(this.options.baseDirectory);
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      
      const projectDirs = entries
        .filter(entry => entry.isDirectory() && entry.name.startsWith(projectName))
        .map(entry => ({
          name: entry.name,
          path: path.join(baseDir, entry.name)
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name (newest first)

      if (projectDirs.length > this.options.maxVersionsToKeep) {
        const dirsToRemove = projectDirs.slice(this.options.maxVersionsToKeep);
        
        for (const dir of dirsToRemove) {
          await fs.rm(dir.path, { recursive: true, force: true });
          console.log(`Removed old version: ${dir.name}`);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old versions:', error);
    }
  }

  // Public utility methods
  async listGeneratedProjects(): Promise<OrganizedProject[]> {
    const projects: OrganizedProject[] = [];
    const baseDir = path.resolve(this.options.baseDirectory);

    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(baseDir, entry.name);
          const manifestPath = path.join(projectPath, 'manifest.json');
          
          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent) as ProjectManifest;
            
            projects.push({
              rootPath: baseDir,
              projectPath,
              cypressPath: path.join(projectPath, 'cypress'),
              testPath: path.join(projectPath, 'cypress', 'e2e'),
              fixturePath: path.join(projectPath, 'cypress', 'fixtures'),
              supportPath: path.join(projectPath, 'cypress', 'support'),
              timestamp: entry.name.split('-').pop() || '',
              manifest
            });
          } catch {
            // Skip directories without manifest
            continue;
          }
        }
      }

      return projects.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch {
      return [];
    }
  }

  async getProjectManifest(projectPath: string): Promise<ProjectManifest | null> {
    try {
      const manifestPath = path.join(projectPath, 'manifest.json');
      const content = await fs.readFile(manifestPath, 'utf8');
      return JSON.parse(content) as ProjectManifest;
    } catch {
      return null;
    }
  }

  async archiveProject(projectPath: string): Promise<string> {
    // In a real implementation, create a zip archive
    const archiveName = `${path.basename(projectPath)}.tar.gz`;
    const archivePath = path.join(path.dirname(projectPath), archiveName);
    
    // Placeholder - in production, use archiving library
    console.log(`Would archive ${projectPath} to ${archivePath}`);
    
    return archivePath;
  }

  async validateProjectStructure(projectPath: string): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    // Check required files and directories
    const requiredPaths = [
      'cypress',
      'cypress/e2e',
      'cypress/fixtures',
      'cypress/support',
      'cypress.config.js',
      'package.json',
      'manifest.json'
    ];

    for (const requiredPath of requiredPaths) {
      const fullPath = path.join(projectPath, requiredPath);
      try {
        await fs.access(fullPath);
      } catch {
        issues.push(`Missing required file/directory: ${requiredPath}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}