import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../persistence/entities/session.entity';
import { User } from '../persistence/entities/user.entity';

const DEFAULT_TTL_HOURS = 24;

/**
 * Issues and validates opaque bearer tokens. The raw token is returned to the
 * client exactly once (at login); only its SHA-256 hash is stored, so a DB
 * leak never yields a usable token.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
  ) {}

  private static hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private static ttlMs(): number {
    const hours = Number(process.env.SESSION_TTL_HOURS) || DEFAULT_TTL_HOURS;
    return hours * 60 * 60 * 1000;
  }

  /** Create a session for `user`; returns the raw token to hand to the client. */
  async issue(user: User): Promise<string> {
    const rawToken = randomBytes(32).toString('base64url');
    const session = this.sessions.create({
      userId: user.id,
      brandId: user.brandId,
      tokenHash: SessionService.hash(rawToken),
      expiresAt: new Date(Date.now() + SessionService.ttlMs()),
      revokedAt: null,
    });
    await this.sessions.save(session);
    return rawToken;
  }

  /** Resolve a raw token to a live session, or null if invalid/expired/revoked. */
  async validate(rawToken: string): Promise<Session | null> {
    const session = await this.sessions.findOne({
      where: { tokenHash: SessionService.hash(rawToken) },
    });
    if (!session || session.revokedAt) return null;
    if (session.expiresAt.getTime() <= Date.now()) return null;
    return session;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessions.update({ id: sessionId }, { revokedAt: new Date() });
  }
}
