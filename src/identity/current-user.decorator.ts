import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../common/types/authenticated-user';

/**
 * Injects the `AuthenticatedUser` set by `AuthGuard`. Only valid on routes
 * guarded by `AuthGuard`; a missing user means the guard was omitted (a bug).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new InternalServerErrorException('Route is missing AuthGuard');
    }
    return req.user;
  },
);
