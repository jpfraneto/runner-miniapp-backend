import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CastFetchingService } from './cast-fetching.service';
import { DatabaseSeedingService } from './database-seeding.service';
import { BotReplyRecoveryService } from './bot-reply-recovery.service';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
import { User } from '../../../models/User/User.model';
import { LeaderboardHistory } from '../../../models/LeaderboardHistory/LeaderboardHistory.model';
import { UserStats } from '../../../models/UserStats/UserStats.model';
import { SocialModule } from '../../farcaster/social.module';
import { LeaderboardModule } from '../../leaderboard/leaderboard.module';
import NeynarService from '../../../utils/neynar';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RunningSession,
      User,
      LeaderboardHistory,
      UserStats,
    ]),
    SocialModule,
    LeaderboardModule,
  ],
  providers: [CastFetchingService, DatabaseSeedingService, BotReplyRecoveryService, NeynarService],
  exports: [CastFetchingService, DatabaseSeedingService, BotReplyRecoveryService],
})
export class ServicesModule {}
