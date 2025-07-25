// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { SocialController } from './social.controller';

// Services
import { SocialService } from './services/social.service';
import { CastProcessorService } from './services/cast-processor.service';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

// Models
import { User } from '../../models';
import { RunningSession } from '../../models/RunningSession/RunningSession.model';
import { TrainingService } from '../training/services';
import { NotificationModule } from '../notification/notification.module';
// Note: FarcasterCast model has been removed
// import { FarcasterCast } from '../../models/FarcasterCast/FarcasterCast.model';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RunningSession]),
    AuthModule,
    UserModule,
    NotificationModule,
  ],
  controllers: [SocialController],
  providers: [SocialService, CastProcessorService, TrainingService],
  exports: [SocialService, CastProcessorService, TrainingService],
})
export class SocialModule {}
