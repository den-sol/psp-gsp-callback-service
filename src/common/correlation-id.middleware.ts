import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { correlationStorage } from './correlation.context';

export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

/**
 * Adopts or mints an X-Correlation-Id, echoes it on the response, and runs
 * downstream handlers inside the async-local store's scope.
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
