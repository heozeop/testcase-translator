import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TestCasesService } from './testcases.service';
import { CreateTestCaseDto, UpdateTestCaseDto, TestCaseQueryDto } from './dto/testcase.dto';

@ApiTags('testcases')
@Controller('testcases')
export class TestCasesController {
  constructor(private readonly testCasesService: TestCasesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all test cases' })
  @ApiResponse({ status: 200, description: 'Test cases retrieved successfully' })
  async findAll(@Query() query: TestCaseQueryDto) {
    return this.testCasesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get test case by ID' })
  @ApiResponse({ status: 200, description: 'Test case found' })
  @ApiResponse({ status: 404, description: 'Test case not found' })
  async findOne(@Param('id') id: string) {
    const testCase = await this.testCasesService.findOne(id);
    if (!testCase.data) {
      throw new NotFoundException('Test case not found');
    }
    return testCase;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new test case' })
  @ApiResponse({ status: 201, description: 'Test case created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createTestCaseDto: CreateTestCaseDto) {
    return this.testCasesService.create(createTestCaseDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update test case' })
  @ApiResponse({ status: 200, description: 'Test case updated successfully' })
  @ApiResponse({ status: 404, description: 'Test case not found' })
  async update(
    @Param('id') id: string,
    @Body() updateTestCaseDto: UpdateTestCaseDto,
  ) {
    const testCase = await this.testCasesService.update(id, updateTestCaseDto);
    if (!testCase.data) {
      throw new NotFoundException('Test case not found');
    }
    return testCase;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete test case' })
  @ApiResponse({ status: 200, description: 'Test case deleted successfully' })
  @ApiResponse({ status: 404, description: 'Test case not found' })
  async remove(@Param('id') id: string) {
    const deleted = await this.testCasesService.remove(id);
    if (!deleted) {
      throw new NotFoundException('Test case not found');
    }
    return { message: 'Test case deleted successfully' };
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get test cases for a specific project' })
  @ApiResponse({ status: 200, description: 'Project test cases retrieved successfully' })
  async findByProject(
    @Param('projectId') projectId: string,
    @Query() query: TestCaseQueryDto,
  ) {
    return this.testCasesService.findByProject(projectId, query);
  }

  @Get('statistics/:projectId?')
  @ApiOperation({ summary: 'Get test case statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics(@Param('projectId') projectId?: string) {
    return this.testCasesService.getStatistics(projectId);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Create multiple test cases at once' })
  @ApiResponse({ status: 201, description: 'Test cases created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async bulkCreate(@Body() body: { testCases: CreateTestCaseDto[] }) {
    if (!body.testCases || !Array.isArray(body.testCases)) {
      throw new BadRequestException('testCases array is required');
    }
    return this.testCasesService.bulkCreate(body.testCases);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate an existing test case' })
  @ApiResponse({ status: 201, description: 'Test case duplicated successfully' })
  @ApiResponse({ status: 404, description: 'Original test case not found' })
  async duplicate(
    @Param('id') id: string,
    @Body() body: { name?: string } = {},
  ) {
    try {
      return await this.testCasesService.duplicate(id, body.name);
    } catch (error) {
      if (error.message === 'Original test case not found') {
        throw new NotFoundException('Original test case not found');
      }
      throw error;
    }
  }
}