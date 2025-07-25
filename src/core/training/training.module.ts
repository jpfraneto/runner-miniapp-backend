// src/core/training/training.module.ts

// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { TrainingController } from './training.controller';

// Services
import { TrainingService } from './services/training.service';
import { ScreenshotProcessorService, RunnerWorkflowService } from './services';

// Models
import { User, RunningSession, NotificationQueue } from '../../models';

// Other modules
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { SocialModule } from '../farcaster/social.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RunningSession, NotificationQueue]),
    AuthModule,
    UserModule,
    SocialModule,
    NotificationModule,
  ],
  controllers: [TrainingController],
  providers: [
    TrainingService,
    ScreenshotProcessorService,
    RunnerWorkflowService,
  ],
  exports: [TrainingService, ScreenshotProcessorService, RunnerWorkflowService],
})
export class TrainingModule {}
