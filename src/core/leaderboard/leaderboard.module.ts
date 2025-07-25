// src/core/leaderboard/leaderboard.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './services/leaderboard.service';
import { LeaderboardHistory } from '../../models/LeaderboardHistory/LeaderboardHistory.model';
import { RunningSession } from '../../models/RunningSession/RunningSession.model';
import { User } from '../../models/User/User.model';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeaderboardHistory, RunningSession, User]),
  ],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
