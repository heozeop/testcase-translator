import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  Project,
  TestCase,
  UrlValidationRequest,
  UrlValidationResponse,
  FileUploadResult,
  PaginatedResponse
} from '../types/api';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    // If API_BASE_URL starts with '/', it's a relative URL (will use proxy)
    const baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
    
    this.api = axios.create({
      baseURL: baseURL,
      timeout: 300000, // 5 minutes timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        if (process.env.REACT_APP_DEBUG === 'true') {
          console.log('API Request:', config.method?.toUpperCase(), config.url, config.data);
        }
        return config;
      },
      (error) => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        if (process.env.REACT_APP_DEBUG === 'true') {
          console.log('API Response:', response.status, response.data);
        }
        return response;
      },
      (error) => {
        console.error('API Response Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Helper method to handle API responses
  private handleResponse<T>(response: AxiosResponse): T {
    const data = response.data as ApiSuccessResponse<T> | ApiErrorResponse;
    
    if (!data.success) {
      throw new Error(data.error?.message || 'API request failed');
    }
    
    return (data as ApiSuccessResponse<T>).data;
  }

  // Project endpoints
  async getProjects(page: number = 1, limit: number = 10): Promise<PaginatedResponse<Project>> {
    const response = await this.api.get(`/api/projects?page=${page}&limit=${limit}`);
    const apiResponse = response.data as any; // Use any to access pagination
    
    if (!apiResponse.success) {
      throw new Error(apiResponse.error?.message || 'API request failed');
    }
    
    // Handle the backend response structure which has nested data
    const backendData = apiResponse.data;
    const projects = (backendData.data || []).map((project: any) => ({
      ...project,
      target_url: project.targetUrl, // Map targetUrl to target_url for frontend compatibility
      created_at: project.createdAt,  // Map createdAt to created_at 
      updated_at: project.updatedAt   // Map updatedAt to updated_at
    }));
    
    // Return the paginated response structure expected by frontend
    return {
      data: projects,
      pagination: {
        page: backendData.page || 1,
        limit: backendData.limit || 10,
        total: backendData.total || 0,
        totalPages: backendData.totalPages || 0,
        hasNext: backendData.hasNext || false,
        hasPrev: backendData.hasPrev || false
      }
    };
  }

  async getProject(id: string): Promise<Project> {
    const response = await this.api.get(`/api/projects/${id}`);
    return this.handleResponse<Project>(response);
  }

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    // Transform snake_case to camelCase for backend
    const createData = {
      name: project.name,
      targetUrl: project.target_url,
      description: project.description
    };
    const response = await this.api.post('/api/projects', createData);
    return this.handleResponse<Project>(response);
  }

  async updateProject(id: string, project: Partial<Project>): Promise<Project> {
    // Transform snake_case to camelCase for backend
    const updateData: any = {};
    if (project.name !== undefined) updateData.name = project.name;
    if (project.target_url !== undefined) updateData.targetUrl = project.target_url;
    if (project.description !== undefined) updateData.description = project.description;
    
    const response = await this.api.put(`/api/projects/${id}`, updateData);
    return this.handleResponse<Project>(response);
  }

  async deleteProject(id: string): Promise<void> {
    await this.api.delete(`/api/projects/${id}`);
  }

  // URL validation endpoint
  async validateUrl(request: UrlValidationRequest): Promise<UrlValidationResponse> {
    const response = await this.api.post('/api/projects/validate-url', request);
    return this.handleResponse<UrlValidationResponse>(response);
  }

  // Test case endpoints - Full CRUD operations
  
  // Get all test cases with pagination and filtering
  async getTestCases(params?: {
    projectId?: string;
    page?: number;
    limit?: number;
    search?: string;
    priority?: string;
    category?: string;
    orderBy?: string;
    order?: 'ASC' | 'DESC';
  }): Promise<PaginatedResponse<TestCase>> {
    const queryParams = new URLSearchParams();
    
    if (params?.projectId) queryParams.append('projectId', params.projectId);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.priority) queryParams.append('priority', params.priority);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.orderBy) queryParams.append('orderBy', params.orderBy);
    if (params?.order) queryParams.append('order', params.order);
    
    const response = await this.api.get(`/api/testcases?${queryParams.toString()}`);
    const apiResponse = response.data as any;
    
    if (!apiResponse.success) {
      throw new Error(apiResponse.error?.message || 'API request failed');
    }
    
    // Return the paginated response structure expected by frontend
    return {
      data: apiResponse.data || [],
      pagination: apiResponse.pagination || {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    };
  }

  // Get test cases for a specific project
  async getProjectTestCases(projectId: string, page: number = 1, limit: number = 10): Promise<PaginatedResponse<TestCase>> {
    const response = await this.api.get(`/api/testcases/project/${projectId}?page=${page}&limit=${limit}`);
    const apiResponse = response.data as any;
    
    if (!apiResponse.success) {
      throw new Error(apiResponse.error?.message || 'API request failed');
    }
    
    // Return the paginated response structure expected by frontend
    return {
      data: apiResponse.data || [],
      pagination: apiResponse.pagination || {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    };
  }

  // Get a single test case by ID
  async getTestCase(id: string): Promise<TestCase> {
    const response = await this.api.get(`/api/testcases/${id}`);
    return this.handleResponse<TestCase>(response);
  }

  // Create a new test case
  async createTestCase(testCase: {
    projectId: string;
    name: string;
    description?: string;
    steps?: Array<{
      action: string;
      target?: string;
      value?: string;
      description?: string;
    }>;
    expectedResults?: Array<{
      type: string;
      target?: string;
      expected: string;
      description?: string;
    }>;
    testData?: Record<string, any>;
    priority?: 'low' | 'medium' | 'high';
    category?: string;
  }): Promise<TestCase> {
    const response = await this.api.post('/api/testcases', testCase);
    return this.handleResponse<TestCase>(response);
  }

  // Update a test case
  async updateTestCase(id: string, testCase: {
    name?: string;
    description?: string;
    steps?: Array<{
      action: string;
      target?: string;
      value?: string;
      description?: string;
    }>;
    expectedResults?: Array<{
      type: string;
      target?: string;
      expected: string;
      description?: string;
    }>;
    testData?: Record<string, any>;
    priority?: 'low' | 'medium' | 'high';
    category?: string;
  }): Promise<TestCase> {
    const response = await this.api.put(`/api/testcases/${id}`, testCase);
    return this.handleResponse<TestCase>(response);
  }

  // Delete a test case
  async deleteTestCase(id: string): Promise<void> {
    await this.api.delete(`/api/testcases/${id}`);
  }

  // Duplicate a test case
  async duplicateTestCase(id: string, newName?: string): Promise<TestCase> {
    const body = newName ? { name: newName } : {};
    const response = await this.api.post(`/api/testcases/${id}/duplicate`, body);
    return this.handleResponse<TestCase>(response);
  }

  // Bulk create test cases
  async bulkCreateTestCases(testCases: Array<{
    projectId: string;
    name: string;
    description?: string;
    steps?: any[];
    expectedResults?: any[];
    testData?: Record<string, any>;
    priority?: 'low' | 'medium' | 'high';
    category?: string;
  }>): Promise<TestCase[]> {
    const response = await this.api.post('/api/testcases/bulk', { testCases });
    return this.handleResponse<TestCase[]>(response);
  }

  // Get test case statistics
  async getTestCaseStatistics(projectId?: string): Promise<{
    projectId?: string;
    testCases: {
      total: number;
      byPriority: { high: number; medium: number; low: number };
      byCategory: Record<string, number>;
      byStatus: { active: number; archived: number };
    };
    lastUpdated?: Date;
  }> {
    const endpoint = projectId ? `/api/testcases/statistics/${projectId}` : '/api/testcases/statistics';
    const response = await this.api.get(endpoint);
    return this.handleResponse<any>(response);
  }

  async uploadExcelFile(projectId: string, file: File, onProgress?: (progress: number) => void): Promise<FileUploadResult> {
    console.log('API uploadExcelFile called with:', {
      projectId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Debug: Check FormData contents
    console.log('FormData contents:');
    const entries = Array.from(formData.entries());
    for (let [key, value] of entries) {
      console.log(`  ${key}:`, value);
    }

    // Create a new axios instance without default headers for file upload
    const uploadApi = axios.create({
      baseURL: this.api.defaults.baseURL,
      timeout: 300000, // 5 minutes for file upload
    });
    
    const response = await uploadApi.post(`/api/projects/${projectId}/test-cases/upload`, formData, {
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return this.handleResponse<FileUploadResult>(response);
  }

  // Alias for uploadExcelFile for better naming consistency
  async uploadTestCases(projectId: string, file: File, onProgress?: (progress: number) => void): Promise<FileUploadResult> {
    return this.uploadExcelFile(projectId, file, onProgress);
  }

  // Get project processing status
  async getProjectStatus(projectId: string): Promise<any> {
    const response = await this.api.get(`/api/projects/${projectId}/status`);
    return this.handleResponse<any>(response);
  }

  // Utility methods
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.api.get('/api/health');
    return this.handleResponse<{ status: string; timestamp: string }>(response);
  }


  // Download test cases as CSV
  async downloadTestCases(projectId: string): Promise<Blob> {
    const response = await this.api.get(`/api/projects/${projectId}/test-cases/download`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // List all generated code for a project
  async listGeneratedCode(projectId: string, page: number = 1, limit: number = 10): Promise<any> {
    try {
      const response = await this.api.get(`/api/projects/${projectId}/generated-code?page=${page}&limit=${limit}`);
      const apiResponse = response.data as any;
      
      if (!apiResponse.success) {
        throw new Error(apiResponse.error?.message || 'API request failed');
      }
      
      // Return the structure with data and pagination
      return {
        data: apiResponse.data || [],
        pagination: apiResponse.pagination || {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        }
      };
    } catch (error: any) {
      // If no generated code exists, return empty list
      if (error.response?.status === 404) {
        return {
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false
          }
        };
      }
      throw error;
    }
  }

  // Get latest generated Cypress code for a project
  async getLatestGeneratedCode(projectId: string): Promise<any> {
    try {
      const response = await this.api.get(`/api/projects/${projectId}/generated-code/latest`);
      const apiResponse = response.data as any;
      
      if (!apiResponse.success) {
        throw new Error(apiResponse.error?.message || 'API request failed');
      }
      
      // Handle double-nested response structure
      if (apiResponse.data && apiResponse.data.success && apiResponse.data.data) {
        return apiResponse.data.data;
      }
      return apiResponse.data;
    } catch (error: any) {
      // If no generated code exists, return null instead of throwing
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // Get specific generated code by generation ID
  async getGeneratedCodeById(projectId: string, generationId: string): Promise<any> {
    try {
      const response = await this.api.get(`/api/projects/${projectId}/generated-code/${generationId}`);
      const apiResponse = response.data as any;
      
      console.log('🔍 API Service - Raw response:', apiResponse);
      
      if (!apiResponse.success) {
        throw new Error(apiResponse.error?.message || 'API request failed');
      }
      
      // Handle double-nested response structure
      if (apiResponse.data && apiResponse.data.success && apiResponse.data.data) {
        console.log('🔍 API Service - Using double-nested data:', apiResponse.data.data);
        return apiResponse.data.data;
      }
      console.log('🔍 API Service - Using single-nested data:', apiResponse.data);
      return apiResponse.data;
    } catch (error: any) {
      // If not found, return null
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // Delete specific generated code
  async deleteGeneratedCode(projectId: string, generationId: string): Promise<any> {
    try {
      const response = await this.api.delete(`/api/projects/${projectId}/generated-code/${generationId}`);
      const apiResponse = response.data as any;
      
      if (!apiResponse.success) {
        throw new Error(apiResponse.error?.message || 'API request failed');
      }
      
      return apiResponse.data || apiResponse;
    } catch (error: any) {
      throw error;
    }
  }

  // Update generated code files
  async updateGeneratedCodeFiles(
    projectId: string, 
    generationId: string, 
    files: Array<{
      fileName: string;
      content: string;
      type: 'test' | 'config' | 'support';
    }>
  ): Promise<any> {
    try {
      const response = await this.api.put(
        `/api/projects/${projectId}/generated-code/${generationId}/files`,
        { files }
      );
      const apiResponse = response.data as any;
      
      if (!apiResponse.success) {
        throw new Error(apiResponse.error?.message || 'API request failed');
      }
      
      return apiResponse.data || apiResponse;
    } catch (error: any) {
      throw error;
    }
  }

  // Legacy method - now points to latest
  async getExistingGeneratedCode(projectId: string): Promise<any> {
    return this.getLatestGeneratedCode(projectId);
  }

  // Generate Cypress code from test cases with streaming
  async generateCypressCode(projectId: string, onProgress?: (progress: any) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${this.api.defaults.baseURL}/api/projects/${projectId}/generate-cypress`;
      
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 900000; // 15 minutes timeout
      
      // Add authorization header if available
      const token = localStorage.getItem('auth_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      let buffer = '';
      let resolved = false;
      
      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(buffer.length);
        buffer = xhr.responseText;
        
        // Process each line as a separate JSON message
        const lines = newData.split('\n').filter(line => line.trim());
        console.log('Processing lines:', lines.length);
        
        for (const line of lines) {
          try {
            const message = JSON.parse(line);
            console.log('Parsed message type:', message.type);
            
            if (message.type === 'progress' && onProgress) {
              onProgress(message.data);
            } else if (message.type === 'complete') {
              if (resolved) {
                console.log('Already resolved, ignoring duplicate complete message');
                return;
              }
              resolved = true;
              console.log('🎉 COMPLETE MESSAGE RECEIVED!');
              console.log('Generation completed:', message.data);
              console.log('Full message structure:', JSON.stringify(message, null, 2));
              console.log('Files in response:', message.data?.data?.files?.length || 0);
              if (message.data?.data?.files) {
                console.log('File details:', message.data.data.files.map((f: any) => ({ 
                  name: f.fileName, 
                  size: f.content?.length || 0,
                  type: f.type 
                })));
              }
              // Handle double-nested data structure: { type: 'complete', data: { data: { files: [...] } } }
              const result = message.data.data || message.data;
              console.log('Final result to return:', result);
              console.log('Files in final result:', result?.files?.length || 0);
              console.log('🚀 RESOLVING WITH RESULT!');
              resolve(result);
              return;
            } else if (message.type === 'error') {
              console.error('Generation error:', message.data);
              reject(new Error(message.data.message || 'Code generation failed'));
              return;
            }
          } catch (e) {
            // Ignore malformed JSON lines
            console.debug('Ignoring malformed progress line:', line.substring(0, 100));
          }
        }
      };

      xhr.onload = () => {
        console.log('XHR onload triggered, status:', xhr.status);
        if (xhr.status >= 200 && xhr.status < 300) {
          // Try to parse the final response if not already resolved
          try {
            const lines = xhr.responseText.split('\n').filter(line => line.trim());
            console.log('XHR onload - Total lines:', lines.length);
            const lastLine = lines[lines.length - 1];
            console.log('XHR onload - Last line:', lastLine?.substring(0, 100) + '...');
            if (lastLine) {
              const finalMessage = JSON.parse(lastLine);
              console.log('XHR onload - Final message type:', finalMessage.type);
              if (finalMessage.type === 'complete') {
                if (resolved) {
                  console.log('Already resolved, ignoring onload complete message');
                  return;
                }
                resolved = true;
                const result = finalMessage.data.data || finalMessage.data;
                console.log('🎯 XHR onload - Final fallback result:', result);
                console.log('Files in fallback result:', result?.files?.length || 0);
                resolve(result);
              } else {
                console.error('XHR onload - Unexpected final response format:', finalMessage.type);
                reject(new Error('Unexpected final response format'));
              }
            } else {
              console.error('XHR onload - Empty response from server');
              reject(new Error('Empty response from server'));
            }
          } catch (e) {
            console.error('XHR onload - Failed to parse final response:', e);
            reject(new Error('Failed to parse final response'));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during code generation'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Code generation timed out'));
      };

      // Set a longer timeout (5 minutes)
      xhr.timeout = 300000;

      xhr.send(JSON.stringify({}));
    });
  }

  // Run generated Cypress tests with progress streaming (latest generation)
  async runCypressTests(projectId: string, progressCallback?: (progress: any) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
      const url = `${baseURL}/api/projects/${projectId}/run-cypress`;
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      let processedLength = 0;
      let finalResult: any = null;
      
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
          const newData = xhr.responseText.slice(processedLength);
          processedLength = xhr.responseText.length;
          
          if (newData.trim()) {
            // Parse each line as JSON
            const lines = newData.trim().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                console.log('📡 Raw parsed streaming data:', parsed);
                
                if (parsed.type === 'progress' && progressCallback) {
                  console.log('📊 Forwarding progress to callback:', parsed.data);
                  progressCallback(parsed.data);
                } else if (parsed.type === 'complete') {
                  console.log('✅ Test execution completed:', parsed.data);
                  finalResult = parsed.data;
                } else if (parsed.type === 'error') {
                  console.error('❌ Test execution error:', parsed.data);
                  reject(new Error(parsed.data.message || 'Test execution failed'));
                  return;
                }
              } catch (e) {
                console.warn('Failed to parse streaming response line:', line.substring(0, 100), e);
              }
            }
          }
        }
        
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(finalResult || { success: true, message: 'Test execution completed' });
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.message || `HTTP ${xhr.status}: ${xhr.statusText}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          }
        }
      };
      
      xhr.onerror = () => {
        reject(new Error('Network error during test execution'));
      };
      
      xhr.ontimeout = () => {
        reject(new Error('Request timeout during test execution'));
      };
      
      // Set a longer timeout for test execution
      xhr.timeout = 600000; // 10 minutes
      
      xhr.send(JSON.stringify({}));
    });
  }

  // Run specific generated Cypress tests with progress streaming
  async runCypressTestsForGeneration(projectId: string, generationId: string, progressCallback?: (progress: any) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
      const url = `${baseURL}/api/projects/${projectId}/generated-code/${generationId}/run-cypress`;
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      let processedLength = 0;
      let finalResult: any = null;
      
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
          const newData = xhr.responseText.slice(processedLength);
          processedLength = xhr.responseText.length;
          
          if (newData.trim()) {
            // Parse each line as JSON
            const lines = newData.trim().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                console.log('📡 Raw parsed streaming data:', parsed);
                
                if (parsed.type === 'progress' && progressCallback) {
                  console.log('📊 Forwarding progress to callback:', parsed.data);
                  progressCallback(parsed.data);
                } else if (parsed.type === 'complete') {
                  console.log('✅ Test execution completed:', parsed.data);
                  finalResult = parsed.data;
                } else if (parsed.type === 'error') {
                  console.error('❌ Test execution error:', parsed.data);
                  reject(new Error(parsed.data.message || 'Test execution failed'));
                  return;
                }
              } catch (e) {
                console.warn('Failed to parse streaming response line:', line.substring(0, 100), e);
              }
            }
          }
        }
        
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(finalResult || { success: true, message: 'Test execution completed' });
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.message || `HTTP ${xhr.status}: ${xhr.statusText}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          }
        }
      };
      
      xhr.onerror = () => {
        reject(new Error('Network error during test execution'));
      };
      
      xhr.ontimeout = () => {
        reject(new Error('Request timeout during test execution'));
      };
      
      // Set a longer timeout for test execution
      xhr.timeout = 600000; // 10 minutes
      
      xhr.send(JSON.stringify({}));
    });
  }

  // Get Cypress test execution status
  async getCypressExecutionStatus(projectId: string, executionId: string): Promise<any> {
    const response = await this.api.get(`/api/projects/${projectId}/cypress-status/${executionId}`);
    return this.handleResponse<any>(response);
  }

  // Get base URL for WebSocket connections
  getWebSocketUrl(): string {
    return process.env.REACT_APP_WEBSOCKET_URL || 'http://backend:8000';
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;