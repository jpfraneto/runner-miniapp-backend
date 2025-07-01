// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { CoachController } from './coach.controller';

// Services
import { CoachService } from './services/coach.service';

// Models
import { User, CoachInteraction } from '../../models';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, CoachInteraction]), AuthModule],
  controllers: [CoachController],
  providers: [CoachService],
  exports: [CoachService],
})
export class CoachModule {}
