// src/core/leaderboard/leaderboard.controller.ts

import {
  Controller,
  Get,
  Query,
  Res,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import {
  LeaderboardService,
  Leaderboard,
} from './services/leaderboard.service';
import { hasResponse, hasError, HttpStatus } from '../../utils';

@ApiTags('leaderboard-service')
@Controller('leaderboard-service')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  /**
   * Get current week's leaderboard
   * URL: /leaderboard/current
   */
  @Get('current')
  @ApiOperation({
    summary: 'Get current week leaderboard',
    description: 'Retrieves the leaderboard for the current week',
  })
  async getCurrentLeaderboard(@Res() res: Response) {
    try {
      console.log(
        '🏆 [LeaderboardController] Getting current week leaderboard',
      );

      const leaderboard = await this.leaderboardService.getCurrentLeaderboard();
      return hasResponse(res, leaderboard);
    } catch (error) {
      console.error(
        '❌ [LeaderboardController] Failed to get current leaderboard:',
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCurrentLeaderboard',
        'Unable to retrieve current week leaderboard.',
      );
    }
  }

  /**
   * Get current week number
   * URL: /leaderboard/current-week
   */
  @Get('current-week')
  @ApiOperation({
    summary: 'Get current week number',
    description: 'Returns the current week number and timing info',
  })
  async getCurrentWeek(@Res() res: Response) {
    try {
      const currentWeek = this.leaderboardService.getCurrentWeekNumber();
      const weekRange = this.leaderboardService.getWeekRange(currentWeek);
      const nextResetTime = this.leaderboardService.getNextResetTime();
      
      return hasResponse(res, {
        currentWeek,
        weekRange,
        nextResetTime,
        currentTime: new Date().toISOString(),
      });
    } catch (error) {
      console.error('❌ [LeaderboardController] Failed to get current week:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCurrentWeek',
        'Unable to retrieve current week number.',
      );
    }
  }

  /**
   * Get leaderboard for specific week
   * URL: /leaderboard/week?weekNumber={week}&year={year}
   */
  @Get('week')
  @ApiOperation({
    summary: 'Get weekly leaderboard',
    description: 'Retrieves the leaderboard for a specific week',
  })
  async getWeeklyLeaderboard(
    @Query('weekNumber', ParseIntPipe) weekNumber: number,
    @Res() res: Response,
  ) {
    try {
      console.log(
        `🏆 [LeaderboardController] Getting leaderboard for week ${weekNumber}`,
      );

      // Validate week number (should be >= 0)
      if (weekNumber < 0) {
        throw new BadRequestException('Week number must be >= 0');
      }

      console.log(
        '🏆 [LeaderboardController] Getting leaderboard for week',
        weekNumber,
      );

      const leaderboard =
        await this.leaderboardService.getWeeklyLeaderboard(weekNumber);
      console.log('🏆 [LeaderboardController] Leaderboard:', leaderboard);

      return hasResponse(res, leaderboard);
    } catch (error) {
      console.error(
        `❌ [LeaderboardController] Failed to get weekly leaderboard for week ${weekNumber}:`,
        error,
      );

      if (error instanceof BadRequestException) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getWeeklyLeaderboard',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWeeklyLeaderboard',
        'Unable to retrieve weekly leaderboard.',
      );
    }
  }
}
