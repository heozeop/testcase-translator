import { IsString, IsOptional, IsUrl, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({
    description: 'Project name',
    example: 'E-commerce Test Suite',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Target URL for testing',
    example: 'https://example.com',
  })
  @IsUrl()
  targetUrl!: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Automated test suite for the e-commerce platform',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional({
    description: 'Project name',
    example: 'Updated E-commerce Test Suite',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Target URL for testing',
    example: 'https://updated-example.com',
  })
  @IsOptional()
  @IsUrl()
  targetUrl?: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Updated description for the test suite',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ProjectQueryDto {
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
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Field to order by',
    example: 'created_at',
    enum: ['name', 'created_at', 'updated_at'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'created_at', 'updated_at'])
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

  @ApiPropertyOptional({
    description: 'Search term for project name',
    example: 'e-commerce',
  })
  @IsOptional()
  @IsString()
  search?: string;
}