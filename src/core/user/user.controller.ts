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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
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
   * Retrieves a user by their FID with their last 10 training sessions.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to retrieve.
   * @returns {Promise<User>} The user with the specified FID and recent sessions.
   */
  @Get('/user/:fid')
  async getUserById(@Param('fid') fid: User['fid'], @Res() res: Response) {
    try {
      const user = await this.userService.getByFid(fid);
      if (!user) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getUserById',
          'User not found',
        );
      }

      // Get user's last 10 training sessions
      const recentSessions = await this.userService.getWorkoutHistory(
        fid,
        1,
        10,
      );

      const userWithSessions = {
        user,
        data: recentSessions,
      };

      return hasResponse(res, userWithSessions);
    } catch (error) {
      console.error('❌ [UserController] Error getting user by FID:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserById',
        'Failed to retrieve user information',
      );
    }
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
   * Gets the user's workout history with pagination
   *
   * @param {QuickAuthPayload} session - The authenticated user session from JWT
   * @param {string} page - The page number for pagination
   * @param {string} limit - The number of records per page
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing the user's workout history
   */
  @Get('/workouts')
  @UseGuards(AuthorizationGuard)
  async getWorkoutHistory(
    @Session() session: QuickAuthPayload,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '30',
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

      const pageNumber = parseInt(page, 10);
      const limitNumber = parseInt(limit, 10);

      // Validate pagination parameters
      if (pageNumber < 1 || limitNumber < 1 || limitNumber > 100) {
        throw new BadRequestException(
          'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100.',
        );
      }

      const workouts = await this.userService.getWorkoutHistory(
        user.fid,
        pageNumber,
        limitNumber,
      );
      return hasResponse(res, workouts);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getWorkoutHistory',
          error.message,
        );
      }
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

      const stats = await this.userService.getFitnessStats(user.fid);
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

  /**
   * Gets a user's profile including stats and recent workouts
   *
   * @param {string} fid - The Farcaster user ID (fid)
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing the user's profile
   */
  @Get('/:fid')
  @ApiOperation({
    summary: 'Get user profile with stats and recent workouts',
    description:
      'Retrieves a user profile including stats and recent workouts (max 16)',
  })
  async getUserProfile(@Param('fid') fid: string, @Res() res: Response) {
    try {
      const userFid = parseInt(fid, 10);
      if (isNaN(userFid)) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getUserProfile',
          'Invalid user ID format',
        );
      }

      const profile = await this.userService.getUserProfile(userFid);
      if (!profile) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getUserProfile',
          'User not found',
        );
      }

      return hasResponse(res, profile);
    } catch (error) {
      console.error('❌ [UserController] Error getting user profile:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserProfile',
        'Failed to retrieve user profile',
      );
    }
  }

  /**
   * Gets all users' workout history (public endpoint)
   *
   * @param {number} page - The page number for pagination
   * @param {number} limit - The number of records per page
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing all users' workout history
   */
  @Get('/all-workouts')
  async getAllUsersWorkouts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Res() res: Response,
  ): Promise<Response> {
    try {
      console.log(
        '📄 [UserController] Getting all workouts - Page:',
        page,
        'Limit:',
        limit,
      );

      const pageNumber = parseInt(page, 10);
      const limitNumber = parseInt(limit, 10);

      // Validate pagination parameters
      if (pageNumber < 1 || limitNumber < 1 || limitNumber > 100) {
        throw new BadRequestException(
          'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100.',
        );
      }

      console.log(
        '✨ [UserController] Validated params - Page:',
        pageNumber,
        'Limit:',
        limitNumber,
      );

      const workouts = await this.userService.getAllUsersWorkouts(
        pageNumber,
        limitNumber,
      );

      console.log(
        '✅ [UserController] Successfully retrieved',
        workouts.workouts.length,
        'workouts',
      );
      return hasResponse(res, workouts);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getAllUsersWorkouts',
          error.message,
        );
      }
      console.error('❌ [UserController] Error getting all workouts:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAllUsersWorkouts',
        'Failed to retrieve workouts',
      );
    }
  }
}
