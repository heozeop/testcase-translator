import { IsString, IsOptional, IsObject, IsArray, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateCypressDto {
  @ApiProperty({
    description: 'Project ID for which to generate Cypress tests',
    example: 'proj_12345',
  })
  @IsString()
  projectId!: string;

  @ApiProperty({
    description: 'Exploration session ID containing the data to convert',
    example: 'session_67890',
  })
  @IsString()
  sessionId!: string;

  @ApiPropertyOptional({
    description: 'Base URL for the test suite',
    example: 'https://example.com',
  })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({
    description: 'Test suite name',
    example: 'E-commerce Test Suite',
  })
  @IsOptional()
  @IsString()
  suiteName?: string;

  @ApiPropertyOptional({
    description: 'Test suite description',
    example: 'Automated tests for the e-commerce platform',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Cypress generation options',
    example: {
      includeScreenshots: true,
      generateFixtures: true,
      templateTypes: ['navigation', 'form'],
    },
  })
  @IsOptional()
  @IsObject()
  options?: {
    includeScreenshots?: boolean;
    generateFixtures?: boolean;
    templateTypes?: string[];
    customCommands?: boolean;
    dataTestAttributes?: boolean;
    viewportSizes?: string[];
  };

  @ApiPropertyOptional({
    description: 'Specific test case IDs to include (if not provided, all will be included)',
    example: ['tc_001', 'tc_002'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testCaseIds?: string[];
}

export class RegenerateCypressDto {
  @ApiProperty({
    description: 'Generation ID to regenerate',
    example: 'gen_12345',
  })
  @IsString()
  generationId!: string;

  @ApiPropertyOptional({
    description: 'Updated generation options',
    example: {
      includeScreenshots: false,
      generateFixtures: true,
    },
  })
  @IsOptional()
  @IsObject()
  options?: {
    includeScreenshots?: boolean;
    generateFixtures?: boolean;
    templateTypes?: string[];
    customCommands?: boolean;
    dataTestAttributes?: boolean;
    viewportSizes?: string[];
  };

  @ApiPropertyOptional({
    description: 'Specific test case IDs to include in regeneration',
    example: ['tc_001', 'tc_003'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testCaseIds?: string[];
}

export class CypressQueryDto {
  @ApiPropertyOptional({
    description: 'Project ID to filter generations',
    example: 'proj_12345',
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Generation status to filter by',
    example: 'completed',
    enum: ['pending', 'in_progress', 'completed', 'failed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'in_progress', 'completed', 'failed'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Field to order by',
    example: 'created_at',
    enum: ['created_at', 'updated_at', 'suite_name'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['created_at', 'updated_at', 'suite_name'])
  orderBy?: string;

  @ApiPropertyOptional({
    description: 'Order direction',
    example: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC';
}