import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../persistence/entities/user.entity';

/** Emails are lower-cased so the `(brandId, email)` unique index is case-insensitive. */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  static normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Throws a Postgres unique violation on `(brandId, email)` conflict. */
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

  /** Brand-scoped lookup — id alone is never trusted. */
  findScoped(id: string, brandId: string): Promise<User | null> {
    return this.users.findOne({ where: { id, brandId } });
  }
}
