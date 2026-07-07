import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationStore {
  correlationId: string;
}

/**
 * Ambient per-request store. The correlation-id middleware seeds it; the logger
 * (and anything else deep in the call stack) reads the current id without it
 * being threaded through every function signature.
 */
export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}
