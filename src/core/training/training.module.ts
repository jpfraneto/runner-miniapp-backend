// src/core/training/training.module.ts

// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { TrainingController } from './training.controller';

// Services
import { TrainingService } from './services/training.service';
import {
  ScreenshotProcessorService,
  DigitalOceanSpacesService,
  RunnerWorkflowService,
} from './services';

// Models
import {
  User,
  TrainingPlan,
  WeeklyTrainingPlan,
  PlannedSession,
  CompletedRun,
  UserStats,
  FarcasterCast,
} from '../../models';

// Other modules
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      TrainingPlan,
      WeeklyTrainingPlan,
      PlannedSession,
      CompletedRun,
      UserStats,
      FarcasterCast,
    ]),
    AuthModule,
    UserModule,
  ],
  controllers: [TrainingController],
  providers: [
    TrainingService,
    ScreenshotProcessorService,
    DigitalOceanSpacesService,
    RunnerWorkflowService,
  ],
  exports: [
    TrainingService,
    ScreenshotProcessorService,
    DigitalOceanSpacesService,
    RunnerWorkflowService,
  ],
})
export class TrainingModule {}
