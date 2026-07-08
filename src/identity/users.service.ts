import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../persistence/entities/user.entity';

/**
 * Owns user-row access. Emails are normalised to lower-case so the unique
 * `(brandId, email)` constraint treats `A@x.com` and `a@x.com` as one user.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  static normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Persist a new user. May throw a Postgres unique violation on conflict. */
  create(brandId: string, email: string, passwordHash: string): Promise<User> {
    const user = this.users.create({
      brandId,
      email: UsersService.normaliseEmail(email),
      passwordHash,
    });
    return this.users.save(user);
  }

  findByBrandAndEmail(brandId: string, email: string): Promise<User | null> {
    return this.users.findOne({
      where: { brandId, email: UsersService.normaliseEmail(email) },
    });
  }

  /** Look up a user scoped by tenant — id alone is never trusted. */
  findScoped(id: string, brandId: string): Promise<User | null> {
    return this.users.findOne({ where: { id, brandId } });
  }
}
