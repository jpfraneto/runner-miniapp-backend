// Dependencies
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

// Services
import { UserService } from './services';

// Security
import {
  AdminGuard,
  AuthorizationGuard,
  QuickAuthPayload,
} from '../../security/guards';
import { Session } from '../../security/decorators';

// Models
import { User } from '../../models';

// Utils
import { hasError, hasResponse } from '../../utils';

@ApiTags('user-service')
@Controller('user-service')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Retrieves a user by their ID.
   *
   * @param {User['id']} id - The ID of the user to retrieve.
   * @returns {Promise<User>} The user with the specified ID.
   */
  @Get('/user/:id')
  getUserById(@Param('id') id: User['id']) {
    return this.userService.getById(id, [
      'id',
      'username',
      'pfpUrl',
      'runnerTokens',
      'createdAt',
    ]);
  }

  /**
   * Updates a user by their ID.
   *
   * @param {User['id']} id - The ID of the user to update.
   * @param {Partial<User>} data - The data to update the user with.
   * @returns {Promise<User>} The updated user.
   */
  @Patch('/user/:id')
  @UseGuards(AdminGuard)
  updateUser(@Param('id') id: User['id'], @Body('body') data: Partial<User>) {
    return this.userService.update(id, data);
  }

  /**
   * Deletes a user by their ID.
   *
   * @param {User['id']} id - The ID of the user to delete.
   * @returns {Promise<boolean>} Returns true if the user was successfully deleted.
   * @throws {Error} If the user with the specified ID is not found.
   */
  @Delete('/user/:id')
  @UseGuards(AdminGuard)
  deleteUser(@Param('id') id: User['id']) {
    return this.userService.delete(id);
  }

  /**
   * Gets the user's workout history
   *
   * @param {QuickAuthPayload} session - The authenticated user session from JWT
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing the user's workout history
   */
  @Get('/workouts')
  @UseGuards(AuthorizationGuard)
  async getWorkoutHistory(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const user = await this.userService.getByFid(session.sub);
      if (!user) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getWorkoutHistory',
          'User not found. Please refresh the app.',
        );
      }

      const workouts = await this.userService.getWorkoutHistory(user.id);
      return hasResponse(res, workouts);
    } catch (error) {
      console.error(
        '❌ [UserController] Error getting workout history:',
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWorkoutHistory',
        'Failed to retrieve workout history',
      );
    }
  }

  /**
   * Gets the user's fitness stats
   *
   * @param {QuickAuthPayload} session - The authenticated user session from JWT
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing the user's fitness stats
   */
  @Get('/stats')
  @UseGuards(AuthorizationGuard)
  async getFitnessStats(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const user = await this.userService.getByFid(session.sub);
      if (!user) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getFitnessStats',
          'User not found. Please refresh the app.',
        );
      }

      const stats = await this.userService.getFitnessStats(user.id);
      return hasResponse(res, stats);
    } catch (error) {
      console.error('❌ [UserController] Error getting fitness stats:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getFitnessStats',
        'Failed to retrieve fitness stats',
      );
    }
  }

  /**
   * Gets the fitness leaderboard
   *
   * @param {QuickAuthPayload} session - The authenticated user session from JWT
   * @param {number} page - The page number for pagination
   * @param {number} limit - The number of records per page
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing the fitness leaderboard
   */
  @Get('/leaderboard')
  @UseGuards(AuthorizationGuard)
  async getLeaderboard(
    @Session() session: QuickAuthPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const validatedPage = Math.max(1, Number(page) || 1);
      const validatedLimit = Math.min(100, Math.max(10, Number(limit) || 50));

      const leaderboard = await this.userService.getFitnessLeaderboard(
        validatedPage,
        validatedLimit,
        session.sub,
      );

      return hasResponse(res, leaderboard);
    } catch (error) {
      console.error('❌ [UserController] Error getting leaderboard:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getLeaderboard',
        'Failed to retrieve leaderboard',
      );
    }
  }
}
