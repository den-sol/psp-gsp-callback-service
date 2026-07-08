import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toUserProfile, UserProfile } from './user-profile';
import { UsersService } from './users.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    // Scope by brandId from the session — a token for brand A can never
    // resolve a user under brand B.
    const found = await this.users.findScoped(user.userId, user.brandId);
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return toUserProfile(found);
  }
}
