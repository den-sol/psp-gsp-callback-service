import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../persistence/entities/session.entity';
import { User } from '../persistence/entities/user.entity';

const DEFAULT_TTL_HOURS = 24;

/**
 * Opaque bearer tokens: the raw token goes to the client once (at login);
 * only its SHA-256 is stored, so a DB leak never yields a usable token.
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

  /** Null if unknown, revoked, or expired. */
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
