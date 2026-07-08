import 'reflect-metadata';
import * as argon2 from 'argon2';
import dataSource from './data-source';
import { User } from './entities/user.entity';

/**
 * Idempotent demo seed: one user per known brand, so a reviewer can log in
 * immediately after `docker compose up` without registering first. Safe to
 * re-run — existing users are left untouched.
 */
const DEMO_USERS = [
  { brandId: 'brand-a', email: 'demo-a@example.com', password: 'Password123!' },
  { brandId: 'brand-b', email: 'demo-b@example.com', password: 'Password123!' },
];

async function seed(): Promise<void> {
  await dataSource.initialize();
  try {
    const users = dataSource.getRepository(User);
    for (const { brandId, email, password } of DEMO_USERS) {
      const existing = await users.findOne({ where: { brandId, email } });
      if (existing) {
        console.log(`seed: ${brandId} / ${email} already exists, skipping`);
        continue;
      }
      await users.insert({
        brandId,
        email,
        passwordHash: await argon2.hash(password),
      });
      console.log(
        `seed: created ${brandId} / ${email} (password: ${password})`,
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('seed failed:', err);
  process.exitCode = 1;
});
