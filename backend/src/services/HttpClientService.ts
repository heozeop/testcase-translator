import axios from 'axios';
import { UrlValidationService } from './UrlValidationService';

export interface HttpClientOptions {
  timeout?: number;
  maxRedirects?: number;
  userAgent?: string;
  followRedirects?: boolean;
  validateStatus?: (status: number) => boolean;
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: any;
  url: string;
  redirectChain?: string[];
}

export interface HttpError {
  message: string;
  status?: number;
  statusText?: string;
  code?: string;
  url?: string;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: any;
  };
}

export class HttpClientService {
  private client: any;
  private defaultOptions: Required<HttpClientOptions>;

  constructor(options: HttpClientOptions = {}) {
    this.defaultOptions = {
      timeout: options.timeout || 10000,
      maxRedirects: options.maxRedirects || 5,
      userAgent: options.userAgent || 'TestcaseTranslator/1.0 (Automated Testing Tool)',
      followRedirects: options.followRedirects !== false,
      validateStatus: options.validateStatus || ((status: number) => status >= 200 && status < 400)
    };

    this.client = this.createany();
    this.setupInterceptors();
  }

  private createany(): any {
    const config: any = {
      timeout: this.defaultOptions.timeout,
      maxRedirects: this.defaultOptions.maxRedirects,
      validateStatus: this.defaultOptions.validateStatus,
      headers: {
        ...UrlValidationService.getSecurityHeaders(),
        'User-Agent': this.defaultOptions.userAgent
      }
    };

    return axios.create(config);
  }

  private setupInterceptors(): void {
    // Request interceptor for logging and validation
    this.client.interceptors.request.use(
      (config: any) => {
        console.log(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
        
        // Validate URL before making request
        if (config.url) {
          const validation = UrlValidationService.validateUrl(config.url);
          if (!validation.isValid || !validation.isSafe) {
            throw new Error(`URL validation failed: ${validation.error}`);
          }
          
          if (validation.warnings && validation.warnings.length > 0) {
            console.warn('URL validation warnings:', validation.warnings);
          }
        }
        
        return config;
      },
      (error: any) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response: any) => {
        console.log(`HTTP Response: ${response.status} ${response.statusText} from ${response.config.url}`);
        return response;
      },
      (error: any) => {
        const httpError = this.formatError(error);
        console.error('HTTP Error:', httpError);
        return Promise.reject(httpError);
      }
    );
  }

  private formatError(error: any): HttpError {
    const httpError: HttpError = {
      message: error.message,
      code: error.code,
      url: error.config?.url
    };

    if (error.response) {
      // Server responded with error status
      httpError.status = error.response.status;
      httpError.statusText = error.response.statusText;
      httpError.response = {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers as Record<string, string>,
        data: error.response.data
      };
    }

    // Add specific error messages based on error type
    if (error.code === 'ECONNABORTED') {
      httpError.message = `Request timeout after ${this.defaultOptions.timeout}ms`;
    } else if (error.code === 'ENOTFOUND') {
      httpError.message = 'Domain not found or DNS resolution failed';
    } else if (error.code === 'ECONNREFUSED') {
      httpError.message = 'Connection refused by server';
    } else if (error.code === 'CERT_HAS_EXPIRED') {
      httpError.message = 'SSL certificate has expired';
    } else if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      httpError.message = 'Self-signed SSL certificate detected';
    }

    return httpError;
  }

  async head(url: string, options: HttpClientOptions = {}): Promise<HttpResponse> {
    const config = this.mergeOptions(options);
    
    try {
      const response = await this.client.head(url, config);
      return this.formatResponse(response);
    } catch (error) {
      throw error; // Error is already formatted by interceptor
    }
  }

  async get(url: string, options: HttpClientOptions = {}): Promise<HttpResponse> {
    const config = this.mergeOptions(options);
    
    try {
      const response = await this.client.get(url, config);
      return this.formatResponse(response);
    } catch (error) {
      throw error; // Error is already formatted by interceptor
    }
  }

  async post(url: string, data?: any, options: HttpClientOptions = {}): Promise<HttpResponse> {
    const config = this.mergeOptions(options);
    
    try {
      const response = await this.client.post(url, data, config);
      return this.formatResponse(response);
    } catch (error) {
      throw error; // Error is already formatted by interceptor
    }
  }

  private mergeOptions(options: HttpClientOptions): any {
    return {
      timeout: options.timeout || this.defaultOptions.timeout,
      maxRedirects: options.maxRedirects || this.defaultOptions.maxRedirects,
      validateStatus: options.validateStatus || this.defaultOptions.validateStatus,
      headers: {
        ...UrlValidationService.getSecurityHeaders(),
        'User-Agent': options.userAgent || this.defaultOptions.userAgent
      }
    };
  }

  private formatResponse(response: any): HttpResponse {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      config: response.config,
      url: response.request?.responseURL || response.config.url || '',
      redirectChain: this.extractRedirectChain(response)
    };
  }

  private extractRedirectChain(response: any): string[] | undefined {
    // Extract redirect chain if available
    const redirects: string[] = [];
    
    if (response.request && response.request._redirectable && response.request._redirectable._redirects) {
      const redirectsHistory = response.request._redirectable._redirects;
      redirectsHistory.forEach((redirect: any) => {
        if (redirect.url) {
          redirects.push(redirect.url);
        }
      });
    }
    
    return redirects.length > 0 ? redirects : undefined;
  }

  // Utility method to check if URL is accessible without downloading content
  async checkAccessibility(url: string): Promise<{
    accessible: boolean;
    status?: number;
    statusText?: string;
    error?: string;
    redirectChain?: string[];
  }> {
    try {
      const response = await this.head(url, {
        validateStatus: (status) => status < 500 // Allow 4xx responses as "accessible"
      });
      
      return {
        accessible: response.status < 400,
        status: response.status,
        statusText: response.statusText,
        redirectChain: response.redirectChain
      };
    } catch (error: any) {
      return {
        accessible: false,
        error: error.message,
        status: error.status,
        statusText: error.statusText
      };
    }
  }

  // Get response headers without downloading body
  async getHeaders(url: string): Promise<Record<string, string>> {
    try {
      const response = await this.head(url);
      return response.headers;
    } catch (error: any) {
      if (error.status && error.response?.headers) {
        return error.response.headers;
      }
      throw error;
    }
  }

  // Check if URL supports specific HTTP method
  async checkMethodSupport(url: string, method: string): Promise<boolean> {
    try {
      const response = await this.client.options(url);
      const allowedMethods = response.headers.allow || response.headers.Allow || '';
      return allowedMethods.toLowerCase().includes(method.toLowerCase());
    } catch {
      // If OPTIONS is not supported, assume GET is supported
      return method.toLowerCase() === 'get';
    }
  }

  // Cleanup resources
  destroy(): void {
    // Clear interceptors
    this.client.interceptors.request.clear();
    this.client.interceptors.response.clear();
  }
}