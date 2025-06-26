import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse, ValidationError } from '../types/api';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: any;
}

export class HttpError extends Error implements AppError {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationErrorClass extends HttpError {
  public validationErrors: ValidationError[];

  constructor(validationErrors: ValidationError[], message: string = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR', true, { validationErrors });
    this.validationErrors = validationErrors;
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(service: string, message?: string) {
    super(message || `${service} service is currently unavailable`, 503, 'SERVICE_UNAVAILABLE');
  }
}

export class RateLimitError extends HttpError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class TimeoutError extends HttpError {
  constructor(operation: string) {
    super(`${operation} timed out`, 408, 'TIMEOUT');
  }
}

export class DatabaseError extends HttpError {
  constructor(operation: string, originalError?: Error) {
    super(`Database operation failed: ${operation}`, 500, 'DATABASE_ERROR', true, {
      originalError: originalError?.message
    });
  }
}

export class ExternalServiceError extends HttpError {
  constructor(service: string, originalError?: Error) {
    super(`External service error: ${service}`, 502, 'EXTERNAL_SERVICE_ERROR', true, {
      service,
      originalError: originalError?.message
    });
  }
}

// Error handler middleware
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;

  // Log the error
  console.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('user-agent'),
    ip: req.ip
  });

  // Handle known error types
  if (isAppError(error)) {
    statusCode = error.statusCode || 500;
    errorCode = error.code || 'INTERNAL_ERROR';
    message = error.message;
    details = error.details;
  } else {
    // Handle common error types
    if (error.name === 'ValidationError') {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = 'Validation failed';
      details = parseValidationError(error);
    } else if (error.name === 'MongoError' || error.name === 'SequelizeError') {
      statusCode = 500;
      errorCode = 'DATABASE_ERROR';
      message = 'Database operation failed';
      // Don't expose database errors in production
      if (process.env.NODE_ENV !== 'production') {
        details = { originalError: error.message };
      }
    } else if (error.name === 'CastError') {
      statusCode = 400;
      errorCode = 'INVALID_ID';
      message = 'Invalid ID format';
    } else if (error.name === 'JsonWebTokenError') {
      statusCode = 401;
      errorCode = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
    } else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      errorCode = 'TOKEN_EXPIRED';
      message = 'Authentication token has expired';
    } else if (error.name === 'MulterError') {
      statusCode = 400;
      errorCode = 'FILE_UPLOAD_ERROR';
      message = handleMulterError(error as any);
    }
  }

  // Create error response
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: message,
      ...(details && { details }),
      // Include stack trace only in development
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    },
    timestamp: new Date().toISOString()
  };

  // Set security headers for error responses
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });

  res.status(statusCode).json(errorResponse);
};

// Type guard for AppError
function isAppError(error: Error | AppError): error is AppError {
  return 'statusCode' in error || 'code' in error || 'isOperational' in error;
}

// Parse validation errors
function parseValidationError(error: any): any {
  if (error.details && Array.isArray(error.details)) {
    return {
      validationErrors: error.details.map((detail: any) => ({
        field: detail.path?.join('.') || detail.key || 'unknown',
        message: detail.message,
        value: detail.context?.value
      }))
    };
  }

  if (error.errors) {
    const validationErrors: ValidationError[] = [];
    Object.keys(error.errors).forEach(key => {
      const err = error.errors[key];
      validationErrors.push({
        field: key,
        message: err.message || 'Validation failed',
        value: err.value
      });
    });
    return { validationErrors };
  }

  return undefined;
}

// Handle Multer errors
function handleMulterError(error: any): string {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File size too large';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files';
    case 'LIMIT_FIELD_KEY':
      return 'Field name too long';
    case 'LIMIT_FIELD_VALUE':
      return 'Field value too long';
    case 'LIMIT_FIELD_COUNT':
      return 'Too many fields';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field';
    case 'MISSING_FIELD_NAME':
      return 'Missing field name';
    default:
      return error.message || 'File upload error';
  }
}

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    },
    timestamp: new Date().toISOString()
  };

  res.status(404).json(errorResponse);
};

// Validation middleware for Joi schemas
export const validateSchema = (schema: any, target: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const validationErrors: ValidationError[] = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      const validationError = new ValidationErrorClass(validationErrors);
      return next(validationError);
    }

    // Replace the request data with validated and sanitized data
    req[target] = value;
    next();
  };
};

// Rate limiting error handler
export const rateLimitHandler = (req: Request, res: Response): void => {
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    },
    timestamp: new Date().toISOString()
  };

  res.status(429).json(errorResponse);
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
};

// Request timeout middleware
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const errorResponse: ApiErrorResponse = {
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'Request timeout'
          },
          timestamp: new Date().toISOString()
        };
        res.status(408).json(errorResponse);
      }
    }, timeoutMs);

    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
};