// src/core/admin/admin.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminService } from './services/admin.service';
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
import { Session } from '../../security/decorators';
import { HttpStatus, hasError, hasResponse } from '../../utils';
import { User, UserRoleEnum } from '../../models';
import { DatabaseSeedingService } from './services/database-seeding.service';
import { BotReplyRecoveryService } from './services/bot-reply-recovery.service';
import { CastFetchingService } from './services/cast-fetching.service';
import { SocialService } from '../farcaster/services/social.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RunningSession } from '../../models/RunningSession/RunningSession.model';

const adminFids = [16098, 473065, 7464, 248111];

@ApiTags('admin-service')
@Controller('admin-service')
@UseGuards(AuthorizationGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  private readonly AUTHORIZED_FID = 16098;

  constructor(
    private readonly adminService: AdminService,
    private readonly databaseSeedingService: DatabaseSeedingService,
    private readonly botReplyRecoveryService: BotReplyRecoveryService,
    private readonly castFetchingService: CastFetchingService,
    private readonly socialService: SocialService,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
  ) {
    console.log('AdminController initialized');
  }

  /**
   * Get all users for admin management
   */
  @Get('users')
  async getAllUsers(
    @Session() user: QuickAuthPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('search') search: string = '',
    @Res() res: Response,
  ) {
    console.log(
      `getAllUsers called - user: ${user.sub}, page: ${page}, limit: ${limit}, search: "${search}"`,
    );

    // Check admin permissions
    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getAllUsers',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching users from service...');
      const [users, count] = await this.adminService.getAllUsers(
        page,
        limit,
        search,
      );
      console.log(
        `Found ${count} total users, returning ${users.length} results`,
      );

      return hasResponse(res, {
        users,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAllUsers',
        error.message,
      );
    }
  }

  /**
   * Get user by ID
   */
  @Get('users/:id')
  async getUserById(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`getUserById called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getUserById',
        'Admin access required',
      );
    }

    try {
      console.log(`Fetching user ${id}...`);
      const userData = await this.adminService.getUserById(id);
      console.log('User found:', {
        fid: userData.fid,
        username: userData.username,
      });

      return hasResponse(res, { user: userData });
    } catch (error) {
      console.error('Error in getUserById:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserById',
        error.message,
      );
    }
  }

  /**
   * Update user
   */
  @Put('users/:id')
  async updateUser(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Body() updateData: Partial<User>,
    @Res() res: Response,
  ) {
    console.log(`updateUser called - user: ${user.sub}, id: ${id}`, updateData);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'updateUser',
        'Admin access required',
      );
    }

    try {
      console.log(`Updating user ${id}...`);
      const updatedUser = await this.adminService.updateUser(id, updateData);
      console.log('User updated successfully:', {
        fid: updatedUser.fid,
        username: updatedUser.username,
        role: updatedUser.role,
      });

      return hasResponse(res, {
        user: updatedUser,
        message: 'User updated successfully',
      });
    } catch (error) {
      console.error('Error in updateUser:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'updateUser',
        error.message,
      );
    }
  }

  /**
   * Delete user
   */
  @Delete('users/:id')
  async deleteUser(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`deleteUser called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'deleteUser',
        'Admin access required',
      );
    }

    try {
      console.log(`Deleting user ${id}...`);
      await this.adminService.deleteUser(id);
      console.log('User deleted successfully');
      return hasResponse(res, {
        message: 'User deleted successfully',
      });
    } catch (error) {
      console.error('Error in deleteUser:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'deleteUser',
        error.message,
      );
    }
  }

  /**
   * Get admin users
   */
  @Get('users/admin/list')
  async getAdminUsers(@Session() user: QuickAuthPayload, @Res() res: Response) {
    console.log(`getAdminUsers called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getAdminUsers',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching admin users...');
      const adminUsers = await this.adminService.getAdminUsers();
      console.log(`Found ${adminUsers.length} admin users`);
      return hasResponse(res, { adminUsers });
    } catch (error) {
      console.error('Error in getAdminUsers:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAdminUsers',
        error.message,
      );
    }
  }

  /**
   * Promote user to admin
   */
  @Post('users/:id/promote')
  async promoteToAdmin(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`promoteToAdmin called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'promoteToAdmin',
        'Admin access required',
      );
    }

    try {
      console.log(`Promoting user ${id} to admin...`);
      const promotedUser = await this.adminService.promoteToAdmin(id);
      console.log('User promoted successfully:', {
        fid: promotedUser.fid,
        username: promotedUser.username,
        role: promotedUser.role,
      });

      return hasResponse(res, {
        user: promotedUser,
        message: 'User promoted to admin successfully',
      });
    } catch (error) {
      console.error('Error in promoteToAdmin:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'promoteToAdmin',
        error.message,
      );
    }
  }

  /**
   * Demote admin to user
   */
  @Post('users/:id/demote')
  async demoteToUser(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`demoteToUser called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'demoteToUser',
        'Admin access required',
      );
    }

    try {
      console.log(`Demoting user ${id} to regular user...`);
      const demotedUser = await this.adminService.demoteToUser(id);
      console.log('User demoted successfully:', {
        fid: demotedUser.fid,
        username: demotedUser.username,
        role: demotedUser.role,
      });

      return hasResponse(res, {
        user: demotedUser,
        message: 'User demoted to regular user successfully',
      });
    } catch (error) {
      console.error('Error in demoteToUser:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'demoteToUser',
        error.message,
      );
    }
  }

  /**
   * Get user statistics
   */
  @Get('stats/users')
  async getUserStats(@Session() user: QuickAuthPayload, @Res() res: Response) {
    console.log(`getUserStats called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getUserStats',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching user statistics...');
      const stats = await this.adminService.getUserStats();
      console.log('User statistics retrieved:', stats);
      return hasResponse(res, { stats });
    } catch (error) {
      console.error('Error in getUserStats:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserStats',
        error.message,
      );
    }
  }

  /**
   * Get top users by points
   */
  @Get('users/top')
  async getTopUsers(
    @Session() user: QuickAuthPayload,
    @Query('limit') limit: number = 10,
    @Res() res: Response,
  ) {
    console.log(`getTopUsers called - user: ${user.sub}, limit: ${limit}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getTopUsers',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching top users...');
      const topUsers = await this.adminService.getTopUsers(limit);
      console.log(`Found ${topUsers.length} top users`);
      return hasResponse(res, { topUsers });
    } catch (error) {
      console.error('Error in getTopUsers:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTopUsers',
        error.message,
      );
    }
  }

  /**
   * Emergency data recovery endpoint - NO SAFEGUARDS
   * Completely rebuilds database from Neynar /running channel
   */
  // @Get('emergency-data-recovery')
  // @ApiOperation({
  //   summary:
  //     'EMERGENCY: Complete database recovery from Neynar (NO SAFEGUARDS)',
  //   description:
  //     'Wipes database clean (unless resume=true), fetches ALL casts from /running channel, processes chronologically starting from oldest, creates weekly leaderboards. NO AUTHENTICATION REQUIRED - USE ONLY FOR EMERGENCY RECOVERY. Use resume=true to continue from existing data.',
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Emergency data recovery completed successfully',
  // })
  // async emergencyDataRecovery(
  //   @Query('concurrency') concurrency: number = 4,
  //   @Query('resume') resume: boolean = false,
  // ) {
  //   this.logger.log('🚨 EMERGENCY DATA RECOVERY TRIGGERED - NO SAFEGUARDS');
  //   this.logger.log(`🔄 Resume mode: ${resume ? 'ENABLED' : 'DISABLED'}`);

  //   try {
  //     const result = await this.databaseSeedingService.seedCompleteDatabase(
  //       concurrency,
  //       resume,
  //     );

  //     if (result.success) {
  //       this.logger.log('🎉 Emergency data recovery completed successfully');
  //       return {
  //         success: true,
  //         message: 'Emergency data recovery completed successfully',
  //         data: result.summary,
  //         weeks: result.weeks?.map((week) => ({
  //           weekNumber: week.weekNumber,
  //           startDate: week.startDate,
  //           endDate: week.endDate,
  //           participants: week.entries.length,
  //           topRunner: week.entries[0]
  //             ? {
  //                 username: week.entries[0].username,
  //                 kilometers: week.entries[0].totalKilometers,
  //               }
  //             : null,
  //         })),
  //       };
  //     } else {
  //       this.logger.error('❌ Emergency data recovery failed:', result.error);
  //       return {
  //         success: false,
  //         message: 'Emergency data recovery failed',
  //         error: result.error,
  //         partialData: result.summary,
  //       };
  //     }
  //   } catch (error) {
  //     this.logger.error('❌ Error during emergency data recovery:', error);
  //     return {
  //       success: false,
  //       message: 'Emergency data recovery failed with exception',
  //       error: error.message,
  //     };
  //   }
  // }

  /**
   * Bot reply recovery endpoint - NO SAFEGUARDS
   * Finds missed runs by checking bot replies and processing missing parent casts
   */
  // @Get('bot-reply-recovery')
  // @UseGuards(AuthorizationGuard)
  // @ApiOperation({
  //   summary: 'EMERGENCY: Recover missed runs from bot replies (NO SAFEGUARDS)',
  //   description:
  //     'Fetches ALL bot replies from Neynar, extracts parent cast hashes, checks which are missing from database, and processes them. Preserves existing data. NO AUTHENTICATION REQUIRED.',
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Bot reply recovery completed successfully',
  // })
  // async botReplyRecovery() {
  //   this.logger.log('🤖 BOT REPLY RECOVERY TRIGGERED - NO SAFEGUARDS');

  //   try {
  //     const result = await this.botReplyRecoveryService.recoverFromBotReplies();

  //     this.logger.log('🎉 Bot reply recovery completed successfully');
  //     return {
  //       success: true,
  //       message: 'Bot reply recovery completed successfully',
  //       data: {
  //         totalRepliesFetched: result.totalRepliesFetched,
  //         parentCastsFound: result.parentCastsFound,
  //         parentCastsInDatabase: result.parentCastsInDatabase,
  //         missingParentCasts: result.missingParentCasts,
  //         parentCastsProcessed: result.parentCastsProcessed,
  //         errors: result.errors,
  //       },
  //       missingCastHashes: result.missingCastHashes,
  //       summary: `Found ${result.missingParentCasts} missing runs out of ${result.parentCastsFound} bot replies. Processed ${result.parentCastsProcessed} successfully.`,
  //     };
  //   } catch (error) {
  //     this.logger.error('❌ Bot reply recovery failed:', error);
  //     return {
  //       success: false,
  //       message: 'Bot reply recovery failed with exception',
  //       error: error.message,
  //     };
  //   }
  // }

  /**
   * Fetch recent casts recovery endpoint - NO SAFEGUARDS
   * Fetches recent casts from /running channel and processes any unprocessed ones
   */
  // @Get('fetch-recent-casts')
  // @UseGuards(AuthorizationGuard)
  // @ApiOperation({
  //   summary: 'Fetch and process recent unprocessed casts from /running channel',
  //   description:
  //     "Fetches the latest casts from /running channel, checks which haven't been processed yet, and processes them. Preserves existing data. NO AUTHENTICATION REQUIRED.",
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Recent casts recovery completed successfully',
  // })
  // async fetchRecentCasts(@Query('limit') limit: number = 50) {
  //   this.logger.log('🔄 RECENT CASTS RECOVERY TRIGGERED - NO SAFEGUARDS');

  //   try {
  //     // Step 1: Fetch recent casts from /running channel
  //     this.logger.log('📡 Fetching recent casts from /running channel...');
  //     const { newCasts } = await this.castFetchingService.scrapeNewCasts();

  //     // Step 2: Load the casts data to check what we have
  //     const castsData = await this.loadCastsFromFile();
  //     const recentCasts = castsData.slice(0, limit);

  //     this.logger.log(`📋 Found ${recentCasts.length} recent casts to check`);

  //     // Step 3: Check which casts haven't been processed yet
  //     const unprocessedCasts = [];
  //     const processedCount = 0;

  //     for (const cast of recentCasts) {
  //       const existingSession = await this.runningSessionRepository.findOne({
  //         where: { castHash: cast.castHash },
  //       });

  //       if (!existingSession) {
  //         unprocessedCasts.push(cast);
  //       }
  //     }

  //     this.logger.log(
  //       `🔍 Found ${unprocessedCasts.length} unprocessed casts out of ${recentCasts.length} recent casts`,
  //     );

  //     // Step 4: Process unprocessed casts
  //     let processedSuccessfully = 0;
  //     const errors = [];

  //     for (const cast of unprocessedCasts) {
  //       try {
  //         this.logger.log(`🔄 Processing cast ${cast.castHash}...`);

  //         // Convert to the format expected by SocialService
  //         const farcasterCastData = {
  //           hash: cast.castHash,
  //           timestamp: cast.timestamp,
  //           text: cast.text,
  //           thread_hash: cast.castHash,
  //           parent_hash: null,
  //           parent_url: null,
  //           root_parent_url: null,
  //           author: {
  //             object: 'user',
  //             fid: cast.author.fid,
  //             username: cast.author.username,
  //             display_name: cast.author.username,
  //             pfp_url: cast.author.pfp_url,
  //             custody_address: '',
  //             profile: {},
  //             follower_count: 0,
  //             following_count: 0,
  //             verifications: [],
  //           },
  //           embeds: cast.embeds,
  //           reactions: cast.reactions,
  //           replies: cast.replies,
  //           mentioned_profiles: [],
  //           mentioned_profiles_ranges: [],
  //           mentioned_channels: [],
  //           mentioned_channels_ranges: [],
  //         };

  //         // Process the cast using existing social service
  //         const webhookData = {
  //           created_at: new Date(farcasterCastData.timestamp).getTime() / 1000,
  //           type: 'cast.created',
  //           data: farcasterCastData,
  //         };
  //         await this.socialService.processCastWebhook(webhookData, 'recovery');
  //         processedSuccessfully++;
  //         this.logger.log(`✅ Successfully processed cast ${cast.castHash}`);
  //       } catch (error) {
  //         this.logger.error(
  //           `❌ Error processing cast ${cast.castHash}:`,
  //           error,
  //         );
  //         errors.push({
  //           castHash: cast.castHash,
  //           error: error.message,
  //         });
  //       }
  //     }

  //     this.logger.log('🎉 Recent casts recovery completed successfully');
  //     return {
  //       success: true,
  //       message: 'Recent casts recovery completed successfully',
  //       data: {
  //         totalRecentCastsChecked: recentCasts.length,
  //         unprocessedCastsFound: unprocessedCasts.length,
  //         castsProcessedSuccessfully: processedSuccessfully,
  //         errors: errors.length,
  //         errorDetails: errors,
  //       },
  //       summary: `Checked ${recentCasts.length} recent casts. Found ${unprocessedCasts.length} unprocessed. Successfully processed ${processedSuccessfully}.`,
  //     };
  //   } catch (error) {
  //     this.logger.error('❌ Recent casts recovery failed:', error);
  //     return {
  //       success: false,
  //       message: 'Recent casts recovery failed with exception',
  //       error: error.message,
  //     };
  //   }
  // }

  private async loadCastsFromFile(): Promise<any[]> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const castsFilePath = path.join(
        process.cwd(),
        'data',
        'running_casts.json',
      );
      const castsData = JSON.parse(await fs.readFile(castsFilePath, 'utf8'));
      return castsData;
    } catch (error) {
      this.logger.error('❌ Error loading casts from file:', error);
      return [];
    }
  }

  /**
   * Get users with notifications enabled
   */
  @Get('users/notifications/enabled')
  async getUsersWithNotifications(
    @Session() user: QuickAuthPayload,
    @Res() res: Response,
  ) {
    console.log(`getUsersWithNotifications called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getUsersWithNotifications',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching users with notifications enabled...');
      const users = await this.adminService.getUsersWithNotifications();
      console.log(`Found ${users.length} users with notifications enabled`);
      return hasResponse(res, { users });
    } catch (error) {
      console.error('Error in getUsersWithNotifications:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUsersWithNotifications',
        error.message,
      );
    }
  }

  /**
   * Disable user notifications
   */
  @Post('users/:id/disable-notifications')
  async disableUserNotifications(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(
      `disableUserNotifications called - user: ${user.sub}, id: ${id}`,
    );

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'disableUserNotifications',
        'Admin access required',
      );
    }

    try {
      console.log(`Disabling notifications for user ${id}...`);
      const updatedUser = await this.adminService.disableUserNotifications(id);
      console.log('User notifications disabled successfully:', {
        fid: updatedUser.fid,
        username: updatedUser.username,
        notificationsEnabled: updatedUser.notificationsEnabled,
      });

      return hasResponse(res, {
        user: updatedUser,
        message: 'User notifications disabled successfully',
      });
    } catch (error) {
      console.error('Error in disableUserNotifications:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'disableUserNotifications',
        error.message,
      );
    }
  }

  /**
   * Reset user's workout validation status
   */
  @Post('users/:id/reset-validation')
  async resetUserValidation(
    @Session() user: QuickAuthPayload,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    console.log(`resetUserValidation called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'resetUserValidation',
        'Admin access required',
      );
    }

    try {
      console.log(`Resetting validation status for user ${id}...`);
      const updatedUser = await this.adminService.resetUserValidationStatus(id);
      console.log('User validation status reset successfully:', {
        fid: updatedUser.fid,
        username: updatedUser.username,
        invalidWorkoutSubmissions: updatedUser.invalidWorkoutSubmissions,
        isBanned: updatedUser.isBanned,
      });

      return hasResponse(res, {
        user: updatedUser,
        message: 'User validation status reset successfully',
      });
    } catch (error) {
      console.error('Error in resetUserValidation:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'resetUserValidation',
        error.message,
      );
    }
  }

  /**
   * Get users with validation issues
   */
  @Get('users/validation-issues')
  async getUsersWithValidationIssues(
    @Session() user: QuickAuthPayload,
    @Res() res: Response,
  ) {
    console.log(`getUsersWithValidationIssues called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getUsersWithValidationIssues',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching users with validation issues...');
      const users = await this.adminService.getUsersWithValidationIssues();
      console.log(`Found ${users.length} users with validation issues`);

      return hasResponse(res, {
        users,
        count: users.length,
        message: 'Users with validation issues retrieved successfully',
      });
    } catch (error) {
      console.error('Error in getUsersWithValidationIssues:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUsersWithValidationIssues',
        error.message,
      );
    }
  }

  // ================================
  // COMPLETED RUN MANAGEMENT
  // ================================

  /**
   * Get all completed runs
   */
  @Get('completed-runs')
  async getAllCompletedRuns(
    @Session() user: QuickAuthPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Res() res: Response,
  ) {
    console.log(
      `getAllCompletedRuns called - user: ${user.sub}, page: ${page}, limit: ${limit}`,
    );

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getAllCompletedRuns',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching completed runs from service...');
      const [runs, count] = await this.adminService.getAllCompletedRuns(
        page,
        limit,
      );
      console.log(
        `Found ${count} total completed runs, returning ${runs.length} results`,
      );

      return hasResponse(res, {
        runs,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
      });
    } catch (error) {
      console.error('Error in getAllCompletedRuns:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getAllCompletedRuns',
        error.message,
      );
    }
  }

  /**
   * Get completed run by ID
   */
  @Get('completed-runs/:id')
  async getCompletedRunById(
    @Session() user: QuickAuthPayload,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    console.log(`getCompletedRunById called - user: ${user.sub}, id: ${id}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getCompletedRunById',
        'Admin access required',
      );
    }

    try {
      console.log(`Fetching completed run ${id}...`);
      const run = await this.adminService.getCompletedRunById(id);
      console.log('Completed run found:', {
        castHash: run.castHash,
        fid: run.fid,
        distanceMeters: run.distanceMeters,
        duration: run.duration,
      });

      return hasResponse(res, { run });
    } catch (error) {
      console.error('Error in getCompletedRunById:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCompletedRunById',
        error.message,
      );
    }
  }

  /**
   * Get completed run statistics
   */
  @Get('completed-runs/stats')
  async getCompletedRunStats(
    @Session() user: QuickAuthPayload,
    @Res() res: Response,
  ) {
    console.log(`getCompletedRunStats called - user: ${user.sub}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'getCompletedRunStats',
        'Admin access required',
      );
    }

    try {
      console.log('Fetching completed run statistics...');
      const stats = await this.adminService.getCompletedRunStats();
      console.log('Completed run statistics:', stats);

      return hasResponse(res, { stats });
    } catch (error) {
      console.error('Error in getCompletedRunStats:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCompletedRunStats',
        error.message,
      );
    }
  }

  // ================================
  // ADMIN MODERATION ACTIONS
  // ================================

  /**
   * Delete a run by castHash and update user stats
   */
  @Delete('runs/:castHash')
  async deleteRun(
    @Session() user: QuickAuthPayload,
    @Param('castHash') castHash: string,
    @Res() res: Response,
  ) {
    console.log(`deleteRun called - user: ${user.sub}, castHash: ${castHash}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'deleteRun',
        'Admin access required',
      );
    }

    try {
      console.log(`Deleting run ${castHash}...`);
      await this.adminService.deleteRun(castHash);
      console.log('Run deleted successfully');

      return hasResponse(res, {
        message: 'Run deleted successfully and user stats updated',
        castHash,
      });
    } catch (error) {
      console.error('Error in deleteRun:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'deleteRun',
        error.message,
      );
    }
  }

  /**
   * Ban a user by FID and delete all their runs
   */
  @Post('users/:fid/ban')
  async banUser(
    @Session() user: QuickAuthPayload,
    @Param('fid') fid: number,
    @Res() res: Response,
  ) {
    console.log(`banUser called - user: ${user.sub}, target fid: ${fid}`);

    if (!adminFids.includes(user.sub)) {
      console.log(`Access denied for user ${user.sub} - not in admin list`);
      return hasError(
        res,
        HttpStatus.FORBIDDEN,
        'banUser',
        'Admin access required',
      );
    }

    try {
      console.log(`Banning user ${fid} and deleting all runs...`);
      const bannedUser = await this.adminService.banUser(fid);
      console.log('User banned successfully:', {
        fid: bannedUser.fid,
        username: bannedUser.username,
        isBanned: bannedUser.isBanned,
        bannedAt: bannedUser.bannedAt,
      });

      return hasResponse(res, {
        user: bannedUser,
        message: 'User banned successfully and all runs deleted',
      });
    } catch (error) {
      console.error('Error in banUser:', error);
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'banUser',
        error.message,
      );
    }
  }

  // ================================
  // WEEKLY TRAINING PLAN MANAGEMENT
  // ================================

  // Note: WeeklyTrainingPlan methods have been disabled as the model was removed
  // /**
  //  * Get all weekly training plans
  //  */
  // @Get('weekly-training-plans')
  // async getAllWeeklyTrainingPlans(...) { ... }

  // /**
  //  * Get weekly training plan by ID
  //  */
  // @Get('weekly-training-plans/:id')
  // async getWeeklyTrainingPlanById(...) { ... }

  // /**
  //  * Get weekly training plan statistics
  //  */
  // @Get('weekly-training-plans/stats')
  // async getWeeklyTrainingPlanStats(...) { ... }
}
