// src/core/training/training.controller.ts

// Dependencies
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Res,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';

// Services
import { TrainingService } from './services/training.service';
import { RunnerWorkflowService } from './services/runner-workflow.service';
import { SocialService } from '../farcaster/services/social.service';

// Models
import {
  RunningSession,
  RunningSessionStatus,
} from '../../models/RunningSession/RunningSession.model';

// Utils
import NeynarService from '../../utils/neynar';

// Security
import {
  AuthorizationGuard,
  BanGuard,
  QuickAuthPayload,
} from '../../security/guards';
import { Session } from '../../security/decorators';

// Utils
import { hasResponse, hasError, HttpStatus } from '../../utils';

/**
 * Training controller for RUNNER training plans and workout management.
 *
 * This controller handles:
 * - Training plan creation and management
 * - Weekly mission generation
 * - AI-powered plan generation
 * - Workout session tracking
 * - Screenshot processing and AI extraction
 * - Performance analytics
 */
@ApiTags('training-service')
@Controller('training-service')
export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly runnerWorkflowService: RunnerWorkflowService,
    private readonly socialService: SocialService,
  ) {}

  /**
   * Get global recent workouts from all users with pagination
   */
  @Get('/recent')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({
    summary: 'Get global recent workouts with pagination',
    description:
      'Retrieves the last 30 workouts from all users ordered by creation date with pagination support',
  })
  async getRecentWorkouts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '30',
    @Res() res: Response,
  ) {
    try {
      console.log('🏃 [TrainingController] Getting global recent workouts');
      const pageNumber = parseInt(page, 10);
      const limitNumber = parseInt(limit, 10);

      // Validate pagination parameters
      if (pageNumber < 1 || limitNumber < 1 || limitNumber > 100) {
        throw new BadRequestException(
          'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100.',
        );
      }

      const workouts = await this.trainingService.getRecentWorkouts(
        pageNumber,
        limitNumber,
      );

      return hasResponse(res, workouts);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getRecentWorkouts',
          error.message,
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getRecentWorkouts',
        'Unable to retrieve recent workouts.',
      );
    }
  }

  @Post('/run')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({
    summary: 'Process cast by hash and extract workout data',
    description:
      'Fetches a cast from Neynar by hash, processes it through the workout pipeline, and adds it to the database. This endpoint is useful for processing individual casts that may have been missed by the regular webhook flow.',
  })
  async postRunningSessionByCastHash(
    @Body() { cast_hash }: { cast_hash: string },
    @Res() res: Response,
  ) {
    try {
      console.log(
        '🏃 [TrainingController] Processing cast by hash:',
        cast_hash,
      );

      // Validate input
      if (!cast_hash) {
        throw new BadRequestException('Cast hash is required');
      }

      // Validate cast hash format (should start with 0x and be 40-42 characters)
      if (!/^0x[a-fA-F0-9]{40,42}$/.test(cast_hash)) {
        throw new BadRequestException(
          'Invalid cast hash format. Must start with 0x and be 40-42 characters long.',
        );
      }

      // Check if cast already exists in database
      console.log('🔍 Checking if cast already exists in database...');
      const existingSession =
        await this.trainingService.getRunningSessionByCastHash(cast_hash);
      if (existingSession) {
        console.log('⚠️ Cast already exists in database, skipping processing');
        return hasError(
          res,
          HttpStatus.CONFLICT,
          'postRunningSessionByCastHash',
          'Cast already processed and exists in database',
        );
      }
      console.log('✅ Cast not found in database, proceeding with processing');

      // Fetch cast from Neynar
      console.log('🔍 Fetching cast from Neynar...');
      const neynar = new NeynarService();
      const castData = await neynar.getCastByHash(cast_hash);
      console.log('✅ Cast fetched successfully from Neynar');

      // Convert cast to webhook format
      const webhookData = this.convertNeynarCastToWebhookFormat(castData);

      // Create initial running session with PROCESSING status
      console.log('💾 Creating initial running session...');
      await this.createInitialRunningSession(castData.author.fid, cast_hash);

      // Process through social service pipeline
      console.log('⚙️ Processing cast through pipeline...');
      const processResult = await this.socialService.processCastWebhook(
        {
          created_at: new Date(castData.timestamp).getTime(),
          type: 'cast.created',
          data: webhookData,
        },
        'seed', // Use 'seed' mode for admin processing
      );

      console.log('🚀 Cast processing result:', processResult);

      // Update running session status based on processing result
      const updatedStatus =
        processResult.processed && processResult.isWorkoutImage
          ? RunningSessionStatus.COMPLETED
          : RunningSessionStatus.FAILED;

      await this.updateRunningSessionStatus(
        cast_hash,
        updatedStatus,
        processResult,
      );

      return hasResponse(res, {
        success: true,
        cast_hash,
        author: {
          fid: castData.author.fid,
          username: castData.author.username,
        },
        processed: processResult.processed,
        isWorkoutImage: processResult.isWorkoutImage,
        confidence: processResult.confidence,
        message: processResult.processed
          ? 'Cast processed successfully and workout data extracted!'
          : 'Cast processed but no workout detected or processing failed',
        replyHash: processResult.replyHash,
        run: processResult.run || {
          distanceMeters: 0,
          duration: 0,
        },
        status: updatedStatus,
      });
    } catch (error) {
      console.error(
        '❌ [TrainingController] Error processing cast by hash:',
        error,
      );

      // Handle BadRequestException
      if (error instanceof BadRequestException) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'postRunningSessionByCastHash',
          error.message,
        );
      }

      // Handle specific Neynar errors
      if (
        error.message?.includes('Cast not found') ||
        error.message?.includes('not found')
      ) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'postRunningSessionByCastHash',
          'Cast not found on Farcaster',
        );
      }

      // Handle user creation errors
      if (error.message?.includes('Failed to create user from Neynar')) {
        return hasError(
          res,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'postRunningSessionByCastHash',
          'Failed to create user account from Farcaster data',
        );
      }

      // Update running session status to FAILED if it exists
      try {
        await this.updateRunningSessionStatus(
          cast_hash,
          RunningSessionStatus.FAILED,
          { error: error.message },
        );
      } catch (updateError) {
        console.error('❌ Failed to update session status:', updateError);
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'postRunningSessionByCastHash',
        'An unexpected error occurred during cast processing',
      );
    }
  }

  /**
   * Get leaderboard with aggregated user statistics
   */
  @Get('/leaderboard')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({
    summary: 'Get leaderboard with aggregated user statistics',
    description:
      'Retrieves user statistics for the leaderboard with sorting and limiting options. Supports weekly and all-time periods.',
  })
  async getLeaderboard(
    @Query('sortBy') sortBy: string = 'totalDistance',
    @Query('limit') limit: string = '50',
    @Query('timePeriod') timePeriod: string = 'all-time',
    @Res() res: Response,
  ) {
    try {
      console.log('🏃 [TrainingController] Getting leaderboard data');
      const limitNumber = parseInt(limit, 10);

      // Validate timePeriod parameter
      const validTimePeriod = timePeriod === 'weekly' ? 'weekly' : 'all-time';

      // Validate parameters
      const allowedSortBy = ['totalDistance', 'totalWorkouts', 'totalTime'];
      if (!allowedSortBy.includes(sortBy)) {
        throw new BadRequestException(
          'Invalid sortBy parameter. Must be one of: totalDistance, totalWorkouts, totalTime',
        );
      }

      if (limitNumber < 1 || limitNumber > 100) {
        throw new BadRequestException(
          'Invalid limit parameter. Must be between 1 and 100.',
        );
      }

      const leaderboard = await this.trainingService.getLeaderboard(
        sortBy,
        limitNumber,
        validTimePeriod,
      );

      return hasResponse(res, leaderboard);
    } catch (error) {
      if (error instanceof BadRequestException) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'getLeaderboard',
          error.message,
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getLeaderboard',
        'Unable to retrieve leaderboard data.',
      );
    }
  }

  /**
   * Get running session by cast hash
   */
  @Get('/run/:castHash')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({
    summary: 'Get running session by cast hash',
    description:
      'Retrieves a running session and its details using the associated cast hash',
  })
  async getRunningSessionByCastHash(
    @Param('castHash') castHash: string,
    @Res() res: Response,
  ) {
    try {
      console.log(
        '🏃 [TrainingController] Getting running session by cast hash:',
        castHash,
      );

      const runningSession =
        await this.trainingService.getRunningSessionByCastHash(castHash);

      if (!runningSession) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getRunningSessionByCastHash',
          'Running session not found for this cast hash.',
        );
      }

      return hasResponse(res, runningSession);
    } catch (error) {
      console.error(
        '❌ [TrainingController] Failed to get running session by cast hash:',
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getRunningSessionByCastHash',
        'Unable to retrieve running session.',
      );
    }
  }

  /**
   * Verify and process a shared cast from the miniapp
   */
  @Post('/verify-and-process-cast')
  @UseGuards(BanGuard)
  @ApiOperation({
    summary: 'Verify and process a shared cast from the miniapp',
    description:
      'Receives a cast hash from the miniapp, verifies the cast was actually shared by the authenticated user, and processes it for workout data extraction',
  })
  async verifyAndProcessCast(
    @Session() user: QuickAuthPayload,
    @Body() { castHash }: { castHash: string },
    @Res() res: Response,
  ): Promise<Response> {
    try {
      console.log(
        `🔍 [VerifyAndProcessCast] User FID: ${user.sub}, Cast: ${castHash}`,
      );

      // Validate input
      if (!castHash) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'verifyAndProcessCast',
          'Cast hash is required',
        );
      }

      // Validate cast hash format (should start with 0x and be 40-42 characters)
      if (!/^0x[a-fA-F0-9]{40,42}$/.test(castHash)) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'verifyAndProcessCast',
          'Invalid cast hash format',
        );
      }

      console.log('📦 CAST HASH', castHash);

      // Try to create initial running session with PROCESSING status to prevent race conditions
      // If this cast is already being processed, this will throw an error
      try {
        await this.createInitialRunningSession(user.sub, castHash);
        console.log(
          '💾 Created initial running session with PROCESSING status',
        );
      } catch (error) {
        if (error.message?.includes('already exists')) {
          console.log(
            '⚠️ Cast is already being processed by another flow - skipping',
          );
          return hasError(
            res,
            HttpStatus.CONFLICT,
            'verifyAndProcessCast',
            'Cast is already being processed',
          );
        }

        // Handle user not found error
        if (error.status === 404 && error.message?.includes('User with FID')) {
          console.log('⚠️ User not found - cannot create running session');
          return hasError(res, HttpStatus.NOT_FOUND, 'verifyAndProcessCast', {
            errorType: 'USER_NOT_FOUND',
            code: 'USER_NOT_EXISTS',
            userMessage:
              'User account not found. Please create an account first.',
          });
        }

        throw error; // Re-throw other errors
      }

      // Verify cast with Neynar (with retry logic)
      const neynar = new NeynarService();
      const castData = await this.verifyCastWithRetry(
        neynar,
        castHash,
        user.sub,
      );

      console.log('✅ Cast verification successful');

      // Process the cast using the social service logic
      const processResult = await this.socialService.processCastWebhook(
        {
          created_at: Date.now(),
          type: 'cast.created',
          data: this.convertNeynarCastToWebhookFormat(castData),
        },
        'prod',
      );

      console.log('🚀 Cast processing result:', processResult);

      // Update running session status based on processing result
      const updatedStatus =
        processResult.success && processResult.processed
          ? RunningSessionStatus.COMPLETED
          : RunningSessionStatus.FAILED;

      await this.updateRunningSessionStatus(
        castHash,
        updatedStatus,
        processResult,
      );

      return hasResponse(res, {
        verified: true,
        processed: processResult.processed,
        isWorkoutImage: processResult.isWorkoutImage,
        confidence: processResult.confidence,
        message: processResult.processed
          ? 'Cast verified and workout processed successfully!'
          : 'Cast verified but no workout detected or processing failed',
        replyHash: processResult.replyHash,
        run: processResult.run || {
          distanceMeters: 0,
          duration: 0,
        },
      });
    } catch (error) {
      console.error('❌ [VerifyAndProcessCast] Error:', error);

      // Handle user not found error (may also occur during processing)
      if (error.status === 404 && error.message?.includes('User with FID')) {
        console.log(
          '⚠️ User not found during processing - cannot create running session',
        );
        return hasError(res, HttpStatus.NOT_FOUND, 'verifyAndProcessCast', {
          errorType: 'USER_NOT_FOUND',
          code: 'USER_NOT_EXISTS',
          userMessage:
            'User account not found. Please create an account first.',
        });
      }

      // Update running session status to FAILED (only if session might exist)
      if (error.status !== 400 && error.status !== 404) {
        try {
          await this.updateRunningSessionStatus(
            castHash,
            RunningSessionStatus.FAILED,
            { error: error.message },
          );
        } catch (updateError) {
          console.error('❌ Failed to update session status:', updateError);
        }
      }

      // Handle specific Neynar errors
      if (error.message?.includes('Cast not found')) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'verifyAndProcessCast',
          'Cast not found on Farcaster',
        );
      }

      if (error.message?.includes('not posted by the authenticated user')) {
        return hasError(
          res,
          HttpStatus.FORBIDDEN,
          'verifyAndProcessCast',
          'Cast was not posted by the authenticated user',
        );
      }

      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'verifyAndProcessCast',
        'An unexpected error occurred during cast verification and processing',
      );
    }
  }

  /**
   * Creates an initial running session with PENDING status
   */
  private async createInitialRunningSession(
    fid: number,
    castHash: string,
  ): Promise<RunningSession> {
    // Use TrainingService to create the initial session
    return await this.trainingService.createInitialRunningSession(
      fid,
      castHash,
      RunningSessionStatus.PROCESSING,
    );
  }

  /**
   * Verifies the cast with retry logic and validates ownership
   */
  private async verifyCastWithRetry(
    neynar: NeynarService,
    castHash: string,
    userFid: number,
  ): Promise<any> {
    try {
      const castData = await neynar.getCastByHash(castHash);

      // Verify the cast author FID matches the user
      if (castData.author.fid !== userFid) {
        throw new Error('Cast was not posted by the authenticated user');
      }

      console.log(
        `✅ Cast verification successful - Author FID ${castData.author.fid} matches user FID ${userFid}`,
      );

      return castData;
    } catch (error) {
      console.error('❌ Cast verification failed:', error);
      throw error;
    }
  }

  /**
   * Converts Neynar Cast format to the webhook format expected by SocialService
   */
  private convertNeynarCastToWebhookFormat(castData: any): any {
    return {
      hash: castData.hash,
      timestamp: castData.timestamp,
      text: castData.text || '',
      thread_hash: castData.thread_hash || castData.hash,
      parent_hash: castData.parent_hash,
      parent_url: castData.parent_url,
      root_parent_url: castData.root_parent_url,
      author: {
        object: 'user',
        fid: castData.author.fid,
        username: castData.author.username,
        display_name: castData.author.display_name,
        pfp_url: castData.author.pfp_url,
        custody_address: castData.author.custody_address || '',
        profile: castData.author.profile || {},
        follower_count: castData.author.follower_count || 0,
        following_count: castData.author.following_count || 0,
        verifications: castData.author.verifications || [],
        power_badge: castData.author.power_badge || false,
      },
      embeds: castData.embeds || [],
      reactions: {
        likes_count: castData.reactions?.likes_count || 0,
        recasts_count: castData.reactions?.recasts_count || 0,
        likes: castData.reactions?.likes || [],
        recasts: castData.reactions?.recasts || [],
      },
      replies: {
        count: castData.replies?.count || 0,
      },
      mentioned_profiles: castData.mentioned_profiles || [],
      mentioned_profiles_ranges: castData.mentioned_profiles_ranges || [],
      mentioned_channels: castData.mentioned_channels || [],
      mentioned_channels_ranges: castData.mentioned_channels_ranges || [],
    };
  }

  /**
   * Updates the running session status after processing
   */
  private async updateRunningSessionStatus(
    castHash: string,
    status: RunningSessionStatus,
    processResult: any,
  ): Promise<void> {
    try {
      await this.trainingService.updateRunningSessionStatus(
        castHash,
        status,
        processResult,
      );
      console.log(`📝 Updated running session ${castHash} status to ${status}`);
    } catch (error) {
      console.error('❌ Failed to update running session status:', error);
      throw error;
    }
  }
}
