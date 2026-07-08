import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationStore {
  correlationId: string;
}

/**
 * Ambient per-request store: the middleware seeds it, the logger and filter
 * read it without threading the id through every signature.
 */
export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}
