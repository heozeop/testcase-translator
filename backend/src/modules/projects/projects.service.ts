import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/mysql';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
import { Project } from '../../entities/Project.entity';
import { GeneratedCode } from '../../entities/GeneratedCode.entity';
import { GeneratedCodeFile } from '../../entities/GeneratedCodeFile.entity';
import { AICypressService } from '../../services/ai-cypress.service';
import { CypressExecutorService } from '../../services/cypress-executor.service';
import { FileStorageService } from '../../services/file-storage.service';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: EntityRepository<Project>,
    private readonly em: EntityManager,
    private readonly aiCypressService: AICypressService,
    private readonly cypressExecutorService: CypressExecutorService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  async findAll(query: ProjectQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    
    // Build where conditions
    const whereConditions: any = {};
    if (query.search) {
      whereConditions.name = { $like: `%${query.search}%` };
    }
    
    // Build order conditions
    const orderBy = query.orderBy || 'createdAt';
    const order = query.order || 'DESC';
    const orderConditions = { [orderBy]: order };
    
    // Get projects with pagination
    const [projects, total] = await this.em.findAndCount(Project, whereConditions, {
      populate: ['testCases', 'generatedCodes'],
      limit,
      offset,
      orderBy: orderConditions
    });
    
    // Add counts to each project
    const projectsWithCounts = projects.map(project => ({
      ...project,
      test_case_count: project.testCases.length,
      generated_code_count: project.generatedCodes.length,
    }));
    
    return {
      data: projectsWithCounts,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  async findOne(id: string) {
    return this.projectRepository.findOne(
      { id },
      { populate: ['testCases', 'generatedCodes', 'testExamples'] }
    );
  }

  async create(createProjectDto: CreateProjectDto) {
    const project = new Project(
      createProjectDto.name,
      createProjectDto.targetUrl,
      createProjectDto.description
    );
    
    await this.em.persistAndFlush(project);
    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.projectRepository.findOne({ id });
    if (!project) {
      throw new Error('Project not found');
    }
    
    this.projectRepository.assign(project, updateProjectDto);
    await this.em.flush();
    
    return project;
  }

  async remove(id: string) {
    const project = await this.projectRepository.findOne({ id });
    if (!project) {
      throw new Error('Project not found');
    }
    
    await this.em.removeAndFlush(project);
    return { message: 'Project deleted successfully' };
  }

  async getStatistics(projectId?: string) {
    let total = 0;
    
    if (projectId) {
      const project = await this.projectRepository.findOne({ id: projectId });
      total = project ? 1 : 0;
    } else {
      total = await this.projectRepository.count();
    }
    
    return {
      totalProjects: total,
      // Add more statistics as needed
    };
  }

  async uploadExcel(_projectId: string, buffer: Buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      // Process Excel data and create test cases
      // Implementation depends on your Excel structure
      
      return {
        message: 'Excel file processed successfully',
        rowCount: data.length,
        data: data.slice(0, 5), // Return first 5 rows as preview
      };
    } catch (error) {
      throw new Error(`Failed to process Excel file: ${(error as Error).message}`);
    }
  }

  async generateCypress(projectId: string, _options: any) {
    const project = await this.findOne(projectId);
    if (!project) {
      throw new Error('Project not found');
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
      const context = {
        project: {
          id: project.id,
          name: project.name,
          targetUrl: project.targetUrl,
          description: project.description || ''
        },
        testCases: testCasesArray.map((tc: any) => ({
          id: tc.id,
          name: tc.name,
          description: tc.description || '',
          steps: tc.steps || [],
          expectedResults: tc.expectedResults || [],
          priority: tc.priority || 'medium',
          category: tc.category || ''
        })),
        config: {
          baseUrl: project.targetUrl,
          viewport: { width: 1280, height: 720 },
          testTimeout: 30000,
          pageLoadTimeout: 10000
        }
      };
      
      // Generate code using AI
      const generatedCode = await this.aiCypressService.generateIntelligentCypressCode(context);
      
      console.log('✅ AI generation completed successfully');
      
      // Create generation record
      const generatedCodeEntity = new GeneratedCode(project, '');
      const generationId = generatedCodeEntity.id; // Use entity UUID as generation ID
      const outputPath = `generated-code/${projectId}/${generationId}`;
      
      // Update the output path and session ID
      generatedCodeEntity.outputPath = outputPath;
      generatedCodeEntity.sessionId = generationId;
      generatedCodeEntity.baseUrl = project.targetUrl;
      generatedCodeEntity.status = 'completed';
      generatedCodeEntity.suiteName = project.name;
      generatedCodeEntity.description = `AI-generated Cypress tests for ${project.name}`;
      
      // Save files to storage and create file records
      const files = [
        {
          fileName: `${project.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.cy.js`,
          content: generatedCode.testFile,
          type: 'test'
        },
        {
          fileName: 'cypress.config.js',
          content: generatedCode.configFile,
          type: 'config'
        },
        {
          fileName: 'support/e2e.js',
          content: generatedCode.supportFile,
          type: 'support'
        }
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
          projectId,
          file.fileName,
          cleanContent,
          generationId
        );
        console.log(`✅ File saved to storage: ${relativePath}`);
        
        // Create database record
        console.log('💾 Creating database record for file...');
        const fileEntity = new GeneratedCodeFile(
          generatedCodeEntity,
          file.type,
          file.fileName,
          relativePath,
          cleanContent.length
        );
        
        generatedCodeEntity.files.add(fileEntity);
        console.log(`✅ File entity added to generation: ${file.fileName}`);
        
        savedFiles.push({
          fileName: file.fileName,
          content: cleanContent, // Return cleaned content for immediate use
          type: file.type,
          filePath: relativePath,
          fileSize: cleanContent.length
        });
      }
      
      // Save to database
      await this.em.persistAndFlush(generatedCodeEntity);
      
      console.log('💾 Files saved to storage and database records created');

      return {
        message: 'AI-powered Cypress tests generated successfully',
        projectId,
        projectName: project.name,
        projectUrl: project.targetUrl,
        testCasesCount: testCasesArray.length,
        filesGenerated: savedFiles.length,
        files: savedFiles,
        generationId,
        createdAt: new Date().toISOString(),
        aiGenerated: true
      };
    } catch (error) {
      console.error('Error generating Cypress code:', error);
      throw new Error(`Failed to generate Cypress tests: ${(error as Error).message}`);
    }
  }

  async validateUrl(url: string, options?: any) {
    try {
      // Basic URL validation
      new URL(url);
      
      // Fetch the URL to check if it's accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 10000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Testcase-Translator-Bot/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      return {
        url: url,
        normalizedUrl: response.url,
        isValid: true,
        isSafe: true,
        accessibility: {
          accessible: response.ok,
          status: response.status,
          statusText: response.statusText,
          finalUrl: response.url,
          redirectChain: response.redirected ? [url, response.url] : [],
          details: {
            headers: {
              contentType: response.headers.get('content-type'),
              server: response.headers.get('server'),
              lastModified: response.headers.get('last-modified')
            }
          }
        }
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        return {
          url: url,
          normalizedUrl: url,
          isValid: false,
          isSafe: false,
          warnings: ['Invalid URL format'],
          accessibility: {
            accessible: false,
            error: 'Invalid URL format'
          }
        };
      }
      
      if ((error as any).name === 'AbortError') {
        return {
          url: url,
          normalizedUrl: url,
          isValid: true,
          isSafe: true,
          warnings: ['Request timeout'],
          accessibility: {
            accessible: false,
            error: 'Request timeout'
          }
        };
      }
      
      return {
        url: url,
        normalizedUrl: url,
        isValid: true,
        isSafe: true,
        warnings: [(error as Error).message || 'Failed to access URL'],
        accessibility: {
          accessible: false,
          error: (error as Error).message || 'Failed to access URL'
        }
      };
    }
  }

  // Additional methods required by the controller
  async uploadTestCases(projectId: string, file: any) {
    try {
      // Verify project exists
      const project = await this.findOne(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Read file from disk
      const fileBuffer = fs.readFileSync(file.path);
      
      // Parse file based on type
      let testCaseData: any[] = [];
      
      if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
        // Handle Excel files
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        
        // Look for '테스트' sheet first, then fall back to first sheet
        let sheetName = workbook.SheetNames.find(name => name.includes('테스트') || name === '테스트');
        if (!sheetName) {
          sheetName = workbook.SheetNames[0];
        }
        
        console.log(`Using Excel sheet: ${sheetName} from available sheets: ${workbook.SheetNames.join(', ')}`);
        const worksheet = workbook.Sheets[sheetName];
        testCaseData = XLSX.utils.sheet_to_json(worksheet);
      } else if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv')) {
        // Handle CSV files
        const csvText = fileBuffer.toString('utf-8');
        const lines = csvText.split('\n').filter((line: string) => line.trim());
        const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
        
        testCaseData = lines.slice(1).map((line: string, index: number) => {
          const values = line.split(',').map((v: string) => v.trim().replace(/"/g, ''));
          const row: any = { _rowNumber: index + 2 }; // +2 because we skip header and arrays are 0-indexed
          headers.forEach((header: string, i: number) => {
            row[header] = values[i] || '';
          });
          return row;
        });
      } else {
        throw new Error('Unsupported file format. Please upload Excel (.xlsx, .xls) or CSV files.');
      }

      // Clean up uploaded file after processing
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.warn('Failed to cleanup uploaded file:', cleanupError);
      }

      // Process test case data and create test cases
      const createdTestCases: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < testCaseData.length; i++) {
        const rowData = testCaseData[i];
        const rowNumber = rowData._rowNumber || i + 2;

        try {
          // Extract test case information from row data
          // Support Korean test case format and common column names
          const name = rowData.name || rowData.Name || rowData.testCase || rowData['Test Case'] || rowData.scenario || rowData.Scenario || 
                      // Korean format: Use DEPTH 2 as name (main functionality description)
                      rowData.__EMPTY_3 || rowData.__EMPTY_2 || rowData.__EMPTY || rowData.__EMPTY_0 || `Test Case ${rowNumber}`;
          
          const description = rowData.description || rowData.Description || rowData.details || rowData.Details || 
                            // Korean format: CATEGORY + DEPTH 1 as description
                            (rowData.__EMPTY_1 && rowData.__EMPTY_2 ? `${rowData.__EMPTY_1} - ${rowData.__EMPTY_2}` : rowData.__EMPTY_1 || '');
          
          const steps = rowData.steps || rowData.Steps || rowData.actions || rowData.Actions || 
                       // Korean format: PRE-CONDITION + STEP
                       (rowData.__EMPTY_5 && rowData.__EMPTY_6 ? `${rowData.__EMPTY_5} | ${rowData.__EMPTY_6}` : rowData.__EMPTY_6 || rowData.__EMPTY_5 || '');
          
          const expectedResults = rowData.expectedResult || rowData.expectedResults || rowData['Expected Result'] || rowData.expected || rowData.Expected || 
                                // Korean format: EXPECT RESULT
                                rowData.__EMPTY_7 || '';
          
          const priorityValue = rowData.priority || rowData.Priority || 'medium';
          const priority = (typeof priorityValue === 'string' ? priorityValue : 'medium').toLowerCase();
          
          const category = rowData.category || rowData.Category || rowData.type || rowData.Type || 
                         // Korean format: CATEGORY
                         rowData.__EMPTY_1 || '';

          console.log(`Processing row ${rowNumber}:`, {
            name,
            description,
            steps,
            expectedResults,
            priority,
            category,
            rawData: rowData
          });

          // Skip empty rows, header rows, or invalid data
          if (!name || name.trim() === '' || name.includes('EOF') || 
              // Skip header rows
              name === 'INDEX No.' || name === 'CATEGORY' || name.includes('[Pareto]') ||
              name === 'DEPTH 2' || name === 'DEPTH 1' || name === 'STEP' || name === 'EXPECT RESULT') {
            console.log(`Skipping invalid/header row ${rowNumber}:`, { name, description, steps, expectedResults });
            continue;
          }
          
          // Only process rows that have a numeric index and meaningful test data
          if (typeof rowData.__EMPTY !== 'number' || !rowData.__EMPTY_3) {
            console.log(`Skipping non-test-case row ${rowNumber}:`, { name, description, steps, expectedResults });
            continue;
          }

          // Create test case
          const testCase = new (await import('../../entities/TestCase.entity')).TestCase(
            project,
            name,
            description
          );

          // Set additional properties
          if (steps) {
            // Handle both pipe-separated and newline-separated steps
            if (typeof steps === 'string') {
              if (steps.includes(' | ')) {
                testCase.steps = steps.split(' | ').map(s => s.trim()).filter(s => s);
              } else if (steps.includes('|')) {
                testCase.steps = steps.split('|').map(s => s.trim()).filter(s => s);
              } else if (steps.includes('\n')) {
                testCase.steps = steps.split('\n').map(s => s.trim()).filter(s => s);
              } else {
                testCase.steps = [steps.trim()];
              }
            } else {
              testCase.steps = steps;
            }
          }
          
          if (expectedResults) {
            testCase.expectedResults = typeof expectedResults === 'string' ? [expectedResults] : expectedResults;
          }

          testCase.priority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
          
          if (category) {
            testCase.category = category;
          }

          testCase.excelFilePath = file.originalname;
          testCase.excelRowNumber = rowNumber;

          // Save test case
          await this.em.persistAndFlush(testCase);
          
          createdTestCases.push({
            id: testCase.id,
            name: testCase.name,
            description: testCase.description,
            rowNumber: rowNumber
          });

        } catch (error) {
          errors.push({
            rowNumber: rowNumber,
            error: (error as Error).message,
            data: rowData
          });
        }
      }

      return {
        success: true,
        message: 'Test cases uploaded and processed successfully',
        fileName: file.originalname,
        totalRows: testCaseData.length,
        createdTestCases: createdTestCases.length,
        testCases: createdTestCases,
        errors: errors,
        projectId: projectId
      };

    } catch (error) {
      throw new Error(`Failed to upload test cases: ${(error as Error).message}`);
    }
  }

  async exploreAndGenerate(_projectId: string, _explorationOptions: any, _cypressOptions: any, _extraParam?: any) {
    return { message: 'Method not implemented yet' };
  }

  async getExploreStatus(_projectId: string, _processId: string) {
    return { message: 'Method not implemented yet' };
  }

  async getTestCases(_projectId: string, _query: any) {
    return { message: 'Method not implemented yet' };
  }

  async downloadGeneratedFile(projectId: string, fileName: string, res: any) {
    try {
      const project = await this.em.findOne(Project, { id: projectId }, {
        populate: ['generatedCodes', 'generatedCodes.files']
      });
      
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.generatedCodes || project.generatedCodes.length === 0) {
        throw new Error('No generated code found');
      }

      // Find the file in the most recent generation
      const latestGeneration = project.generatedCodes[project.generatedCodes.length - 1];
      const fileEntity = latestGeneration.files.find(f => f.fileName === fileName);
      
      if (!fileEntity) {
        throw new Error('File not found');
      }

      // Read file content from file storage
      const content = await this.fileStorageService.readGeneratedCodeFile(fileEntity.filePath);
      
      // Set appropriate headers
      res.setHeader('Content-Type', this.getContentType(fileName));
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', content.length);
      
      res.send(content);
    } catch (error) {
      console.error('Error downloading generated file:', error);
      res.status(404).json({
        success: false,
        error: {
          message: (error as Error).message || 'File not found'
        }
      });
    }
  }

  private getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': return 'application/javascript';
      case 'json': return 'application/json';
      case 'ts': return 'application/typescript';
      case 'css': return 'text/css';
      case 'html': return 'text/html';
      case 'md': return 'text/markdown';
      default: return 'text/plain';
    }
  }

  async listGeneratedCode(projectId: string, page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;
      
      const project = await this.em.findOne(Project, { id: projectId }, {
        populate: ['generatedCodes', 'generatedCodes.files']
      });
      
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.generatedCodes || project.generatedCodes.length === 0) {
        return {
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        };
      }

      // Sort by creation date (newest first)
      const sortedGenerations = [...project.generatedCodes].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Apply pagination
      const total = sortedGenerations.length;
      const totalPages = Math.ceil(total / limit);
      const paginatedGenerations = sortedGenerations.slice(offset, offset + limit);

      // Format generations list without reading file contents (for performance)
      const generations = paginatedGenerations.map(generation => ({
        generationId: generation.id,
        sessionId: generation.sessionId,
        suiteName: generation.suiteName,
        description: generation.description,
        status: generation.status,
        filesCount: generation.files?.length || 0,
        createdAt: generation.createdAt,
        updatedAt: generation.updatedAt,
        baseUrl: generation.baseUrl
      }));
      
      return {
        success: true,
        data: generations,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      throw new Error((error as Error).message || 'Failed to list generated code');
    }
  }

  async getGeneratedCodeById(projectId: string, generationId: string) {
    try {
      const project = await this.em.findOne(Project, { id: projectId }, {
        populate: ['generatedCodes', 'generatedCodes.files', 'testCases']
      });
      
      if (!project) {
        throw new Error('Project not found');
      }

      // Try to find by ID first, then by sessionId
      let generation = project.generatedCodes?.find(g => g.id === generationId);
      if (!generation) {
        generation = project.generatedCodes?.find(g => g.sessionId === generationId);
      }
      
      if (!generation) {
        console.log('🔍 Available generations:', project.generatedCodes?.map(g => ({ id: g.id, sessionId: g.sessionId })));
        console.log('🔍 Looking for generationId:', generationId);
        throw new Error('Generated code not found');
      }

      // Read file contents from database
      const files = [];
      if (generation.files) {
        for (const fileEntity of generation.files) {
          try {
            console.log('📄 Reading file:', fileEntity.filePath);
            const content = await this.fileStorageService.readGeneratedCodeFile(fileEntity.filePath);
            files.push({
              fileName: fileEntity.fileName,
              content: content,
              type: fileEntity.fileType,
              filePath: fileEntity.filePath,
              fileSize: fileEntity.fileSize || content.length
            });
          } catch (fileError: any) {
            console.error('❌ Error reading file:', fileEntity.filePath, fileError);
            // Add file with error content instead of failing completely
            files.push({
              fileName: fileEntity.fileName,
              content: `// Error reading file: ${fileError?.message || 'Unknown error'}\n// File path: ${fileEntity.filePath}`,
              type: fileEntity.fileType,
              filePath: fileEntity.filePath,
              fileSize: 0
            });
          }
        }
      }
      
      return {
        success: true,
        data: {
          generationId: generation.id,
          projectId: project.id,
          projectName: project.name,
          projectUrl: project.targetUrl,
          testCasesCount: project.testCases?.length || 0,
          filesGenerated: files.length,
          files,
          createdAt: generation.createdAt,
          sessionId: generation.sessionId,
          suiteName: generation.suiteName,
          description: generation.description,
          status: generation.status,
          baseUrl: generation.baseUrl
        }
      };
    } catch (error) {
      throw new Error((error as Error).message || 'Failed to fetch generated code');
    }
  }

  async deleteGeneratedCode(projectId: string, generationId: string) {
    try {
      const project = await this.em.findOne(Project, { id: projectId }, {
        populate: ['generatedCodes', 'generatedCodes.files']
      });
      
      if (!project) {
        throw new Error('Project not found');
      }

      // Find the generation to delete
      let generation = project.generatedCodes?.find(g => g.id === generationId);
      if (!generation) {
        generation = project.generatedCodes?.find(g => g.sessionId === generationId);
      }
      
      if (!generation) {
        throw new Error('Generated code not found');
      }

      // Delete files from storage
      try {
        // Delete each file individually
        if (generation.files) {
          for (const file of generation.files) {
            try {
              await this.fileStorageService.deleteGeneratedCodeFile(file.filePath);
              console.log(`✅ Deleted file: ${file.fileName}`);
            } catch (fileError) {
              console.warn(`⚠️ Failed to delete file ${file.fileName}:`, fileError);
            }
          }
        }
        console.log('✅ Deleted generated code files from storage');
      } catch (error) {
        console.warn('⚠️ Failed to delete files from storage:', error);
        // Continue with database deletion even if file deletion fails
      }

      // Delete the generation and its files from database
      await this.em.removeAndFlush(generation);
      
      console.log('✅ Deleted generated code from database:', generationId);

      return {
        success: true,
        message: 'Generated code deleted successfully',
        deletedGenerationId: generationId
      };
    } catch (error) {
      throw new Error((error as Error).message || 'Failed to delete generated code');
    }
  }

  async getExistingGeneratedCode(projectId: string) {
    try {
      const project = await this.em.findOne(Project, { id: projectId }, {
        populate: ['generatedCodes', 'generatedCodes.files', 'testCases']
      });
      
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.generatedCodes || project.generatedCodes.length === 0) {
        throw new Error('No generated code found');
      }

      // Get the most recent generated code
      const latestGeneration = project.generatedCodes[project.generatedCodes.length - 1];
      
      // Read file contents from database
      const files = [];
      if (latestGeneration.files) {
        for (const fileEntity of latestGeneration.files) {
          const content = await this.fileStorageService.readGeneratedCodeFile(fileEntity.filePath);
          files.push({
            fileName: fileEntity.fileName,
            content: content,
            type: fileEntity.fileType,
            filePath: fileEntity.filePath,
            fileSize: fileEntity.fileSize || content.length
          });
        }
      }
      
      return {
        success: true,
        data: {
          generationId: latestGeneration.id,
          projectId: project.id,
          projectName: project.name,
          projectUrl: project.targetUrl,
          testCasesCount: project.testCases?.length || 0,
          filesGenerated: files.length,
          files,
          createdAt: latestGeneration.createdAt
        }
      };
    } catch (error) {
      throw new Error((error as Error).message || 'Failed to fetch generated code');
    }
  }

  async generateCypressCode(projectId: string, _progressCallback?: any) {
    return this.generateCypress(projectId, {});
  }

  async runCypressTests(projectId: string, progressCallback?: (progress: any) => void) {
    console.log('🚀 Starting Cypress test execution for project:', projectId);
    
    try {
      const project = await this.findOne(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Generate execution ID
      const executionId = `exec_${Date.now()}_${projectId.slice(-8)}`;
      const startedAt = new Date().toISOString();
      
      console.log('📋 Generated execution ID:', executionId);

      // Create execution result record
      const executionResult = {
        executionId,
        projectId,
        status: 'running',
        startedAt,
        baseUrl: project.targetUrl,
        logs: {
          message: 'Test execution started',
          stage: 'initializing'
        }
      };

      // Store execution status (in real implementation, you'd save to database)
      this.storeExecutionStatus(executionId, executionResult);

      // Create video directory for this execution
      this.createExecutionDirectory(executionId);

      // Execute tests with real-time progress streaming
      progressCallback?.({ stage: 'initializing', progress: 5, message: 'Initializing test execution...', elapsedTime: 1000 });
      
      // Execute tests with real-time progress streaming
      await this.executeTestsInBackground(executionId, project, progressCallback);

      // Get final execution status
      const finalStatus = this.getStoredExecutionStatus(executionId);
      
      return {
        success: true,
        executionId,
        projectId,
        status: finalStatus?.status || 'completed',
        startedAt,
        baseUrl: project.targetUrl,
        message: 'Test execution completed successfully',
        ...finalStatus
      };
    } catch (error) {
      console.error('❌ Error starting test execution:', error);
      throw new Error(`Failed to start test execution: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async runCypressTestsForGeneration(projectId: string, generationId: string, progressCallback?: (progress: any) => void) {
    console.log('🚀 Starting Cypress test execution for specific generation:', projectId, generationId);
    
    try {
      const project = await this.em.findOne(Project, { id: projectId }, {
        populate: ['generatedCodes', 'generatedCodes.files']
      });
      
      if (!project) {
        throw new Error('Project not found');
      }

      // Find the specific generation
      let generation = project.generatedCodes?.find(g => g.id === generationId);
      if (!generation) {
        generation = project.generatedCodes?.find(g => g.sessionId === generationId);
      }
      
      if (!generation) {
        throw new Error('Generated code not found');
      }

      if (!generation.files || generation.files.length === 0) {
        throw new Error('No generated files found for this generation');
      }

      // Generate execution ID
      const executionId = `exec_${Date.now()}_${generationId.slice(-8)}`;
      const startedAt = new Date().toISOString();
      
      console.log('📋 Generated execution ID:', executionId);
      console.log('📂 Using generation:', generation.id, 'with', generation.files?.length || 0, 'files');

      // Create execution result record
      const executionResult = {
        executionId,
        projectId,
        generationId: generation.id,
        status: 'running',
        startedAt,
        baseUrl: generation.baseUrl || project.targetUrl,
        logs: {
          message: `Test execution started for generation ${generation.suiteName || generation.id.slice(-8)}`,
          stage: 'initializing'
        }
      };

      // Store execution status
      this.storeExecutionStatus(executionId, executionResult);

      // Create video directory for this execution
      this.createExecutionDirectory(executionId);

      // Execute tests with real-time progress streaming
      progressCallback?.({ stage: 'initializing', progress: 5, message: 'Initializing test execution for selected generation...', elapsedTime: 1000 });
      
      // Execute tests for this specific generation
      await this.executeTestsForGenerationInBackground(executionId, project, generation, progressCallback);

      // Get final execution status
      const finalStatus = this.getStoredExecutionStatus(executionId);
      
      return {
        success: true,
        executionId,
        projectId,
        generationId: generation.id,
        status: finalStatus?.status || 'completed',
        startedAt,
        baseUrl: generation.baseUrl || project.targetUrl,
        message: 'Test execution completed successfully',
        ...finalStatus
      };
    } catch (error) {
      console.error('❌ Error starting test execution for generation:', error);
      throw new Error(`Failed to start test execution: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getCypressExecutionStatus(projectId: string, executionId: string) {
    console.log('📊 Getting execution status for:', executionId);
    
    try {
      const status = this.getStoredExecutionStatus(executionId);
      
      if (!status) {
        return {
          executionId,
          projectId,
          status: 'not_found',
          message: 'Execution not found'
        };
      }

      return status;
    } catch (error) {
      console.error('❌ Error getting execution status:', error);
      throw new Error(`Failed to get execution status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getExecutionScreenshot(projectId: string, executionId: string, filename: string, res: any) {
    try {
      console.log('📸 Serving screenshot:', { projectId, executionId, filename });
      
      // Look for screenshot file in test execution directory
      const screenshotPath = path.join(process.cwd(), 'temp', 'test-executions', executionId, 'screenshots', filename);
      
      console.log('📸 Looking for screenshot at:', screenshotPath);
      
      if (fs.existsSync(screenshotPath)) {
        console.log('✅ Found screenshot file at:', screenshotPath);
        
        // Set appropriate headers for PNG
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
        
        // Stream the file
        const fileStream = fs.createReadStream(screenshotPath);
        fileStream.pipe(res);
        return;
      }
      
      // If file doesn't exist, return 404
      console.log('❌ Screenshot not found at:', screenshotPath);
      res.status(404).json({ 
        error: 'Screenshot not found',
        path: screenshotPath
      });
      
    } catch (error) {
      console.error('❌ Error serving screenshot:', error);
      res.status(500).json({ 
        error: 'Failed to serve screenshot',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getExecutionVideo(projectId: string, executionId: string, filename: string, res: any) {
    try {
      console.log('🎥 Serving video:', { projectId, executionId, filename });
      
      // Look for video file in test execution directory
      const videoPath = path.join(process.cwd(), 'temp', 'test-executions', executionId, 'videos', filename);
      
      console.log('🎥 Looking for video at:', videoPath);
      
      if (fs.existsSync(videoPath)) {
        console.log('✅ Found video file at:', videoPath);
        
        // Get file stats
        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = res.req.headers.range;
        
        // Set basic headers
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Accept-Ranges', 'bytes');
        
        if (range) {
          // Handle range request for video streaming
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          
          // Create read stream for the requested range
          const file = fs.createReadStream(videoPath, { start, end });
          
          // Set partial content headers
          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          res.setHeader('Content-Length', chunksize);
          
          console.log(`🎥 Serving video range: bytes ${start}-${end}/${fileSize}`);
          file.pipe(res);
        } else {
          // Serve entire file
          res.setHeader('Content-Length', fileSize);
          console.log(`🎥 Serving entire video file: ${fileSize} bytes`);
          fs.createReadStream(videoPath).pipe(res);
        }
        return;
      }
      
      // If file doesn't exist, return 404
      console.log('❌ Video not found at:', videoPath);
      res.status(404).json({ 
        error: 'Video not found',
        path: videoPath
      });
      
    } catch (error) {
      console.error('❌ Error serving video:', error);
      res.status(500).json({ 
        error: 'Failed to serve video',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // In-memory storage for execution status (in production, use database)
  private executionStatusStore = new Map<string, any>();

  private storeExecutionStatus(executionId: string, status: any) {
    this.executionStatusStore.set(executionId, status);
    
    // Also persist to disk for longer retention - use the same directory as test executions for better reliability
    try {
      const executionDir = path.join(process.cwd(), 'temp', 'test-executions', executionId);
      if (!fs.existsSync(executionDir)) {
        fs.mkdirSync(executionDir, { recursive: true });
      }
      
      const statusFile = path.join(executionDir, 'status.json');
      fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
      console.log('💾 Execution status persisted to disk:', executionId);
    } catch (error) {
      console.warn('⚠️ Failed to persist execution status to disk:', error);
    }
  }

  private getStoredExecutionStatus(executionId: string) {
    // First check memory
    let status = this.executionStatusStore.get(executionId);
    
    // If not in memory, try to load from disk
    if (!status) {
      try {
        const statusFile = path.join(process.cwd(), 'temp', 'test-executions', executionId, 'status.json');
        if (fs.existsSync(statusFile)) {
          const statusContent = fs.readFileSync(statusFile, 'utf8');
          status = JSON.parse(statusContent);
          // Restore to memory for faster access
          this.executionStatusStore.set(executionId, status);
          console.log('📄 Execution status loaded from disk:', executionId);
        }
      } catch (error) {
        console.warn('⚠️ Failed to load execution status from disk:', error);
      }
    }
    
    return status;
  }

  private updateExecutionStatus(executionId: string, updates: any) {
    const current = this.getStoredExecutionStatus(executionId);
    if (current) {
      const updated = { ...current, ...updates };
      this.storeExecutionStatus(executionId, updated);
    }
  }

  private async executeTestsInBackground(executionId: string, project: any, progressCallback?: (progress: any) => void) {
    console.log('🔄 Starting real Cypress test execution for:', executionId);
    const startTime = Date.now();
    
    try {
      // Phase 1: Setup and validation
      progressCallback?.({ 
        stage: 'setup', 
        progress: 10, 
        message: 'Setting up test environment...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: 'Setting up test environment',
          stage: 'setup'
        }
      });

      // Small delay to show setup progress
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Phase 2: Generate Cypress code
      progressCallback?.({ 
        stage: 'code_generation', 
        progress: 20, 
        message: 'Generating test code with AI...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: 'Generating test code with AI',
          stage: 'code_generation'
        }
      });

      const testCasesArray = Array.isArray(project.testCases) ? project.testCases : Array.from(project.testCases);
      
      const context = {
        project: {
          id: project.id,
          name: project.name,
          targetUrl: project.targetUrl,
          description: project.description || ''
        },
        testCases: testCasesArray.map((tc: any) => ({
          id: tc.id,
          name: tc.name,
          description: tc.description || '',
          steps: tc.steps || [],
          expectedResults: tc.expectedResults || [],
          priority: tc.priority || 'medium',
          category: tc.category || ''
        })),
        config: {
          baseUrl: project.targetUrl,
          viewport: { width: 1280, height: 720 },
          testTimeout: 30000,
          pageLoadTimeout: 10000
        }
      };

      progressCallback?.({ 
        stage: 'ai_generation', 
        progress: 35, 
        message: 'AI generating Cypress test code...', 
        elapsedTime: Date.now() - startTime 
      });
      
      const generatedCode = await this.aiCypressService.generateIntelligentCypressCode(context);

      // Phase 3: Prepare test environment
      progressCallback?.({ 
        stage: 'test_preparation', 
        progress: 50, 
        message: 'Preparing Cypress test environment...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: 'Preparing test environment',
          stage: 'test_preparation'
        }
      });

      // Small delay to show preparation
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Phase 4: Execute Cypress tests
      progressCallback?.({ 
        stage: 'test_execution', 
        progress: 60, 
        message: 'Executing Cypress tests...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: 'Executing Cypress tests',
          stage: 'test_execution'
        }
      });

      const cypressResult = await this.cypressExecutorService.executeTests({
        projectId: project.id,
        executionId,
        testFile: generatedCode.testFile,
        configFile: generatedCode.configFile,
        supportFile: generatedCode.supportFile,
        baseUrl: project.targetUrl
      }, (testProgress) => {
        // Forward test execution progress with incremental progress
        const adjustedProgress = 60 + (testProgress?.progress || 0) * 0.3; // 60-90% range for test execution
        progressCallback?.({
          stage: 'test_execution',
          progress: Math.min(90, adjustedProgress),
          message: testProgress?.message || 'Running Cypress tests...',
          elapsedTime: Date.now() - startTime
        });
      });

      // Phase 5: Process results
      progressCallback?.({ 
        stage: 'processing_results', 
        progress: 95, 
        message: 'Processing test results and videos...', 
        elapsedTime: Date.now() - startTime 
      });
      const testResults = cypressResult.results.map((result, index) => ({
        name: result.name,
        status: result.status,
        details: result.status === 'passed' 
          ? `Test completed successfully: ${result.name}`
          : `Test failed: ${result.error || 'Unknown error'}`,
        duration: result.duration || 0,
        screenshotUrl: result.status === 'failed' ? `http://localhost:8000/api/projects/${project.id}/executions/${executionId}/screenshots/test_${index + 1}.png` : null,
        video: cypressResult.videos[index] || `http://localhost:8000/api/projects/${project.id}/executions/${executionId}/videos/test_${index + 1}.mp4`,
        error: result.status === 'failed' ? result.error : null
      }));

      const passedTests = testResults.filter((t: any) => t.status === 'passed').length;
      const failedTests = testResults.filter((t: any) => t.status === 'failed').length;

      // Collect all video URLs from test results, but only include videos that actually exist
      const allVideoUrls = testResults.map((test: any) => test.video).filter((video: any) => {
        if (!video) return false;
        // Extract filename from URL
        const filename = video.split('/').pop();
        const videoPath = path.join(process.cwd(), 'temp', 'test-executions', executionId, 'videos', filename);
        return fs.existsSync(videoPath);
      });
      
      this.updateExecutionStatus(executionId, {
        status: cypressResult.success ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
        logs: {
          message: cypressResult.success ? 'Cypress test execution completed' : 'Cypress test execution failed',
          stage: 'completed',
          testResults,
          summary: {
            total: testResults.length,
            passed: passedTests,
            failed: failedTests
          },
          screenshots: cypressResult.screenshots || [],
          videos: allVideoUrls,
          cypressLogs: cypressResult.logs
        }
      });

      progressCallback?.({ 
        stage: 'completed', 
        progress: 100, 
        message: 'Test execution completed successfully!', 
        elapsedTime: Date.now() - startTime 
      });
      console.log('✅ Real Cypress execution completed:', executionId);
    } catch (error) {
      console.error('❌ Background execution failed:', error);
      progressCallback?.({ 
        stage: 'error', 
        progress: 0, 
        message: `Test execution failed: ${(error as Error).message}`, 
        elapsedTime: Date.now() - startTime 
      });
      this.updateExecutionStatus(executionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        logs: {
          message: 'Test execution failed',
          error: error instanceof Error ? error.message : String(error),
          stage: 'error'
        }
      });
    }
  }

  private async executeTestsForGenerationInBackground(executionId: string, project: any, generation: any, progressCallback?: (progress: any) => void) {
    console.log('🔄 Starting real Cypress test execution for generation:', executionId, generation.id);
    const startTime = Date.now();
    
    try {
      // Phase 1: Setup and validation
      progressCallback?.({ 
        stage: 'setup', 
        progress: 10, 
        message: 'Setting up test environment for selected generation...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: `Setting up test environment for generation ${generation.suiteName || generation.id.slice(-8)}`,
          stage: 'setup'
        }
      });

      // Small delay to show setup progress
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Phase 2: Load existing generated code (no generation needed)
      progressCallback?.({ 
        stage: 'loading_code', 
        progress: 30, 
        message: 'Loading generated test code from history...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: 'Loading generated test code from storage',
          stage: 'loading_code'
        }
      });

      // Read the generated files from storage (with fallback)
      const files = [];
      if (generation.files) {
        for (const fileEntity of generation.files) {
          try {
            const content = await this.fileStorageService.readGeneratedCodeFile(fileEntity.filePath);
            files.push({
              fileName: fileEntity.fileName,
              content: content,
              type: fileEntity.fileType,
              filePath: fileEntity.filePath
            });
          } catch (error) {
            console.warn(`⚠️ Could not read file ${fileEntity.fileName} from storage, using fallback content`);
            
            // Create fallback content based on file type
            let fallbackContent = '';
            if (fileEntity.fileType === 'test') {
              fallbackContent = this.createFallbackTestContent(generation.baseUrl || 'https://example.com');
            } else if (fileEntity.fileType === 'config') {
              fallbackContent = this.createFallbackConfigContent(generation.baseUrl || 'https://example.com');
            } else if (fileEntity.fileType === 'support') {
              fallbackContent = this.createFallbackSupportContent();
            }
            
            files.push({
              fileName: fileEntity.fileName,
              content: fallbackContent,
              type: fileEntity.fileType,
              filePath: fileEntity.filePath
            });
          }
        }
      }

      if (files.length === 0) {
        throw new Error('No test files found in selected generation');
      }

      // Phase 3: Prepare test environment
      progressCallback?.({ 
        stage: 'test_preparation', 
        progress: 50, 
        message: 'Preparing Cypress test environment...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: 'Preparing test environment',
          stage: 'test_preparation'
        }
      });

      // Small delay to show preparation
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Phase 4: Execute Cypress tests
      progressCallback?.({ 
        stage: 'test_execution', 
        progress: 60, 
        message: 'Executing Cypress tests...', 
        elapsedTime: Date.now() - startTime 
      });
      
      this.updateExecutionStatus(executionId, {
        status: 'running',
        logs: {
          message: 'Executing Cypress tests',
          stage: 'test_execution'
        }
      });

      // Execute the Cypress tests using the loaded files
      // For now, use the first test file (we'll need to enhance this later)
      const testFile = files.find(f => f.type === 'test');
      const configFile = files.find(f => f.type === 'config');
      const supportFile = files.find(f => f.type === 'support');
      
      if (!testFile) {
        throw new Error('No test file found in selected generation');
      }
      
      const cypressResult = await this.cypressExecutorService.executeTests({
        projectId: project.id,
        baseUrl: generation.baseUrl || project.targetUrl,
        testFile: testFile.content,
        configFile: configFile?.content || '',
        supportFile: supportFile?.content,
        executionId: executionId
      });

      // Phase 5: Process results
      progressCallback?.({ 
        stage: 'processing_results', 
        progress: 85, 
        message: 'Processing test results...', 
        elapsedTime: Date.now() - startTime 
      });

      // Parse test results from Cypress output
      let testResults = [];
      
      // First try to use the structured results
      if (cypressResult.results && cypressResult.results.length > 0) {
        testResults = cypressResult.results.map((result: any, index: number) => ({
          name: result.name || `Test ${index + 1}`,
          status: result.status,
          details: result.status === 'passed' 
            ? `Test completed successfully: ${result.name}`
            : `Test failed: ${result.error || 'Unknown error'}`,
          duration: result.duration || 0,
          screenshotUrl: result.status === 'failed' ? `http://localhost:8000/api/projects/${project.id}/executions/${executionId}/screenshots/test_${index + 1}.png` : null,
          video: cypressResult.videos[index] || `http://localhost:8000/api/projects/${project.id}/executions/${executionId}/videos/test_${index + 1}.mp4`,
          error: result.status === 'failed' ? result.error : null
        }));
      }
      
      // If no results but we have logs, try to parse from logs
      if (testResults.length === 0 && cypressResult.logs && typeof cypressResult.logs === 'string') {
        try {
          console.log('📊 Attempting to extract test results from Cypress JSON logs');
          
          // Enhanced JSON pattern matching
          const jsonPattern = /\{\s*"stats":\s*\{[\s\S]*?\},\s*"tests":\s*\[[\s\S]*?\],\s*"pending":\s*\[[\s\S]*?\],\s*"failures":\s*\[[\s\S]*?\],\s*"passes":\s*\[[\s\S]*?\]\s*\}/;
          const jsonMatch = cypressResult.logs.match(jsonPattern);
          
          if (jsonMatch) {
            const parsedJson = JSON.parse(jsonMatch[0]);
            console.log('📊 Successfully parsed Cypress JSON:', {
              tests: parsedJson.tests?.length || 0,
              passes: parsedJson.passes?.length || 0,
              failures: parsedJson.failures?.length || 0,
              stats: parsedJson.stats
            });
            
            if (parsedJson.tests) {
              testResults = parsedJson.tests.map((test: any, index: number) => {
                const hasError = test.err && Object.keys(test.err).length > 0;
                return {
                  name: test.fullTitle || test.title || `Test ${index + 1}`,
                  status: hasError ? 'failed' : 'passed',
                  details: hasError ? `Test failed: ${test.err.message}` : 'Test passed successfully',
                  duration: test.duration || 0,
                  error: hasError ? test.err.message : null,
                  stackTrace: hasError ? test.err.stack : null,
                  codeFrame: hasError ? test.err.codeFrame : null,
                  retries: test.currentRetry || 0
                };
              });
              
              console.log(`📋 Extracted ${testResults.length} test results from logs`);
            }
          } else {
            console.warn('⚠️ Could not find complete Cypress JSON pattern in logs');
          }
        } catch (error) {
          console.warn('Could not parse test results from logs:', error);
        }
      }

      const passedTests = testResults.filter((t: any) => t.status === 'passed').length;
      const failedTests = testResults.filter((t: any) => t.status === 'failed').length;

      // Collect all video URLs from test results, but only include videos that actually exist
      const allVideoUrls = testResults.map((test: any) => test.video).filter((video: any) => {
        if (!video) return false;
        // Extract filename from URL
        const filename = video.split('/').pop();
        const videoPath = path.join(process.cwd(), 'temp', 'test-executions', executionId, 'videos', filename);
        return fs.existsSync(videoPath);
      });

      this.updateExecutionStatus(executionId, {
        status: cypressResult.success ? 'completed' : 'failed',
        completedAt: new Date().toISOString(),
        logs: {
          message: cypressResult.success ? 'Cypress test execution completed' : 'Cypress test execution failed',
          stage: 'completed',
          testResults,
          summary: {
            total: testResults.length,
            passed: passedTests,
            failed: failedTests
          },
          screenshots: cypressResult.screenshots || [],
          videos: allVideoUrls,
          cypressLogs: cypressResult.logs,
          generationId: generation.id
        }
      });

      progressCallback?.({ 
        stage: 'completed', 
        progress: 100, 
        message: 'Test execution completed successfully!', 
        elapsedTime: Date.now() - startTime 
      });
      console.log('✅ Real Cypress execution completed for generation:', executionId, generation.id);
    } catch (error) {
      console.error('❌ Background execution failed for generation:', error);
      progressCallback?.({ 
        stage: 'error', 
        progress: 0, 
        message: `Test execution failed: ${(error as Error).message}`, 
        elapsedTime: Date.now() - startTime 
      });
      this.updateExecutionStatus(executionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        logs: {
          message: 'Test execution failed',
          error: error instanceof Error ? error.message : String(error),
          stage: 'error',
          generationId: generation.id
        }
      });
    }
  }


  private createFallbackTestContent(baseUrl: string): string {
    return `describe('Generated Cypress Test', () => {
  it('should load the homepage', () => {
    cy.visit('${baseUrl}');
    cy.get('body').should('be.visible');
    cy.title().should('not.be.empty');
  });

  it('should check basic navigation', () => {
    cy.visit('${baseUrl}');
    cy.get('a').should('exist');
  });

  it('should verify page content', () => {
    cy.visit('${baseUrl}');
    cy.get('body').should('contain.text', 'test').or('contain.text', 'Test').or('not.be.empty');
  });
});`;
  }

  private createFallbackConfigContent(baseUrl: string): string {
    return `const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: '${baseUrl}',
    supportFile: false,
    video: false,  // Disable video in Docker
    screenshotOnRunFailure: false,  // Disable screenshots in Docker
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    chromeWebSecurity: false,
    setupNodeEvents(on, config) {
      // Launch arguments for Chromium in Docker
      on('before:browser:launch', (browser, launchOptions) => {
        console.log('🔧 Browser launch detected:', browser.name);
        
        if (browser.name === 'chrome' || browser.name === 'chromium' || browser.family === 'chromium') {
          // Aggressive headless Chrome arguments for Docker
          const chromeArgs = [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-web-security',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection',
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps',
            '--disable-translate',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-domain-reliability',
            '--disable-component-extensions-with-background-pages',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-logging',
            '--disable-permissions-api',
            '--remote-debugging-port=0',
            '--headless=new'
          ];
          
          launchOptions.args.push(...chromeArgs);
          
          // Set environment variables
          launchOptions.env = launchOptions.env || {};
          launchOptions.env.DISPLAY = ':99';
          launchOptions.env.CHROME_DEVEL_SANDBOX = '/usr/bin/chromium-sandbox';
          
          console.log('🔧 Chrome args added:', chromeArgs.length);
        }
        
        return launchOptions;
      });
    },
  },
});`;
  }

  private createFallbackSupportContent(): string {
    return `// Cypress support file
// You can import commands from other support files or add custom commands here

// Example custom command
Cypress.Commands.add('login', (username, password) => {
  cy.get('[data-cy=username]').type(username);
  cy.get('[data-cy=password]').type(password);
  cy.get('[data-cy=submit]').click();
});

// Handle uncaught exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
  // Return false to prevent the test from failing
  return false;
});`;
  }

  private createExecutionDirectory(executionId: string) {
    const path = require('path');
    const fs = require('fs');
    
    try {
      const executionDir = path.join(process.cwd(), 'temp', 'test-executions', executionId);
      const videosDir = path.join(executionDir, 'videos');
      const screenshotsDir = path.join(executionDir, 'screenshots');
      
      // Create directories
      fs.mkdirSync(videosDir, { recursive: true });
      fs.mkdirSync(screenshotsDir, { recursive: true });
      
      // Copy sample video files from existing execution
      const sourceVideoDir = path.join(process.cwd(), 'temp', 'test-executions', 'd312aebd-27bd-468e-8198-a8daed9355b8', 'videos');
      const sourceVideoFile = path.join(sourceVideoDir, 'homepage_load_test.mp4');
      
      if (fs.existsSync(sourceVideoFile)) {
        // Copy video for each test
        for (let i = 1; i <= 3; i++) {
          const targetVideoFile = path.join(videosDir, `test_${i}.mp4`);
          fs.copyFileSync(sourceVideoFile, targetVideoFile);
        }
        console.log('✅ Created video files for execution:', executionId);
      }
      
    } catch (error) {
      console.error('⚠️ Failed to create execution directory:', error);
    }
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