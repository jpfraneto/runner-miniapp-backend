// src/core/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { AdminController } from './admin.controller';

// Services
import { AdminService } from './services/admin.service';
import { ServicesModule } from './services/services.module';

// Models
import { User, RunningSession, NotificationQueue } from '../../models';

// External modules
import { AuthModule } from '../auth/auth.module';
import { SocialModule } from '../farcaster/social.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RunningSession, NotificationQueue]),
    AuthModule,
    SocialModule,
    LeaderboardModule,
    ServicesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
