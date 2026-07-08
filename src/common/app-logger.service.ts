import { Injectable, LoggerService } from '@nestjs/common';
import { getCorrelationId } from './correlation.context';

type Level = 'info' | 'warn' | 'error' | 'debug' | 'verbose';

/** JSON-per-line logger; every line carries the ambient correlation id. */
@Injectable()
export class AppLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(
    level: Level,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    // JSON.stringify drops undefined fields.
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      correlationId: getCorrelationId(),
      message,
      stack,
    };
    const stream =
      level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(entry)}\n`);
  }
}
