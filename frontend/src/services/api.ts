import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  Project,
  TestCase,
  UrlValidationRequest,
  UrlValidationResponse,
  ProcessingResult,
  FileUploadResult,
  PaginatedResponse
} from '../types/api';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
      timeout: 30000,
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

  // Test case endpoints
  async getTestCases(projectId: string, page: number = 1, limit: number = 10): Promise<PaginatedResponse<TestCase>> {
    const response = await this.api.get(`/api/projects/${projectId}/test-cases?page=${page}&limit=${limit}`);
    const apiResponse = response.data as any; // Use any to access pagination
    
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

    const response = await this.api.post(`/api/projects/${projectId}/test-cases/upload`, formData, {
      // Don't set Content-Type manually - let browser set it with boundary
      headers: {},
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
      timeout: 300000, // 5 minutes for file upload and processing
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

  // Generate Cypress code from test cases with streaming
  async generateCypressCode(projectId: string, onProgress?: (progress: any) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `${this.api.defaults.baseURL}/api/projects/${projectId}/generate-cypress`;
      
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      // Add authorization header if available
      const token = localStorage.getItem('auth_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      let buffer = '';
      
      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(buffer.length);
        buffer = xhr.responseText;
        
        // Process each line as a separate JSON message
        const lines = newData.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const message = JSON.parse(line);
            
            if (message.type === 'progress' && onProgress) {
              onProgress(message.data);
            } else if (message.type === 'complete') {
              console.log('Generation completed:', message.data);
              resolve(message.data);
              return;
            } else if (message.type === 'error') {
              console.error('Generation error:', message.data);
              reject(new Error(message.data.message || 'Code generation failed'));
              return;
            }
          } catch (e) {
            // Ignore malformed JSON lines
            console.debug('Ignoring malformed progress line:', line);
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Try to parse the final response if not already resolved
          try {
            const lines = xhr.responseText.split('\n').filter(line => line.trim());
            const lastLine = lines[lines.length - 1];
            if (lastLine) {
              const finalMessage = JSON.parse(lastLine);
              if (finalMessage.type === 'complete') {
                resolve(finalMessage.data);
              } else {
                reject(new Error('Unexpected final response format'));
              }
            } else {
              reject(new Error('Empty response from server'));
            }
          } catch (e) {
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

  // Run generated Cypress tests
  async runCypressTests(projectId: string): Promise<any> {
    const response = await this.api.post(`/api/projects/${projectId}/run-cypress`);
    return this.handleResponse<any>(response);
  }

  // Get Cypress test execution status
  async getCypressExecutionStatus(projectId: string, executionId: string): Promise<any> {
    const response = await this.api.get(`/api/projects/${projectId}/cypress-status/${executionId}`);
    return this.handleResponse<any>(response);
  }

  // Get base URL for WebSocket connections
  getWebSocketUrl(): string {
    return process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:8000';
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;