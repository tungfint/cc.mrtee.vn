import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = request.header('x-request-id')?.slice(0, 100) || randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            event: 'http_request',
            requestId,
            method: request.method,
            path: request.originalUrl.split('?')[0],
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
            ip: request.ip,
          }),
        );
      }),
    );
  }
}
