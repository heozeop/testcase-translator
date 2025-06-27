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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto, ProjectQueryDto } from './dto/project.dto';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
  @UseInterceptors(FileInterceptor('file'))
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
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.',
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
}