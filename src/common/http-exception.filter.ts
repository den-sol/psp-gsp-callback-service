import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from './app-logger.service';
import { getCorrelationId } from './correlation.context';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId?: string;
  timestamp: string;
  path: string;
}

/**
 * Catch-all filter that renders every error as a consistent, correlated JSON
 * body. `HttpException`s (incl. `ValidationPipe`'s field-detail arrays) keep
 * their status/message; anything else becomes a 500 without leaking internals.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
        error = exception.name.replace(/Exception$/, '');
      } else if (response && typeof response === 'object') {
        const r = response as Record<string, unknown>;
        message = (r.message as string | string[]) ?? exception.message;
        error = (r.error as string) ?? exception.name.replace(/Exception$/, '');
      }
    }

    const path = req.originalUrl ?? req.url;
    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      correlationId: req.correlationId ?? getCorrelationId(),
      timestamp: new Date().toISOString(),
      path,
    };

    const summary = `${req.method} ${path} -> ${status} ${JSON.stringify(message)}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(summary, stack, HttpExceptionFilter.name);
    } else {
      this.logger.warn(summary, HttpExceptionFilter.name);
    }

    res.status(status).json(body);
  }
}
