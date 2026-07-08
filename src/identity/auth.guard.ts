import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from './session.service';

/**
 * Validates the `Authorization: Bearer <token>` header against a live session
 * and attaches `req.user` (userId, brandId, sessionId). Everything downstream
 * derives its tenant from `req.user.brandId`, never from the request body.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length).trim();
    const session = token ? await this.sessions.validate(token) : null;
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    req.user = {
      userId: session.userId,
      brandId: session.brandId,
      sessionId: session.id,
    };
    return true;
  }
}
