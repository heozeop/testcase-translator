import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { ProjectManagementService } from '../../services/project-management.service';
import { TestCaseUploadService } from '../../services/testcase-upload.service';
import { CodeGenerationService } from '../../services/code-generation.service';
import { UrlValidationService } from '../../services/url-validation.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';
import { multerConfig } from '../../common/config/multer.config';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectManagementService: ProjectManagementService,
    private readonly testCaseUploadService: TestCaseUploadService,
    private readonly codeGenerationService: CodeGenerationService,
    private readonly urlValidationService: UrlValidationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all projects' })
  @ApiResponse({ status: 200, description: 'Projects retrieved successfully' })
  async findAll(@Query() query: ProjectQueryDto) {
    return this.projectsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiResponse({ status: 200, description: 'Project found' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(@Param('id') id: string) {
    const project = await this.projectsService.findOne(id);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createProjectDto: CreateProjectDto) {
    return this.projectsService.create(createProjectDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    const project = await this.projectsService.update(id, updateProjectDto);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete project' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async remove(@Param('id') id: string) {
    const deleted = await this.projectsService.remove(id);
    if (!deleted) {
      throw new NotFoundException('Project not found');
    }
    return { message: 'Project deleted successfully' };
  }

  @Post('validate-url')
  @ApiOperation({ summary: 'Validate URL accessibility' })
  @ApiResponse({ status: 200, description: 'URL validation completed' })
  async validateUrl(@Body() body: { url: string; options?: any }) {
    return this.projectsService.validateUrl(body.url, body.options);
  }

  @Post(':id/test-cases/upload')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  @ApiOperation({ summary: 'Upload Excel file for test case parsing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Excel file containing test cases',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'File uploaded and processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file format' })
  async uploadTestCases(
    @Param('id') projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('Backend received file upload request:', {
      projectId,
      file: file ? {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        filename: file.filename
      } : 'NO FILE RECEIVED'
    });
    
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
      'text/plain', // Some browsers send CSV as text/plain
    ];

    // Check MIME type and file extension for better validation
    const isValidMime = allowedMimes.includes(file.mimetype);
    const fileName = file.originalname.toLowerCase();
    const isValidExtension = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
    
    if (!isValidMime && !isValidExtension) {
      throw new BadRequestException(
        `Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed. Received: ${file.mimetype}`,
      );
    }

    return this.projectsService.uploadTestCases(projectId, file);
  }

  @Post(':id/explore-and-generate')
  @ApiOperation({ summary: 'Start exploration and Cypress generation process' })
  @ApiResponse({ status: 202, description: 'Process initiated successfully' })
  async exploreAndGenerate(
    @Param('id') projectId: string,
    @Body() body: {
      url: string;
      explorationOptions?: any;
      cypressOptions?: any;
    },
  ) {
    return this.projectsService.exploreAndGenerate(
      projectId,
      body.url,
      body.explorationOptions,
      body.cypressOptions,
    );
  }

  @Get(':id/explore-status/:processId')
  @ApiOperation({ summary: 'Get exploration process status' })
  @ApiResponse({ status: 200, description: 'Process status retrieved' })
  async getExploreStatus(
    @Param('id') projectId: string,
    @Param('processId') processId: string,
  ) {
    return this.projectsService.getExploreStatus(projectId, processId);
  }

  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get project statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@Param('id') id: string) {
    return this.projectsService.getStatistics(id);
  }

  @Get(':id/test-cases')
  @ApiOperation({ summary: 'Get test cases for project' })
  @ApiResponse({ status: 200, description: 'Test cases retrieved successfully' })
  async getTestCases(
    @Param('id') projectId: string,
    @Query() query: any,
  ) {
    return this.projectsService.getTestCases(projectId, query);
  }

  @Get(':id/test-cases/download')
  @ApiOperation({ summary: 'Download processed test cases as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file downloaded successfully' })
  async downloadTestCases(
    @Param('id') projectId: string,
    @Res() res: any,
  ) {
    // TODO: Implement CSV download functionality
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="test-cases-${projectId}.csv"`);
    res.send('No CSV data available');
  }

  @Get(':id/generated-code')
  @ApiOperation({ summary: 'List all generated Cypress code for a project' })
  @ApiResponse({ status: 200, description: 'Generated code list retrieved successfully' })
  @ApiResponse({ status: 404, description: 'No generated code found' })
  async listGeneratedCode(@Param('id') projectId: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.projectsService.listGeneratedCode(projectId, page || 1, limit || 10);
  }

  @Get(':id/generated-code/latest')
  @ApiOperation({ summary: 'Get latest generated Cypress code for a project' })
  @ApiResponse({ status: 200, description: 'Latest generated code retrieved successfully' })
  @ApiResponse({ status: 404, description: 'No generated code found' })
  async getLatestGeneratedCode(@Param('id') projectId: string) {
    return this.projectsService.getExistingGeneratedCode(projectId);
  }

  @Get(':id/generated-code/:generationId')
  @ApiOperation({ summary: 'Get specific generated Cypress code by generation ID' })
  @ApiResponse({ status: 200, description: 'Generated code retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Generated code not found' })
  async getGeneratedCodeById(@Param('id') projectId: string, @Param('generationId') generationId: string) {
    return this.projectsService.getGeneratedCodeById(projectId, generationId);
  }

  @Delete(':id/generated-code/:generationId')
  @ApiOperation({ summary: 'Delete specific generated Cypress code' })
  @ApiResponse({ status: 200, description: 'Generated code deleted successfully' })
  @ApiResponse({ status: 404, description: 'Generated code not found' })
  async deleteGeneratedCode(@Param('id') projectId: string, @Param('generationId') generationId: string) {
    return this.projectsService.deleteGeneratedCode(projectId, generationId);
  }

  @Put(':id/generated-code/:generationId/files')
  @ApiOperation({ summary: 'Update generated code files content' })
  @ApiResponse({ status: 200, description: 'Files updated successfully' })
  @ApiResponse({ status: 404, description: 'Generated code not found' })
  async updateGeneratedCodeFiles(
    @Param('id') projectId: string, 
    @Param('generationId') generationId: string,
    @Body() updateData: {
      files: Array<{
        fileName: string;
        content: string;
        type: 'test' | 'config' | 'support';
      }>;
    }
  ) {
    return this.projectsService.updateGeneratedCodeFiles(projectId, generationId, updateData.files);
  }

  @Get(':id/generated-files/:fileName')
  @ApiOperation({ summary: 'Download a specific generated code file' })
  @ApiResponse({ status: 200, description: 'File downloaded successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async downloadGeneratedFile(
    @Param('id') projectId: string,
    @Param('fileName') fileName: string,
    @Res() res: any,
  ) {
    return this.projectsService.downloadGeneratedFile(projectId, fileName, res);
  }

  @Post(':id/generate-cypress')
  @ApiOperation({ summary: 'Generate Cypress test code from uploaded test cases with intelligent crawling' })
  @ApiResponse({ status: 200, description: 'Cypress code generated successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 400, description: 'No test cases found' })
  async generateCypressCode(@Param('id') projectId: string, @Res() res: any) {
    try {
      // Set headers for streaming response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let finalResult: any = null;

      // Stream progress updates
      const progressCallback = (progress: any) => {
        const chunk = JSON.stringify({ type: 'progress', data: progress }) + '\n';
        res.write(chunk);
      };

      try {
        // Generate code with progress streaming (extended timeout handled in service)
        finalResult = await this.projectsService.generateCypressCode(projectId, progressCallback);
        
        console.log('Files generated:', finalResult?.data?.files?.length || 0);
        if (finalResult?.data?.files) {
          console.log('File names:', finalResult.data.files.map((f: any) => f.fileName));
          console.log('File content lengths:', finalResult.data.files.map((f: any) => `${f.fileName}: ${f.content?.length || 0} chars`));
        }
        
        // Send final result
        const finalChunk = JSON.stringify({ type: 'complete', data: finalResult }) + '\n';
        console.log('Final chunk size:', finalChunk.length);
        res.write(finalChunk);
        res.end();

      } catch (error: any) {
        console.error('Code generation error:', error);
        const errorChunk = JSON.stringify({ 
          type: 'error', 
          data: { 
            message: error.message,
            timestamp: new Date().toISOString()
          } 
        }) + '\n';
        res.write(errorChunk);
        res.end();
      }

    } catch (error: any) {
      console.error('Streaming setup error:', error);
      res.status(500).json({ 
        error: 'Failed to start code generation',
        message: error.message 
      });
    }
  }

  @Post(':id/run-cypress')
  @ApiOperation({ summary: 'Run latest generated Cypress tests with real-time progress' })
  @ApiResponse({ status: 200, description: 'Cypress tests execution started' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 400, description: 'No generated code found' })
  async runCypressTests(@Param('id') projectId: string, @Res() res: any) {
    try {
      // Set headers for streaming response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

      let finalResult: any = null;

      // Stream progress updates
      const progressCallback = (progress: any) => {
        const chunk = JSON.stringify({ type: 'progress', data: progress }) + '\n';
        console.log('Sending progress chunk:', chunk.trim());
        res.write(chunk);
        res.flush?.(); // Force flush the chunk
      };

      try {
        // Run tests with progress streaming
        finalResult = await this.projectsService.runCypressTests(projectId, progressCallback);
        
        // Send final result
        const finalChunk = JSON.stringify({ type: 'complete', data: finalResult }) + '\n';
        console.log('Sending final chunk:', finalChunk.trim());
        res.write(finalChunk);
        res.flush?.();
        res.end();

      } catch (error: any) {
        console.error('Test execution error:', error);
        const errorChunk = JSON.stringify({ 
          type: 'error', 
          data: { 
            message: error.message,
            timestamp: new Date().toISOString()
          } 
        }) + '\n';
        console.log('Sending error chunk:', errorChunk.trim());
        res.write(errorChunk);
        res.flush?.();
        res.end();
      }

    } catch (error: any) {
      console.error('Streaming setup error:', error);
      res.status(500).json({ 
        error: 'Failed to start test execution',
        message: error.message 
      });
    }
  }

  @Post(':id/generated-code/:generationId/run-cypress')
  @ApiOperation({ summary: 'Run specific generated Cypress tests with real-time progress' })
  @ApiResponse({ status: 200, description: 'Cypress tests execution started' })
  @ApiResponse({ status: 404, description: 'Project or generation not found' })
  @ApiResponse({ status: 400, description: 'No generated code found' })
  async runSpecificCypressTests(@Param('id') projectId: string, @Param('generationId') generationId: string, @Res() res: any) {
    try {
      // Set headers for streaming response
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

      let finalResult: any = null;

      // Stream progress updates
      const progressCallback = (progress: any) => {
        const chunk = JSON.stringify({ type: 'progress', data: progress }) + '\n';
        console.log('Sending progress chunk:', chunk.trim());
        res.write(chunk);
        res.flush?.(); // Force flush the chunk
      };

      try {
        // Run tests for specific generation with progress streaming
        finalResult = await this.projectsService.runCypressTestsForGeneration(projectId, generationId, progressCallback);
        
        // Send final result
        const finalChunk = JSON.stringify({ type: 'complete', data: finalResult }) + '\n';
        console.log('Sending final chunk:', finalChunk.trim());
        res.write(finalChunk);
        res.flush?.();
        res.end();

      } catch (error: any) {
        console.error('Test execution error:', error);
        const errorChunk = JSON.stringify({ 
          type: 'error', 
          data: { 
            message: error.message,
            timestamp: new Date().toISOString()
          } 
        }) + '\n';
        console.log('Sending error chunk:', errorChunk.trim());
        res.write(errorChunk);
        res.flush?.();
        res.end();
      }

    } catch (error: any) {
      console.error('Streaming setup error:', error);
      res.status(500).json({ 
        error: 'Failed to start test execution',
        message: error.message 
      });
    }
  }

  @Get(':id/cypress-status/:executionId')
  @ApiOperation({ summary: 'Get Cypress test execution status' })
  @ApiResponse({ status: 200, description: 'Execution status retrieved' })
  async getCypressStatus(
    @Param('id') projectId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.projectsService.getCypressExecutionStatus(projectId, executionId);
  }

  @Get(':id/executions/:executionId/screenshots/:filename')
  @ApiOperation({ summary: 'Get screenshot from test execution' })
  @ApiResponse({ status: 200, description: 'Screenshot file' })
  async getExecutionScreenshot(
    @Param('id') projectId: string,
    @Param('executionId') executionId: string,
    @Param('filename') filename: string,
    @Res() res: any,
  ) {
    return this.projectsService.getExecutionScreenshot(projectId, executionId, filename, res);
  }

  @Get(':id/executions/:executionId/videos/:filename')
  @ApiOperation({ summary: 'Get video from test execution' })
  @ApiResponse({ status: 200, description: 'Video file' })
  async getExecutionVideo(
    @Param('id') projectId: string,
    @Param('executionId') executionId: string,
    @Param('filename') filename: string,
    @Res() res: any,
  ) {
    return this.projectsService.getExecutionVideo(projectId, executionId, filename, res);
  }
}