import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url, body, query, params } = request;
    
    const now = Date.now();
    
    this.logger.log(
      `🔄 ${method} ${url} - Started`,
      {
        method,
        url,
        query,
        params,
        bodySize: JSON.stringify(body).length,
      },
    );

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        this.logger.log(
          `✅ ${method} ${url} - Completed in ${duration}ms`,
        );
      }),
    );
  }
}