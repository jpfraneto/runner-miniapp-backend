// src/core/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { AdminController } from './admin.controller';

// Services
import { AdminService } from './services/admin.service';

// Models
import {
  User,
  RunningSession,
  PlannedSession,
  UserStats,
  TrainingPlan,
  WeeklyTrainingPlan,
  Achievement,
  CoachInteraction,
  FarcasterCast,
  NotificationQueue,
} from '../../models';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RunningSession,
      PlannedSession,
      UserStats,
      TrainingPlan,
      WeeklyTrainingPlan,
      Achievement,
      CoachInteraction,
      FarcasterCast,
      NotificationQueue,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
