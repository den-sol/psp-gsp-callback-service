import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { toUserProfile, UserProfile } from './user-profile';
import { UsersService } from './users.service';

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Current user, scoped by the session's brand (never client input)",
  })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    // Scoped by the session's brand — a brand-A token can never resolve a brand-B user.
    const found = await this.users.findScoped(user.userId, user.brandId);
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return toUserProfile(found);
  }
}
