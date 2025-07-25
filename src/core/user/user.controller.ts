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
  BanGuard,
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
   * If the user doesn't exist, creates them from Neynar data.
   *
   * @param {User['fid']} fid - The Farcaster ID of the user to retrieve.
   * @returns {Promise<User>} The user with the specified FID and recent sessions.
   */
  @Get('/:fid')
  async getUserById(@Param('fid') fid: User['fid'], @Res() res: Response) {
    try {
      const recentSessions = await this.userService.getWorkoutHistory(
        fid,
        1,
        200,
      );

      return hasResponse(res, recentSessions);
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
   * Bans a user by their FID. Only accessible by FID 16098.
   *
   * @param {QuickAuthPayload} session - The authenticated admin session
   * @param {string} targetFid - The FID of the user to ban
   * @param {Object} body - Request body containing optional reason
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing the banned user info
   */
  @Post('/ban/:targetFid')
  @UseGuards(BanGuard)
  async banUser(
    @Session() session: QuickAuthPayload,
    @Param('targetFid') targetFid: string,
    @Body() body: { reason?: string },
    @Res() res: Response,
  ) {
    try {
      const targetFidNumber = parseInt(targetFid, 10);

      if (isNaN(targetFidNumber)) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'banUser',
          'Invalid FID format',
        );
      }

      const bannedUser = await this.userService.banUser(
        targetFidNumber,
        session.sub,
        body.reason,
      );

      return hasResponse(res, {
        message: `User ${bannedUser.username} (FID: ${targetFidNumber}) has been banned`,
        user: {
          fid: bannedUser.fid,
          username: bannedUser.username,
          isBanned: bannedUser.isBanned,
          bannedAt: bannedUser.bannedAt,
        },
      });
    } catch (error) {
      console.error('❌ [UserController] Error banning user:', error);

      if (error.message.includes('Unauthorized')) {
        return hasError(res, HttpStatus.FORBIDDEN, 'banUser', error.message);
      }

      if (
        error.message.includes('not found') ||
        error.message.includes('already banned')
      ) {
        return hasError(res, HttpStatus.BAD_REQUEST, 'banUser', error.message);
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'banUser',
        'Failed to ban user',
      );
    }
  }

  /**
   * Unbans a user by their FID. Only accessible by FID 16098.
   *
   * @param {QuickAuthPayload} session - The authenticated admin session
   * @param {string} targetFid - The FID of the user to unban
   * @param {Response} res - The response object
   * @returns {Promise<Response>} The response containing the unbanned user info
   */
  @Post('/unban/:targetFid')
  @UseGuards(BanGuard)
  async unbanUser(
    @Session() session: QuickAuthPayload,
    @Param('targetFid') targetFid: string,
    @Res() res: Response,
  ) {
    try {
      const targetFidNumber = parseInt(targetFid, 10);

      if (isNaN(targetFidNumber)) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'unbanUser',
          'Invalid FID format',
        );
      }

      const unbannedUser = await this.userService.unbanUser(
        targetFidNumber,
        session.sub,
      );

      return hasResponse(res, {
        message: `User ${unbannedUser.username} (FID: ${targetFidNumber}) has been unbanned`,
        user: {
          fid: unbannedUser.fid,
          username: unbannedUser.username,
          isBanned: unbannedUser.isBanned,
          bannedAt: unbannedUser.bannedAt,
        },
      });
    } catch (error) {
      console.error('❌ [UserController] Error unbanning user:', error);

      if (error.message.includes('Unauthorized')) {
        return hasError(res, HttpStatus.FORBIDDEN, 'unbanUser', error.message);
      }

      if (
        error.message.includes('not found') ||
        error.message.includes('not banned')
      ) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'unbanUser',
          error.message,
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'unbanUser',
        'Failed to unban user',
      );
    }
  }
}
