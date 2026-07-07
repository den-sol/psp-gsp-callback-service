import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { correlationStorage } from './correlation.context';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

/**
 * Functional middleware (registered via `app.use` in main.ts): adopts an
 * inbound `X-Correlation-Id` or mints one, stashes it on the request and in the
 * async-local store, and echoes it back in the response header. Downstream
 * handlers and the exception filter run inside the store's scope.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(CORRELATION_ID_HEADER)?.trim();
  const correlationId = incoming || randomUUID();

  req.correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  correlationStorage.run({ correlationId }, () => next());
}
