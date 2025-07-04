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
  TrainingPlan,
  CompletedRun,
  PlannedSession,
  UserStats,
  WeeklyTrainingPlan,
} from 'src/models';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TrainingPlan,
      CompletedRun,
      PlannedSession,
      UserStats,
      WeeklyTrainingPlan,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
