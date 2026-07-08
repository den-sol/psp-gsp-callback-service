import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../persistence/entities/session.entity';
import { User } from '../persistence/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ProfileController } from './profile.controller';
import { SessionService } from './session.service';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session])],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, UsersService, SessionService, AuthGuard],
})
export class IdentityModule {}
