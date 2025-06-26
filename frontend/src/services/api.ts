import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  Project,
  TestCase,
  UrlValidationRequest,
  UrlValidationResponse,
  ProcessingResult,
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
    return this.handleResponse<PaginatedResponse<Project>>(response);
  }

  async getProject(id: string): Promise<Project> {
    const response = await this.api.get(`/api/projects/${id}`);
    return this.handleResponse<Project>(response);
  }

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    const response = await this.api.post('/api/projects', project);
    return this.handleResponse<Project>(response);
  }

  async updateProject(id: string, project: Partial<Project>): Promise<Project> {
    const response = await this.api.put(`/api/projects/${id}`, project);
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
    return this.handleResponse<PaginatedResponse<TestCase>>(response);
  }

  async uploadExcelFile(projectId: string, file: File, onProgress?: (progress: number) => void): Promise<ProcessingResult> {
    const formData = new FormData();
    formData.append('excelFile', file);

    const response = await this.api.post(`/api/projects/${projectId}/test-cases/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
      timeout: 300000, // 5 minutes for file upload and processing
    });

    return this.handleResponse<ProcessingResult>(response);
  }

  // Alias for uploadExcelFile for better naming consistency
  async uploadTestCases(projectId: string, file: File, onProgress?: (progress: number) => void): Promise<ProcessingResult> {
    return this.uploadExcelFile(projectId, file, onProgress);
  }

  // Utility methods
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.api.get('/api/health');
    return this.handleResponse<{ status: string; timestamp: string }>(response);
  }

  // Get base URL for WebSocket connections
  getWebSocketUrl(): string {
    return process.env.REACT_APP_WS_URL || 'ws://localhost:8000';
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;