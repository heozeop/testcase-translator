import { IsString, IsOptional, IsObject, IsArray, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTestCaseDto {
  @ApiProperty({
    description: 'Project ID this test case belongs to',
    example: 'proj_12345',
  })
  @IsString()
  projectId!: string;

  @ApiProperty({
    description: 'Test case name',
    example: 'Login with valid credentials',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Test case description',
    example: 'Verify that users can login with valid email and password',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Test steps as an array of actions',
    example: [
      { action: 'navigate', target: 'https://example.com/login' },
      { action: 'type', target: '[data-test="email"]', value: 'user@example.com' },
      { action: 'type', target: '[data-test="password"]', value: 'password123' },
      { action: 'click', target: '[data-test="login-button"]' },
    ],
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  steps?: Array<{
    action: string;
    target?: string;
    value?: string;
    description?: string;
  }>;

  @ApiPropertyOptional({
    description: 'Expected results or assertions',
    example: [
      { type: 'url', expected: 'https://example.com/dashboard' },
      { type: 'element', target: '[data-test="welcome-message"]', expected: 'visible' },
    ],
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  expectedResults?: Array<{
    type: string;
    target?: string;
    expected: string;
    description?: string;
  }>;

  @ApiPropertyOptional({
    description: 'Test data or fixtures',
    example: {
      users: [
        { email: 'user@example.com', password: 'password123' },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  testData?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Test case priority',
    example: 'high',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  priority?: string;

  @ApiPropertyOptional({
    description: 'Test case category or tag',
    example: 'authentication',
  })
  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateTestCaseDto {
  @ApiPropertyOptional({
    description: 'Test case name',
    example: 'Updated login test',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Test case description',
    example: 'Updated description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Test steps as an array of actions',
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  steps?: Array<{
    action: string;
    target?: string;
    value?: string;
    description?: string;
  }>;

  @ApiPropertyOptional({
    description: 'Expected results or assertions',
  })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  expectedResults?: Array<{
    type: string;
    target?: string;
    expected: string;
    description?: string;
  }>;

  @ApiPropertyOptional({
    description: 'Test data or fixtures',
  })
  @IsOptional()
  @IsObject()
  testData?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Test case priority',
    example: 'medium',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  priority?: string;

  @ApiPropertyOptional({
    description: 'Test case category or tag',
    example: 'regression',
  })
  @IsOptional()
  @IsString()
  category?: string;
}

export class TestCaseQueryDto {
  @ApiPropertyOptional({
    description: 'Project ID to filter test cases',
    example: 'proj_12345',
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Priority to filter by',
    example: 'high',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  priority?: string;

  @ApiPropertyOptional({
    description: 'Category to filter by',
    example: 'authentication',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Search term for test case name or description',
    example: 'login',
  })
  @IsOptional()
  @IsString()
  search?: string;

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
    enum: ['name', 'created_at', 'updated_at', 'priority'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'created_at', 'updated_at', 'priority'])
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