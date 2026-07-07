import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppLogger } from './app-logger.service';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * Cross-cutting infrastructure shared by every feature module: the structured
 * logger and the global exception filter. `@Global` so `AppLogger` can be
 * injected anywhere without re-importing.
 */
@Global()
@Module({
  providers: [
    AppLogger,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [AppLogger],
})
export class CommonModule {}
