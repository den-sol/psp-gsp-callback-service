import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppLogger } from './app-logger.service';
import { HttpExceptionFilter } from './http-exception.filter';

/** Global cross-cutting infra: structured logger + global exception filter. */
@Global()
@Module({
  providers: [
    AppLogger,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [AppLogger],
})
export class CommonModule {}
