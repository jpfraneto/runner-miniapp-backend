// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { AchievementController } from './achievement.controller';

// Services
import { AchievementService } from './services/achievement.service';
import { AuthModule } from '../auth/auth.module'; // <- Add this import

// Models
import { User } from '../../models';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [AchievementController],
  providers: [AchievementService],
  exports: [AchievementService],
})
export class AchievementModule {}
