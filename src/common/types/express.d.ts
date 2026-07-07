// Augments Express's Request with fields the middleware/guards attach.
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

export {};
