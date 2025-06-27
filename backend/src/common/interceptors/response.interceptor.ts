import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

export interface PaginatedApiResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  message?: string;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiSuccessResponse<T> | PaginatedApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<T> | PaginatedApiResponse<T>> {
    const ctx = context.switchToHttp();
    // const response = ctx.getResponse<Response>(); // Not used in this interceptor
    
    return next.handle().pipe(
      map((data) => {
        const timestamp = new Date().toISOString();

        // Check if data has pagination metadata
        if (data && typeof data === 'object' && 'pagination' in data) {
          const paginatedData = data as any;
          return {
            success: true,
            data: paginatedData.data,
            pagination: paginatedData.pagination,
            message: paginatedData.message,
            timestamp,
          } as PaginatedApiResponse<T>;
        }

        // Check for custom message
        let message: string | undefined;
        let responseData = data;

        if (data && typeof data === 'object' && 'message' in data && 'data' in data) {
          const customData = data as any;
          message = customData.message;
          responseData = customData.data;
        }

        return {
          success: true,
          data: responseData,
          ...(message && { message }),
          timestamp,
        } as ApiSuccessResponse<T>;
      }),
    );
  }
}