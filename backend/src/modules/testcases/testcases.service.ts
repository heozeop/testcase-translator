import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { TestCase } from '../../entities/TestCase.entity';
import { Project } from '../../entities/Project.entity';
import { CreateTestCaseDto, UpdateTestCaseDto, TestCaseQueryDto } from './dto/testcase.dto';

@Injectable()
export class TestCasesService {
  private readonly logger = new Logger(TestCasesService.name);

  constructor(
    @InjectRepository(TestCase)
    private readonly testCaseRepository: EntityRepository<TestCase>,
    @InjectRepository(Project)
    private readonly projectRepository: EntityRepository<Project>,
  ) {}

  async findAll(query: TestCaseQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const orderBy: any = {};
    
    if (query.orderBy) {
      orderBy[query.orderBy === 'created_at' ? 'createdAt' : query.orderBy] = query.order || 'DESC';
    } else {
      orderBy.createdAt = 'DESC';
    }

    const where: any = {};
    if (query.projectId) {
      where.project = { id: query.projectId };
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.search) {
      where.$or = [
        { name: { $ilike: `%${query.search}%` } },
        { description: { $ilike: `%${query.search}%` } }
      ];
    }

    try {
      const [testCases, total] = await this.testCaseRepository.findAndCount(
        where,
        {
          limit,
          offset,
          orderBy,
          populate: ['project'],
        }
      );

      const totalPages = Math.ceil(total / limit);
      
      return {
        data: testCases,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        message: 'Test cases retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve test cases:', error);
      throw error;
    }
  }

  async findOne(id: string) {
    try {
      const testCase = await this.testCaseRepository.findOne({ id }, { populate: ['project'] });
      return {
        data: testCase,
        message: 'Test case retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve test case ${id}:`, error);
      throw error;
    }
  }

  async create(createTestCaseDto: CreateTestCaseDto) {
    try {
      const project = await this.projectRepository.findOneOrFail({ id: createTestCaseDto.projectId });
      
      const testCase = new TestCase(project, createTestCaseDto.name, createTestCaseDto.description);
      testCase.steps = createTestCaseDto.steps;
      testCase.expectedResults = createTestCaseDto.expectedResults;
      testCase.testData = createTestCaseDto.testData;
      testCase.priority = createTestCaseDto.priority || 'medium';
      testCase.category = createTestCaseDto.category;
      
      await this.testCaseRepository.getEntityManager().persistAndFlush(testCase);
      
      return {
        data: testCase,
        message: 'Test case created successfully',
      };
    } catch (error) {
      this.logger.error('Failed to create test case:', error);
      throw error;
    }
  }

  async update(id: string, updateTestCaseDto: UpdateTestCaseDto) {
    try {
      const testCase = await this.testCaseRepository.findOneOrFail({ id });
      
      if (updateTestCaseDto.name !== undefined) {
        testCase.name = updateTestCaseDto.name;
      }
      if (updateTestCaseDto.description !== undefined) {
        testCase.description = updateTestCaseDto.description;
      }
      if (updateTestCaseDto.steps !== undefined) {
        testCase.steps = updateTestCaseDto.steps;
      }
      if (updateTestCaseDto.expectedResults !== undefined) {
        testCase.expectedResults = updateTestCaseDto.expectedResults;
      }
      if (updateTestCaseDto.testData !== undefined) {
        testCase.testData = updateTestCaseDto.testData;
      }
      if (updateTestCaseDto.priority !== undefined) {
        testCase.priority = updateTestCaseDto.priority;
      }
      if (updateTestCaseDto.category !== undefined) {
        testCase.category = updateTestCaseDto.category;
      }

      await this.testCaseRepository.getEntityManager().flush();
      
      return {
        data: testCase,
        message: 'Test case updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update test case ${id}:`, error);
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const testCase = await this.testCaseRepository.findOne({ id });
      if (!testCase) {
        return false;
      }
      
      await this.testCaseRepository.getEntityManager().removeAndFlush(testCase);
      this.logger.log(`Test case ${id} deleted successfully`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete test case ${id}:`, error);
      throw error;
    }
  }

  async findByProject(projectId: string, query: TestCaseQueryDto) {
    const queryWithProject = { ...query, projectId };
    return this.findAll(queryWithProject);
  }

  async getStatistics(projectId?: string) {
    try {
      const where: any = {};
      if (projectId) {
        where.project = { id: projectId };
      }

      const total = await this.testCaseRepository.count(where);
      const highPriority = await this.testCaseRepository.count({ ...where, priority: 'high' });
      const mediumPriority = await this.testCaseRepository.count({ ...where, priority: 'medium' });
      const lowPriority = await this.testCaseRepository.count({ ...where, priority: 'low' });
      const active = await this.testCaseRepository.count({ ...where, status: 'active' });
      const archived = await this.testCaseRepository.count({ ...where, status: 'archived' });

      // Get category distribution
      const testCases = await this.testCaseRepository.find(where, { fields: ['category'] });
      const categoryCounts: Record<string, number> = {};
      testCases.forEach(tc => {
        if (tc.category) {
          categoryCounts[tc.category] = (categoryCounts[tc.category] || 0) + 1;
        }
      });

      const lastTestCase = await this.testCaseRepository.findOne(where, { 
        orderBy: { updatedAt: 'DESC' },
        fields: ['updatedAt']
      });
      
      return {
        data: {
          projectId,
          testCases: {
            total,
            byPriority: {
              high: highPriority,
              medium: mediumPriority,
              low: lowPriority,
            },
            byCategory: categoryCounts,
            byStatus: {
              active,
              archived,
            },
          },
          lastUpdated: lastTestCase?.updatedAt,
        },
        message: 'Test case statistics retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to retrieve test case statistics:', error);
      throw error;
    }
  }

  async bulkCreate(testCases: CreateTestCaseDto[]) {
    try {
      const results = [];
      
      for (const testCaseDto of testCases) {
        const testCase = await this.create(testCaseDto);
        results.push(testCase.data);
      }
      
      return {
        data: results,
        message: `${results.length} test cases created successfully`,
      };
    } catch (error) {
      this.logger.error('Failed to bulk create test cases:', error);
      throw error;
    }
  }

  async duplicate(id: string, newName?: string) {
    try {
      const original = await this.testCaseRepository.findOneOrFail({ id }, { populate: ['project'] });

      const duplicateData = {
        projectId: original.project.id,
        name: newName || `${original.name} (Copy)`,
        description: original.description,
        steps: original.steps,
        expectedResults: original.expectedResults,
        testData: original.testData,
        priority: original.priority,
        category: original.category,
      };

      return this.create(duplicateData);
    } catch (error) {
      this.logger.error(`Failed to duplicate test case ${id}:`, error);
      throw error;
    }
  }
}