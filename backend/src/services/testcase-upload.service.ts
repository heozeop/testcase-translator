import { Injectable, NotFoundException } from '@nestjs/common';
import { TestCase } from '../models/TestCase.entity';
import { Project } from '../models/Project.entity';
import { ProjectRepository, TestCaseRepository } from '../repositories';
import * as XLSX from 'xlsx';
import * as fs from 'fs';

export interface TestCaseUploadResult {
  success: boolean;
  message: string;
  fileName: string;
  totalRows: number;
  createdTestCases: number;
  testCases: Array<{
    id: string;
    name: string;
    description: string;
    rowNumber: number;
  }>;
  errors: Array<{
    rowNumber: number;
    error: string;
    data: any;
  }>;
  projectId: string;
}

@Injectable()
export class TestCaseUploadService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly testCaseRepository: TestCaseRepository,
  ) {}

  async uploadTestCases(projectId: string, file: any): Promise<TestCaseUploadResult> {
    try {
      // Verify project exists
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // Read file from disk
      const fileBuffer = fs.readFileSync(file.path);

      // Parse file based on type
      let testCaseData: any[] = [];

      if (
        file.mimetype.includes('excel') ||
        file.mimetype.includes('spreadsheet') ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')
      ) {
        testCaseData = this.parseExcelFile(fileBuffer);
      } else if (file.mimetype.includes('csv') || file.originalname.endsWith('.csv')) {
        testCaseData = this.parseCsvFile(fileBuffer);
      } else {
        throw new Error('Unsupported file format. Please upload Excel (.xlsx, .xls) or CSV files.');
      }

      // Clean up uploaded file after processing
      this.cleanupUploadedFile(file.path);

      // Process test case data and create test cases
      const { createdTestCases, errors } = await this.processTestCaseData(
        testCaseData,
        project,
        file.originalname,
      );

      return {
        success: true,
        message: 'Test cases uploaded and processed successfully',
        fileName: file.originalname,
        totalRows: testCaseData.length,
        createdTestCases: createdTestCases.length,
        testCases: createdTestCases,
        errors,
        projectId,
      };
    } catch (error) {
      throw new Error(`Failed to upload test cases: ${(error as Error).message}`);
    }
  }

  private parseExcelFile(fileBuffer: Buffer): any[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Look for '테스트' sheet first, then fall back to first sheet
    let sheetName = workbook.SheetNames.find(name => name.includes('테스트') || name === '테스트');
    if (!sheetName) {
      sheetName = workbook.SheetNames[0];
    }

    console.log(
      `Using Excel sheet: ${sheetName} from available sheets: ${workbook.SheetNames.join(', ')}`,
    );
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }

  private parseCsvFile(fileBuffer: Buffer): any[] {
    const csvText = fileBuffer.toString('utf-8');
    const lines = csvText.split('\n').filter((line: string) => line.trim());
    const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));

    return lines.slice(1).map((line: string, index: number) => {
      const values = line.split(',').map((v: string) => v.trim().replace(/"/g, ''));
      const row: any = { _rowNumber: index + 2 }; // +2 because we skip header and arrays are 0-indexed
      headers.forEach((header: string, i: number) => {
        row[header] = values[i] || '';
      });
      return row;
    });
  }

  private async processTestCaseData(
    testCaseData: any[],
    project: Project,
    fileName: string,
  ): Promise<{
    createdTestCases: Array<{ id: string; name: string; description: string; rowNumber: number }>;
    errors: Array<{ rowNumber: number; error: string; data: any }>;
  }> {
    const createdTestCases: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < testCaseData.length; i++) {
      const rowData = testCaseData[i];
      const rowNumber = rowData._rowNumber || i + 2;

      try {
        const testCaseInfo = this.extractTestCaseInfo(rowData, rowNumber);

        // Skip invalid rows
        if (!this.isValidTestCaseRow(testCaseInfo, rowNumber)) {
          continue;
        }

        // Create test case
        const testCase = await this.createTestCase(testCaseInfo, project, fileName, rowNumber);

        createdTestCases.push({
          id: testCase.id,
          name: testCase.name,
          description: testCase.description,
          rowNumber,
        });
      } catch (error) {
        errors.push({
          rowNumber,
          error: (error as Error).message,
          data: rowData,
        });
      }
    }

    return { createdTestCases, errors };
  }

  private extractTestCaseInfo(rowData: any, rowNumber: number) {
    const name =
      rowData.name ||
      rowData.Name ||
      rowData.testCase ||
      rowData['Test Case'] ||
      rowData.scenario ||
      rowData.Scenario ||
      // Korean format: Use DEPTH 2 as name (main functionality description)
      rowData.__EMPTY_3 ||
      rowData.__EMPTY_2 ||
      rowData.__EMPTY ||
      rowData.__EMPTY_0 ||
      `Test Case ${rowNumber}`;

    const description =
      rowData.description ||
      rowData.Description ||
      rowData.details ||
      rowData.Details ||
      // Korean format: CATEGORY + DEPTH 1 as description
      (rowData.__EMPTY_1 && rowData.__EMPTY_2
        ? `${rowData.__EMPTY_1} - ${rowData.__EMPTY_2}`
        : rowData.__EMPTY_1 || '');

    const steps =
      rowData.steps ||
      rowData.Steps ||
      rowData.actions ||
      rowData.Actions ||
      // Korean format: PRE-CONDITION + STEP
      (rowData.__EMPTY_5 && rowData.__EMPTY_6
        ? `${rowData.__EMPTY_5} | ${rowData.__EMPTY_6}`
        : rowData.__EMPTY_6 || rowData.__EMPTY_5 || '');

    const expectedResults =
      rowData.expectedResult ||
      rowData.expectedResults ||
      rowData['Expected Result'] ||
      rowData.expected ||
      rowData.Expected ||
      // Korean format: EXPECT RESULT
      rowData.__EMPTY_7 ||
      '';

    const priorityValue = rowData.priority || rowData.Priority || 'medium';
    const priority = (typeof priorityValue === 'string' ? priorityValue : 'medium').toLowerCase();

    const category =
      rowData.category ||
      rowData.Category ||
      rowData.type ||
      rowData.Type ||
      // Korean format: CATEGORY
      rowData.__EMPTY_1 ||
      '';

    return {
      name,
      description,
      steps,
      expectedResults,
      priority,
      category,
      rawData: rowData,
    };
  }

  private isValidTestCaseRow(testCaseInfo: any, rowNumber: number): boolean {
    const { name, rawData } = testCaseInfo;

    // Skip empty rows, header rows, or invalid data
    if (
      !name ||
      name.trim() === '' ||
      name.includes('EOF') ||
      // Skip header rows
      name === 'INDEX No.' ||
      name === 'CATEGORY' ||
      name.includes('[Pareto]') ||
      name === 'DEPTH 2' ||
      name === 'DEPTH 1' ||
      name === 'STEP' ||
      name === 'EXPECT RESULT'
    ) {
      console.log(`Skipping invalid/header row ${rowNumber}:`, testCaseInfo);
      return false;
    }

    // Only process rows that have a numeric index and meaningful test data
    if (typeof rawData.__EMPTY !== 'number' || !rawData.__EMPTY_3) {
      console.log(`Skipping non-test-case row ${rowNumber}:`, testCaseInfo);
      return false;
    }

    return true;
  }

  private async createTestCase(
    testCaseInfo: any,
    project: Project,
    fileName: string,
    rowNumber: number,
  ): Promise<TestCase> {
    const { name, description, steps, expectedResults, priority, category } = testCaseInfo;

    const testCaseData: Partial<TestCase> = {
      project,
      name,
      description,
      excelFilePath: fileName,
      excelRowNumber: rowNumber,
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
    };

    // Set steps
    if (steps) {
      if (typeof steps === 'string') {
        if (steps.includes(' | ')) {
          testCaseData.steps = steps
            .split(' | ')
            .map(s => s.trim())
            .filter(s => s);
        } else if (steps.includes('|')) {
          testCaseData.steps = steps
            .split('|')
            .map(s => s.trim())
            .filter(s => s);
        } else if (steps.includes('\n')) {
          testCaseData.steps = steps
            .split('\n')
            .map(s => s.trim())
            .filter(s => s);
        } else {
          testCaseData.steps = [steps.trim()];
        }
      } else {
        testCaseData.steps = steps;
      }
    }

    // Set expected results
    if (expectedResults) {
      testCaseData.expectedResults =
        typeof expectedResults === 'string' ? [expectedResults] : expectedResults;
    }

    // Set category
    if (category) {
      testCaseData.category = category;
    }

    return this.testCaseRepository.create(testCaseData);
  }

  private cleanupUploadedFile(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup uploaded file:', cleanupError);
    }
  }
}
