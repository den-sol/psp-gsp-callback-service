import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { isUniqueViolation } from '../persistence/pg-errors';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionService } from './session.service';
import { toUserProfile, UserProfile } from './user-profile';
import { UsersService } from './users.service';

/** Login failures share one generic 401 to prevent user enumeration. */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  async register(dto: RegisterDto): Promise<UserProfile> {
    const passwordHash = await argon2.hash(dto.password);
    try {
      const user = await this.users.create(
        dto.brandId,
        dto.email,
        passwordHash,
      );
      return toUserProfile(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'A user with this email already exists for this brand',
        );
      }
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.users.findByBrandAndEmail(dto.brandId, dto.email);
    // Unknown user and wrong password fall through to the same rejection.
    const ok = !!user && (await argon2.verify(user.passwordHash, dto.password));
    if (!ok || !user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const accessToken = await this.sessions.issue(user);
    return { accessToken };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }
}
