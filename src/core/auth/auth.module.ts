// Dependencies
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { AuthController } from './auth.controller';

// Services
import { AuthService } from './services';

// Models
import { User } from '../../models';
import { RunningSession } from '../../models/RunningSession/RunningSession.model';
import { AdminGuard } from 'src/security/guards';

// Modules
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RunningSession]),
    forwardRef(() => UserModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
