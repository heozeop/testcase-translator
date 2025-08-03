export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ApiSuccessResponse<T = any> extends ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse extends ApiResponse {
  success: false;
  error: ApiError;
}

export interface PaginatedApiResponse<T = any> extends ApiSuccessResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
