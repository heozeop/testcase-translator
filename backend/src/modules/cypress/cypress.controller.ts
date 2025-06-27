import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CypressService } from './cypress.service';
import {
  GenerateCypressDto,
  RegenerateCypressDto,
  CypressQueryDto,
} from './dto/cypress.dto';

@ApiTags('cypress')
@Controller('cypress')
export class CypressController {
  constructor(private readonly cypressService: CypressService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate new Cypress project from exploration results' })
  @ApiResponse({ status: 201, description: 'Cypress project generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid generation request' })
  async generate(@Body() generateDto: GenerateCypressDto) {
    const result = await this.cypressService.generate(generateDto);
    
    if (result.status === 'failed') {
      throw new BadRequestException(
        `Failed to generate Cypress project: ${result.errors.join(', ')}`,
      );
    }

    return {
      data: {
        generationId: result.id,
        projectPath: result.organizationResult?.projectPath,
        metadata: result.metadata,
        testSuite: result.testSuite ? {
          suiteName: result.testSuite.suiteName,
          description: result.testSuite.description,
          baseUrl: result.testSuite.baseUrl,
          testCaseCount: result.testSuite.testCases?.length || 0,
          fixtureCount: Object.keys(result.testSuite.fixtures || {}).length,
          customCommandCount: result.testSuite.customCommands?.length || 0,
        } : null,
      },
      message: 'Cypress project generated successfully',
    };
  }

  @Get('generations')
  @ApiOperation({ summary: 'List generated Cypress projects' })
  @ApiResponse({ status: 200, description: 'Generated projects retrieved successfully' })
  async getGenerations(@Query() query: CypressQueryDto) {
    return this.cypressService.getGenerations(query);
  }

  @Get('generations/:id')
  @ApiOperation({ summary: 'Get detailed information about a specific generation' })
  @ApiResponse({ status: 200, description: 'Generation details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  async getGeneration(@Param('id') id: string) {
    const generation = await this.cypressService.getGeneration(id);
    
    if (!generation) {
      throw new NotFoundException('Generated Cypress project not found');
    }

    return {
      data: generation,
      message: 'Generation details retrieved successfully',
    };
  }

  @Get('generations/:id/files/:fileName')
  @ApiOperation({ summary: 'Get the content of a specific generated file' })
  @ApiResponse({ status: 200, description: 'File content retrieved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFileContent(
    @Param('id') id: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    const content = await this.cypressService.getFileContent(id, fileName);
    
    if (!content) {
      throw new NotFoundException('Generated file not found');
    }

    // Set appropriate content type
    const extension = fileName.split('.').pop()?.toLowerCase();
    let contentType = 'text/plain';
    
    switch (extension) {
      case 'js':
        contentType = 'application/javascript';
        break;
      case 'ts':
        contentType = 'application/typescript';
        break;
      case 'json':
        contentType = 'application/json';
        break;
      case 'md':
        contentType = 'text/markdown';
        break;
    }

    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    response.send(content);
  }

  @Post('regenerate')
  @ApiOperation({ summary: 'Regenerate an existing Cypress project' })
  @ApiResponse({ status: 200, description: 'Cypress project regenerated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid regeneration request' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  async regenerate(@Body() regenerateDto: RegenerateCypressDto) {
    const result = await this.cypressService.regenerate(regenerateDto);
    
    if (result.status === 'failed') {
      throw new BadRequestException(
        `Failed to regenerate Cypress project: ${result.errors.join(', ')}`,
      );
    }

    return {
      data: {
        generationId: result.id,
        projectPath: result.organizationResult?.projectPath,
        metadata: result.metadata,
        testSuite: result.testSuite ? {
          suiteName: result.testSuite.suiteName,
          description: result.testSuite.description,
          baseUrl: result.testSuite.baseUrl,
          testCaseCount: result.testSuite.testCases?.length || 0,
        } : null,
      },
      message: 'Cypress project regenerated successfully',
    };
  }

  @Delete('generations/:id')
  @ApiOperation({ summary: 'Delete a generated Cypress project' })
  @ApiResponse({ status: 200, description: 'Cypress project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Generation not found' })
  async deleteGeneration(@Param('id') id: string) {
    const deleted = await this.cypressService.deleteGeneration(id);
    
    if (!deleted) {
      throw new NotFoundException('Generated Cypress project not found');
    }

    return {
      data: { deleted: true },
      message: 'Cypress project deleted successfully',
    };
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get available Cypress templates' })
  @ApiResponse({ status: 200, description: 'Available templates retrieved successfully' })
  async getTemplates() {
    return this.cypressService.getTemplates();
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get generation statistics' })
  @ApiResponse({ status: 200, description: 'Generation statistics retrieved successfully' })
  async getStatistics(@Query('projectId') projectId?: string) {
    return this.cypressService.getStatistics(projectId);
  }

  @Post('validate-request')
  @ApiOperation({ summary: 'Validate a generation request without executing it' })
  @ApiResponse({ status: 200, description: 'Request validation completed' })
  async validateRequest(@Body() generateDto: GenerateCypressDto) {
    return this.cypressService.validateRequest(generateDto);
  }
}