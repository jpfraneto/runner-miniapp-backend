// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';

// Controllers
import { UserController } from './user.controller';

// Services
import { UserService } from './services';

// Models
import { User } from '../../models';
import { CompletedRun } from '../../models/CompletedRun/CompletedRun.model';

@Module({
  imports: [TypeOrmModule.forFeature([User, CompletedRun]), AuthModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
