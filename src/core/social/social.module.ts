// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { SocialController } from './social.controller';

// Services
import { SocialService } from './services/social.service';
import { AuthModule } from '../auth/auth.module'; // <- Add this

// Models
import { User } from '../../models';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
