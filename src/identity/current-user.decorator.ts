import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../common/types/authenticated-user';

/** Injects the `AuthenticatedUser` set by `AuthGuard`; throws if the guard was omitted. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new InternalServerErrorException('Route is missing AuthGuard');
    }
    return req.user;
  },
);
