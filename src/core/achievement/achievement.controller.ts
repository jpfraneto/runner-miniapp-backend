// Dependencies
import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

// Services
import { AchievementService } from './services';

// Security
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';

/**
 * Achievement controller for streak tracking and gamification.
 *
 * This controller handles:
 * - Streak tracking and management
 * - Achievement milestones
 * - Gamification features
 * - Progress rewards
 */
@ApiTags('achievement-service')
@Controller('achievement-service')
export class AchievementController {
  constructor(private readonly achievementService: AchievementService) {}

  /**
   * Get user's achievements
   */
  @Post('/achievements')
  @UseGuards(AuthorizationGuard)
  async getAchievements(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    console.log(`getAchievements called - user: ${session.sub}`);

    try {
      console.log('Fetching achievements...');
      const achievements = await this.achievementService.getAchievements(
        session.sub.toString(),
      );
      console.log('Achievements fetched successfully');

      return hasResponse(res, { achievements });
    } catch (error) {
      console.error('Error in getAchievements:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAchievements',
        error.message,
      );
    }
  }

  /**
   * Get user's current streak
   */
  @Get('/streak')
  @UseGuards(AuthorizationGuard)
  async getStreak(@Session() session: QuickAuthPayload, @Res() res: Response) {
    console.log(`getStreak called - user: ${session.sub}`);

    try {
      console.log('Fetching streak...');
      const streak = await this.achievementService.getStreak(
        session.sub.toString(),
      );
      console.log('Streak fetched successfully');

      return hasResponse(res, { streak });
    } catch (error) {
      console.error('Error in getStreak:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getStreak',
        error.message,
      );
    }
  }

  /**
   * Update streak
   */
  @Post('/streak')
  @UseGuards(AuthorizationGuard)
  async updateStreak(
    @Session() session: QuickAuthPayload,
    @Body() streakData: any,
    @Res() res: Response,
  ) {
    console.log(`updateStreak called - user: ${session.sub}`, streakData);

    try {
      console.log('Updating streak...');
      const result = await this.achievementService.updateStreak(
        session.sub.toString(),
        streakData,
      );
      console.log('Streak updated successfully');

      return hasResponse(res, { result });
    } catch (error) {
      console.error('Error in updateStreak:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'updateStreak',
        error.message,
      );
    }
  }

  /**
   * Get milestones
   */
  @Get('/milestones')
  @UseGuards(AuthorizationGuard)
  async getMilestones(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    console.log(`getMilestones called - user: ${session.sub}`);

    try {
      console.log('Fetching milestones...');
      const milestones = await this.achievementService.getMilestones(
        session.sub.toString(),
      );
      console.log('Milestones fetched successfully');

      return hasResponse(res, { milestones });
    } catch (error) {
      console.error('Error in getMilestones:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getMilestones',
        error.message,
      );
    }
  }

  /**
   * Claim achievement reward
   */
  @Post('/claim-reward')
  @UseGuards(AuthorizationGuard)
  async claimReward(
    @Session() session: QuickAuthPayload,
    @Body() { achievementId }: { achievementId: string },
    @Res() res: Response,
  ) {
    console.log(
      `claimReward called - user: ${session.sub}, achievementId: ${achievementId}`,
    );

    try {
      console.log('Claiming reward...');
      const result = await this.achievementService.claimReward(
        session.sub.toString(),
        achievementId,
      );
      console.log('Reward claimed successfully');

      return hasResponse(res, { result });
    } catch (error) {
      console.error('Error in claimReward:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'claimReward',
        error.message,
      );
    }
  }
}
