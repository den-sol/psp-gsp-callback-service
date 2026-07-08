import { User } from '../persistence/entities/user.entity';

/** Safe, client-facing view of a user — never exposes `passwordHash`. */
export interface UserProfile {
  id: string;
  brandId: string;
  email: string;
  createdAt: Date;
}

export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    brandId: user.brandId,
    email: user.email,
    createdAt: user.createdAt,
  };
}
