// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { SocialController } from './social.controller';

// Services
import { SocialService } from './services/social.service';
import { CastProcessorService } from './services/cast-processor.service';
import { AuthModule } from '../auth/auth.module'; // <- Add this

// Models
import { User } from '../../models';
import { RunningSession } from '../../models/RunningSession/RunningSession.model';
import { FarcasterCast } from '../../models/FarcasterCast/FarcasterCast.model';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RunningSession, FarcasterCast]),
    AuthModule,
  ],
  controllers: [SocialController],
  providers: [SocialService, CastProcessorService],
  exports: [SocialService, CastProcessorService],
})
export class SocialModule {}
