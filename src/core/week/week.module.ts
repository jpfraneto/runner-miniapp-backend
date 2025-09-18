import { Module } from '@nestjs/common';
import { WeekController } from './week.controller';

@Module({
  controllers: [WeekController],
})
export class WeekModule {}
