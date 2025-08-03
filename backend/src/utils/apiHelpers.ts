import { Request, Response } from 'express';
import { ApiSuccessResponse, ApiErrorResponse, PaginatedApiResponse } from '../types/api';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}

export interface PaginationResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Success response helper
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
): void => {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
};

// Paginated response helper
export const sendPaginatedResponse = <T>(
  res: Response,
  result: PaginationResult<T>,
  message?: string,
  statusCode = 200,
): void => {
  const response: PaginatedApiResponse<T> = {
    success: true,
    data: result.data,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    ...(message && { message }),
    timestamp: new Date().toISOString(),
  };

  // Add pagination metadata to headers
  res.set({
    'X-Total-Count': result.total.toString(),
    'X-Page': result.page.toString(),
    'X-Per-Page': result.limit.toString(),
    'X-Total-Pages': result.totalPages.toString(),
    'X-Has-Next': result.hasNext.toString(),
    'X-Has-Prev': result.hasPrev.toString(),
  });

  res.status(statusCode).json(response);
};

// Error response helper
export const sendError = (
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details?: any,
): void => {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
};

// Extract pagination options from request
export const getPaginationOptions = (req: Request): PaginationOptions => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
  const offset = (page - 1) * limit;
  const orderBy = (req.query.orderBy as string) || 'created_at';
  const order = (req.query.order as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return {
    page,
    limit,
    offset,
    orderBy,
    order,
  };
};

// Create pagination result
export const createPaginationResult = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginationResult<T> => {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    data,
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
  };
};

// Validate pagination parameters
export const validatePaginationParams = (
  page?: any,
  limit?: any,
): { page: number; limit: number } => {
  const validatedPage = Math.max(1, parseInt(page) || 1);
  const validatedLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));

  return {
    page: validatedPage,
    limit: validatedLimit,
  };
};

// Extract filter options from request
export const getFilterOptions = (
  req: Request,
  allowedFilters: string[] = [],
): Record<string, any> => {
  const filters: Record<string, any> = {};

  for (const filter of allowedFilters) {
    const value = req.query[filter];
    if (value !== undefined && value !== null && value !== '') {
      // Handle different filter types
      if (filter.endsWith('_date') || filter.endsWith('Date')) {
        // Date filters
        filters[filter] = new Date(value as string);
      } else if (filter.endsWith('_id') || filter.endsWith('Id')) {
        // ID filters
        filters[filter] = value;
      } else if (typeof value === 'string') {
        // String filters - support partial matching
        filters[filter] = { $regex: value, $options: 'i' };
      } else {
        filters[filter] = value;
      }
    }
  }

  return filters;
};

// Extract search options from request
export const getSearchOptions = (
  req: Request,
  searchableFields: string[] = [],
): Record<string, any> => {
  const search = req.query.search as string;
  if (!search || !searchableFields.length) {
    return {};
  }

  // Create OR condition for searching across multiple fields
  const searchConditions = searchableFields.map(field => ({
    [field]: { $regex: search, $options: 'i' },
  }));

  return {
    $or: searchConditions,
  };
};

// Sanitize output data
export const sanitizeOutput = <T>(data: T, sensitiveFields: string[] = []): T => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeOutput(item, sensitiveFields)) as unknown as T;
  }

  const sanitized = { ...data } as any;

  // Remove sensitive fields
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }

  // Remove null and undefined values
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] === null || sanitized[key] === undefined) {
      delete sanitized[key];
    } else if (typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeOutput(sanitized[key], sensitiveFields);
    }
  });

  return sanitized;
};

// Generate cache key for responses
export const generateCacheKey = (req: Request, additionalKeys: string[] = []): string => {
  const baseKey = `${req.method}:${req.baseUrl}${req.path}`;
  const queryKeys = Object.keys(req.query)
    .sort()
    .map(key => `${key}=${req.query[key]}`)
    .join('&');
  const additional = additionalKeys.sort().join(':');

  return [baseKey, queryKeys, additional].filter(Boolean).join('|');
};

// Rate limiting key generator
export const getRateLimitKey = (req: Request, identifier?: string): string => {
  // Use custom identifier, user ID, or IP address
  const key = identifier || req.ip || 'anonymous';
  return `rate_limit:${req.method}:${req.baseUrl}:${key}`;
};

// Request validation helpers
export const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// File upload helpers
export const getFileExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

export const isAllowedFileType = (filename: string, allowedTypes: string[]): boolean => {
  const extension = getFileExtension(filename);
  return allowedTypes.includes(extension);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Date formatting helpers
export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toISOString();
};

export const isValidDate = (date: any): boolean => {
  return date instanceof Date && !isNaN(date.getTime());
};

// Request logging helper
export const logRequest = (req: Request, additionalInfo?: any): void => {
  const logData = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString(),
    ...(additionalInfo && { additional: additionalInfo }),
  };

  console.log('API Request:', JSON.stringify(logData));
};

// Performance monitoring helper
export const measurePerformance = <T>(
  operation: () => Promise<T> | T,
  operationName: string,
): Promise<{ result: T; duration: number }> => {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      console.log(`Performance: ${operationName} took ${duration}ms`);

      resolve({ result, duration });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Performance: ${operationName} failed after ${duration}ms`, error);
      reject(error);
    }
  });
};

// Response metadata helper
export const addResponseMetadata = (res: Response, metadata: Record<string, any>): void => {
  // Add custom headers for metadata
  Object.entries(metadata).forEach(([key, value]) => {
    const headerName = `X-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    res.set(headerName, String(value));
  });
};

// Health check helpers
export const createHealthCheckResponse = (checks: Record<string, boolean>): any => {
  const allHealthy = Object.values(checks).every(Boolean);

  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || 'unknown',
  };
};
