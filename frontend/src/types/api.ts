export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface ApiSuccessResponse<T = any> extends ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse extends ApiResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface Project {
  id: string;
  name: string;
  target_url: string;
  description?: string;
  created_at: string;
  updated_at: string;
  test_case_count?: number;
  generated_code_count?: number;
}

export interface TestCase {
  id: string;
  name: string;
  scenarioName: string;
  description: string;
  steps: string[];
  expectedResult: string;
  expectedResults?: string[];
  category?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  originalFilename: string;
  metadata: {
    priority: 'high' | 'medium' | 'low';
    tags: string[];
    rowNumber?: number;
    sourceFile?: string;
    uploadDate?: string;
  };
}

export interface TestStep {
  stepNumber?: number;
  action: string;
  target: string;
  value?: string;
  description: string;
  waitConditions?: string[];
}

export interface TestAssertion {
  type: string;
  target: string;
  expected: any;
  description: string;
}

export interface UrlValidationRequest {
  url: string;
  options?: {
    timeout?: number;
    checkAccessibility?: boolean;
    retrieveContent?: boolean;
    extractMetadata?: boolean;
    followRedirects?: boolean;
    maxSize?: number;
  };
}

export interface UrlValidationResponse {
  url: string;
  normalizedUrl: string;
  isValid: boolean;
  isSafe: boolean;
  warnings?: string[];
  accessibility?: {
    accessible: boolean;
    status?: number;
    statusText?: string;
    responseTime?: number;
    redirectChain?: string[];
    finalUrl?: string;
    details?: any;
    error?: string;
  };
  content?: {
    retrieved: boolean;
    size?: number;
    loadTime?: number;
    encoding?: string;
    finalUrl?: string;
    redirectChain?: string[];
    links?: any[];
    images?: any[];
    forms?: any[];
    headings?: any[];
    error?: string;
  };
  metadata?: {
    title?: string;
    description?: string;
    keywords?: string[];
    author?: string;
    error?: string;
  };
}

export interface FileUploadResult {
  projectId: string;
  testCaseId?: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  status: string;
  message?: string;
  testCases?: TestCase[];
  testCasesExtracted?: number;
}

export interface ProcessingResult {
  processingResult: {
    summary: {
      totalTestCases: number;
      testTypes: string[];
      coverage: string;
      recommendations: string[];
    };
    metadata: {
      processingTime: number;
      tokenUsage: {
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
      };
      confidence: number;
      sourceFile: string;
    };
    warnings?: string[];
  };
  storageResult: {
    summary: {
      totalProcessed: number;
      successfullyStored: number;
      failed: number;
      duplicates: number;
      updated: number;
    };
    errors: {
      testCaseIndex: number;
      scenarioName: string;
      error: string;
      severity: 'warning' | 'error';
    }[];
  };
  testCases: {
    id: string;
    scenarioName: string;
    status: string;
    createdAt: string;
  }[];
}

export interface FileUploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  result?: ProcessingResult;
}