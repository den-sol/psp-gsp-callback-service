import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { QueryFailedError } from 'typeorm';
import { User } from '../persistence/entities/user.entity';
import { PG_UNIQUE_VIOLATION } from '../persistence/pg-errors';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { UsersService } from './users.service';

describe('AuthService', () => {
  let users: jest.Mocked<Pick<UsersService, 'create' | 'findByBrandAndEmail'>>;
  let sessions: jest.Mocked<Pick<SessionService, 'issue'>>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      create: jest.fn(),
      findByBrandAndEmail: jest.fn(),
    };
    sessions = { issue: jest.fn() };
    service = new AuthService(
      users as unknown as UsersService,
      sessions as unknown as SessionService,
    );
  });

  describe('register', () => {
    it('hashes the password (never stores plaintext) and returns a safe profile', async () => {
      let storedHash = '';
      users.create.mockImplementation(async (brandId, email, passwordHash) => {
        storedHash = passwordHash;
        return {
          id: 'u1',
          brandId,
          email,
          passwordHash,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        } as User;
      });

      const profile = await service.register({
        brandId: 'brand-a',
        email: 'user@example.com',
        password: 'sup3rsecret',
      });

      // Password was hashed with argon2, not stored raw, and verifies.
      expect(storedHash).not.toBe('sup3rsecret');
      expect(storedHash.startsWith('$argon2')).toBe(true);
      await expect(argon2.verify(storedHash, 'sup3rsecret')).resolves.toBe(true);

      // Response never leaks the hash.
      expect(profile).toEqual({
        id: 'u1',
        brandId: 'brand-a',
        email: 'user@example.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      expect(profile as Record<string, unknown>).not.toHaveProperty(
        'passwordHash',
      );
    });

    it('maps a unique-constraint violation to 409 Conflict', async () => {
      const pgErr = new QueryFailedError('insert', [], new Error('dup'));
      (pgErr as unknown as { code: string }).code = PG_UNIQUE_VIOLATION;
      users.create.mockRejectedValue(pgErr);

      await expect(
        service.register({
          brandId: 'brand-a',
          email: 'dupe@example.com',
          password: 'sup3rsecret',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates unexpected errors unchanged', async () => {
      users.create.mockRejectedValue(new Error('db down'));
      await expect(
        service.register({
          brandId: 'brand-a',
          email: 'x@example.com',
          password: 'sup3rsecret',
        }),
      ).rejects.toThrow('db down');
    });
  });

  describe('login', () => {
    async function userWithPassword(password: string): Promise<User> {
      return {
        id: 'u1',
        brandId: 'brand-a',
        email: 'user@example.com',
        passwordHash: await argon2.hash(password),
        createdAt: new Date(),
      } as User;
    }

    it('issues an access token for valid credentials', async () => {
      users.findByBrandAndEmail.mockResolvedValue(
        await userWithPassword('correct-horse'),
      );
      sessions.issue.mockResolvedValue('raw-token-xyz');

      const result = await service.login({
        brandId: 'brand-a',
        email: 'user@example.com',
        password: 'correct-horse',
      });

      expect(result).toEqual({ accessToken: 'raw-token-xyz' });
      expect(sessions.issue).toHaveBeenCalledTimes(1);
    });

    it('rejects a wrong password with 401 and issues no session', async () => {
      users.findByBrandAndEmail.mockResolvedValue(
        await userWithPassword('correct-horse'),
      );

      await expect(
        service.login({
          brandId: 'brand-a',
          email: 'user@example.com',
          password: 'wrong',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessions.issue).not.toHaveBeenCalled();
    });

    it('rejects an unknown user with the same generic 401 (no enumeration)', async () => {
      users.findByBrandAndEmail.mockResolvedValue(null);

      await expect(
        service.login({
          brandId: 'brand-a',
          email: 'ghost@example.com',
          password: 'whatever',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessions.issue).not.toHaveBeenCalled();
    });
  });
});
