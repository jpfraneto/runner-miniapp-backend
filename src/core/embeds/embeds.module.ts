// src/core/embeds/embeds.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmbedsController } from './embeds.controller';
import { EmbedsService } from './services';
import { User } from '../../models';
import { RunningSession } from '../../models/RunningSession/RunningSession.model';

@Module({
  imports: [TypeOrmModule.forFeature([User, RunningSession])],
  controllers: [EmbedsController],
  providers: [EmbedsService],
  exports: [EmbedsService],
})
export class EmbedsModule {}
