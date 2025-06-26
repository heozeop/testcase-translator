import { HttpClientService, HttpError } from './HttpClientService';
import { UrlValidationService } from './UrlValidationService';

export interface AccessibilityResult {
  url: string;
  accessible: boolean;
  status?: number;
  statusText?: string;
  responseTime: number;
  redirectChain?: string[];
  finalUrl?: string;
  error?: string;
  headers?: Record<string, string>;
  details: {
    dnsResolved: boolean;
    connectionEstablished: boolean;
    httpResponseReceived: boolean;
    validResponse: boolean;
    followedRedirects?: boolean;
  };
}

export interface AccessibilityCheckOptions {
  timeout?: number;
  followRedirects?: boolean;
  maxRedirects?: number;
  retryCount?: number;
  retryDelay?: number;
}

export class UrlAccessibilityService {
  private httpClient: HttpClientService;

  constructor() {
    this.httpClient = new HttpClientService();
  }

  async checkAccessibility(
    url: string, 
    options: AccessibilityCheckOptions = {}
  ): Promise<AccessibilityResult> {
    const startTime = Date.now();
    const defaults = {
      timeout: 10000,
      followRedirects: true,
      maxRedirects: 5,
      retryCount: 0,
      retryDelay: 1000
    };
    
    const config = { ...defaults, ...options };
    
    // Initial validation
    const validation = UrlValidationService.validateUrl(url);
    if (!validation.isValid || !validation.isSafe) {
      return {
        url,
        accessible: false,
        responseTime: Date.now() - startTime,
        error: validation.error,
        details: {
          dnsResolved: false,
          connectionEstablished: false,
          httpResponseReceived: false,
          validResponse: false
        }
      };
    }

    // Normalize URL for consistency
    const normalizedUrl = UrlValidationService.normalizeUrl(url);

    let attempt = 0;
    let lastError: HttpError | undefined;

    while (attempt <= config.retryCount) {
      try {
        const result = await this.performAccessibilityCheck(normalizedUrl, config);
        result.responseTime = Date.now() - startTime;
        return result;
      } catch (error: any) {
        lastError = error;
        attempt++;
        
        if (attempt <= config.retryCount) {
          console.log(`Accessibility check attempt ${attempt} failed for ${url}, retrying in ${config.retryDelay}ms...`);
          await this.delay(config.retryDelay);
        }
      }
    }

    // All attempts failed
    const responseTime = Date.now() - startTime;
    return this.createErrorResult(normalizedUrl, lastError, responseTime);
  }

  private async performAccessibilityCheck(
    url: string, 
    config: AccessibilityCheckOptions
  ): Promise<AccessibilityResult> {
    const details = {
      dnsResolved: false,
      connectionEstablished: false,
      httpResponseReceived: false,
      validResponse: false,
      followedRedirects: false
    };

    try {
      // Perform HEAD request to check accessibility
      const response = await this.httpClient.head(url, {
        timeout: config.timeout,
        followRedirects: config.followRedirects,
        maxRedirects: config.maxRedirects,
        validateStatus: (status) => status < 500 // Allow 4xx as accessible
      });

      details.dnsResolved = true;
      details.connectionEstablished = true;
      details.httpResponseReceived = true;
      details.validResponse = response.status < 400;
      details.followedRedirects = (response.redirectChain && response.redirectChain.length > 0) || false;

      const accessible = this.isStatusAccessible(response.status);

      return {
        url,
        accessible,
        status: response.status,
        statusText: response.statusText,
        responseTime: 0, // Will be set by caller
        redirectChain: response.redirectChain,
        finalUrl: response.url !== url ? response.url : undefined,
        headers: response.headers,
        details
      };

    } catch (error: any) {
      // Analyze the error to provide detailed information
      this.analyzeError(error, details);
      throw error;
    }
  }

  private analyzeError(error: HttpError, details: any): void {
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_NODATA') {
      details.dnsResolved = false;
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      details.dnsResolved = true;
      details.connectionEstablished = false;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      details.dnsResolved = true;
      details.connectionEstablished = true; // Might have connected but timed out
    } else if (error.status) {
      // HTTP error response received
      details.dnsResolved = true;
      details.connectionEstablished = true;
      details.httpResponseReceived = true;
      details.validResponse = this.isStatusAccessible(error.status);
    }
  }

  private createErrorResult(url: string, error: HttpError | undefined, responseTime: number): AccessibilityResult {
    const details = {
      dnsResolved: false,
      connectionEstablished: false,
      httpResponseReceived: false,
      validResponse: false
    };

    if (error) {
      this.analyzeError(error, details);
    }

    return {
      url,
      accessible: false,
      status: error?.status,
      statusText: error?.statusText,
      responseTime,
      error: error?.message || 'Unknown error occurred',
      headers: error?.response?.headers,
      details
    };
  }

  private isStatusAccessible(status: number): boolean {
    // Define which HTTP status codes indicate an accessible URL
    return (
      (status >= 200 && status < 300) ||  // Success
      status === 304 ||                   // Not Modified
      (status >= 300 && status < 400)     // Redirects (handled by client)
    );
  }

  async batchCheckAccessibility(
    urls: string[], 
    options: AccessibilityCheckOptions = {}
  ): Promise<AccessibilityResult[]> {
    const concurrency = 5; // Limit concurrent requests
    const results: AccessibilityResult[] = [];
    
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchPromises = batch.map(url => this.checkAccessibility(url, options));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Handle rejected promises
          const url = batch[results.length % batch.length];
          results.push({
            url,
            accessible: false,
            responseTime: 0,
            error: result.reason?.message || 'Unknown error',
            details: {
              dnsResolved: false,
              connectionEstablished: false,
              httpResponseReceived: false,
              validResponse: false
            }
          });
        }
      }
    }
    
    return results;
  }

  async checkRedirectChain(url: string): Promise<{
    finalUrl: string;
    redirectChain: string[];
    redirectCount: number;
    isCircular: boolean;
  }> {
    try {
      const response = await this.httpClient.head(url, {
        followRedirects: true,
        maxRedirects: 10
      });

      const redirectChain = response.redirectChain || [];
      const finalUrl = response.url;
      const redirectCount = redirectChain.length;
      
      // Check for circular redirects
      const uniqueUrls = new Set([url, ...redirectChain, finalUrl]);
      const isCircular = uniqueUrls.size !== (redirectCount + 2);

      return {
        finalUrl,
        redirectChain,
        redirectCount,
        isCircular
      };
    } catch (error: any) {
      return {
        finalUrl: url,
        redirectChain: [],
        redirectCount: 0,
        isCircular: false
      };
    }
  }

  async getResponseHeaders(url: string): Promise<Record<string, string> | null> {
    try {
      return await this.httpClient.getHeaders(url);
    } catch {
      return null;
    }
  }

  async checkMethodSupport(url: string, method: string): Promise<boolean> {
    try {
      return await this.httpClient.checkMethodSupport(url, method);
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup resources
  destroy(): void {
    this.httpClient.destroy();
  }
}