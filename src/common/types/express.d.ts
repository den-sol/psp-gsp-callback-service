import type { AuthenticatedUser } from './authenticated-user';

// Augments Express's Request with fields the middleware/guards attach.
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      user?: AuthenticatedUser;
      /** Validated tenant for webhook requests (set by BrandContextGuard). */
      brandId?: string;
    }
  }
}

export {};
