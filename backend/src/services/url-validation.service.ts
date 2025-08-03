import { Injectable } from '@nestjs/common';

export interface UrlValidationResult {
  url: string;
  normalizedUrl: string;
  isValid: boolean;
  isSafe: boolean;
  warnings?: string[];
  accessibility: {
    accessible: boolean;
    status?: number;
    statusText?: string;
    finalUrl?: string;
    redirectChain?: string[];
    error?: string;
    details?: {
      headers?: {
        contentType?: string | null;
        server?: string | null;
        lastModified?: string | null;
      };
    };
  };
}

@Injectable()
export class UrlValidationService {
  async validateUrl(url: string, options?: { timeout?: number }): Promise<UrlValidationResult> {
    try {
      // Basic URL validation
      new URL(url);

      // Fetch the URL to check if it's accessible
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options?.timeout || 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Testcase-Translator-Bot/1.0',
        },
      });

      clearTimeout(timeoutId);

      return {
        url,
        normalizedUrl: response.url,
        isValid: true,
        isSafe: true,
        accessibility: {
          accessible: response.ok,
          status: response.status,
          statusText: response.statusText,
          finalUrl: response.url,
          redirectChain: response.redirected ? [url, response.url] : [],
          details: {
            headers: {
              contentType: response.headers.get('content-type'),
              server: response.headers.get('server'),
              lastModified: response.headers.get('last-modified'),
            },
          },
        },
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        return {
          url,
          normalizedUrl: url,
          isValid: false,
          isSafe: false,
          warnings: ['Invalid URL format'],
          accessibility: {
            accessible: false,
            error: 'Invalid URL format',
          },
        };
      }

      if ((error as any).name === 'AbortError') {
        return {
          url,
          normalizedUrl: url,
          isValid: true,
          isSafe: true,
          warnings: ['Request timeout'],
          accessibility: {
            accessible: false,
            error: 'Request timeout',
          },
        };
      }

      return {
        url,
        normalizedUrl: url,
        isValid: true,
        isSafe: true,
        warnings: [(error as Error).message || 'Failed to access URL'],
        accessibility: {
          accessible: false,
          error: (error as Error).message || 'Failed to access URL',
        },
      };
    }
  }
}
