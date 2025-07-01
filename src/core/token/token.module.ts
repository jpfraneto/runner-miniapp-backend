// Dependencies
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Controllers
import { TokenController } from './token.controller';

// Services
import { TokenService } from './services/token.service';
import { AuthModule } from '../auth/auth.module'; // <- Add this

// Models
import { User } from '../../models';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [TokenController],
  providers: [TokenService],
  exports: [TokenService],
})
export class TokenModule {}
