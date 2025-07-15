// src/core/training/training.controller.ts

// Dependencies
import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';

// Services
import { TrainingService } from './services/training.service';
import { RunnerWorkflowService } from './services/runner-workflow.service';

// Security
import { AuthorizationGuard, QuickAuthPayload } from '../../security/guards';
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
  ) {}

  /**
   * Get user's current training plan
   */
  @Get('/training-plan')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get user training plan' })
  async getTrainingPlan(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const plan = await this.trainingService.getCurrentPlan(session.sub);
      return hasResponse(res, plan);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTrainingPlan',
        'Unable to retrieve training plan.',
      );
    }
  }

  /**
   * Create a new training plan
   */
  @Post('/training-plan')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Create new training plan' })
  async createTrainingPlan(
    @Session() session: QuickAuthPayload,
    @Body() planData: any,
    @Res() res: Response,
  ) {
    try {
      const plan = await this.trainingService.createPlan(session.sub, planData);
      return hasResponse(res, plan);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'createTrainingPlan',
        'Unable to create training plan.',
      );
    }
  }

  /**
   * Update training plan
   */
  @Put('/training-plan/:id')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Update training plan' })
  async updateTrainingPlan(
    @Session() session: QuickAuthPayload,
    @Param('id') planId: string,
    @Body() planData: any,
    @Res() res: Response,
  ) {
    try {
      const plan = await this.trainingService.updatePlan(
        session.sub,
        planId,
        planData,
      );
      return hasResponse(res, plan);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'updateTrainingPlan',
        'Unable to update training plan.',
      );
    }
  }

  /**
   * Generate AI-powered training plan
   */
  @Post('/training-plan/generate-ai')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Generate AI-powered training plan' })
  async generateAIPlan(
    @Session() session: QuickAuthPayload,
    @Body() preferences: any,
    @Res() res: Response,
  ) {
    try {
      const plan = await this.trainingService.generateAIPlan(
        session.sub,
        preferences,
      );
      return hasResponse(res, plan);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'generateAIPlan',
        'Unable to generate AI training plan.',
      );
    }
  }

  /**
   * Get weekly mission
   */
  @Get('/weekly-mission')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get weekly mission' })
  async getWeeklyMission(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const mission = await this.trainingService.getCurrentMission(session.sub);
      return hasResponse(res, mission);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWeeklyMission',
        'Unable to retrieve weekly mission.',
      );
    }
  }

  /**
   * Get weekly plan
   */
  @Get('/weekly-plan/:weekNumber')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get weekly plan' })
  async getWeeklyPlan(
    @Session() session: QuickAuthPayload,
    @Param('weekNumber', ParseIntPipe) weekNumber: number,
    @Res() res: Response,
  ) {
    try {
      // TODO: Implement getWeeklyPlan method in TrainingService
      const weekPlan = {
        message: 'Get weekly plan - to be implemented',
        weekNumber,
      };
      return hasResponse(res, weekPlan);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWeeklyPlan',
        'Unable to retrieve weekly plan.',
      );
    }
  }

  /**
   * Get planned session details
   */
  @Get('/planned-session/:id')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get planned session details' })
  async getPlannedSession(
    @Session() session: QuickAuthPayload,
    @Param('id', ParseIntPipe) sessionId: number,
    @Res() res: Response,
  ) {
    try {
      // TODO: Implement getPlannedSession method in TrainingService
      const sessionDetails = {
        message: 'Get planned session - to be implemented',
        sessionId,
      };
      return hasResponse(res, sessionDetails);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getPlannedSession',
        'Unable to retrieve planned session.',
      );
    }
  }

  /**
   * Get today's planned session and completion status
   */
  @Get('/runner-workflow/today')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({
    summary: "Get today's planned session and completion status",
  })
  async getTodaysMission(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      console.log(
        "🏃 [TrainingController] Getting today's mission for user:",
        session.sub,
      );
      const mission = await this.runnerWorkflowService.getTodaysMission(
        session.sub,
      );
      console.log(
        "✅ [TrainingController] Successfully retrieved today's mission",
      );
      return hasResponse(res, mission);
    } catch (error) {
      console.error(
        "❌ [TrainingController] Failed to get today's mission:",
        error,
      );
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getTodaysMission',
        "Unable to retrieve today's mission.",
      );
    }
  }

  /**
   * Upload workout screenshots and process with AI
   */
  @Post('/runner-workflow/upload-run')
  @UseGuards(AuthorizationGuard)
  @UseInterceptors(
    FilesInterceptor('screenshots', 4, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 4, // Max 4 files
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Upload workout screenshots and process with AI' })
  @ApiConsumes('multipart/form-data')
  async uploadWorkoutScreenshots(
    @Session() session: QuickAuthPayload,
    @UploadedFiles() files: any[],
    @Body() body: { plannedSessionId?: string; notes?: string },
    @Res() res: Response,
  ) {
    try {
      if (!files || files.length === 0) {
        throw new BadRequestException('At least one screenshot is required');
      }

      const plannedSessionId = body.plannedSessionId
        ? parseInt(body.plannedSessionId)
        : undefined;

      // Convert files to Buffer array for processing
      const screenshots = files.map((file) => file.buffer);

      const result = await this.runnerWorkflowService.processWorkoutSession({
        userFid: session.sub,
        plannedSessionId,
        completedDate: new Date(),
        notes: body.notes,
        screenshots,
      });

      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'uploadWorkoutScreenshots',
        error.message || 'Failed to process screenshots.',
      );
    }
  }

  /**
   * Mark planned session as completed or skipped
   */
  @Post('/runner-workflow/complete-session/:id')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Mark planned session as completed or skipped' })
  async markSessionCompleted(
    @Session() session: QuickAuthPayload,
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() body: { didComplete: boolean },
    @Res() res: Response,
  ) {
    try {
      const result = await this.runnerWorkflowService.markSessionCompleted(
        session.sub,
        sessionId,
        body.didComplete,
      );
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'markSessionCompleted',
        error.message || 'Failed to mark session.',
      );
    }
  }

  /**
   * Get user performance data and analytics
   */
  @Get('/runner-workflow/performance')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get user performance data and analytics' })
  async getUserPerformance(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const performance =
        await this.runnerWorkflowService.getUserPerformanceData(session.sub);
      return hasResponse(res, performance);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getUserPerformance',
        'Unable to retrieve performance data.',
      );
    }
  }

  /**
   * Verify and update extracted workout data
   */
  @Post('/runner-workflow/verify-run/:id')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Verify and update extracted workout data' })
  async verifyWorkoutData(
    @Session() session: QuickAuthPayload,
    @Param('id', ParseIntPipe) completedRunId: number,
    @Res() res: Response,
  ) {
    try {
      const result = await this.runnerWorkflowService.verifyWorkoutData(
        completedRunId,
        session.sub,
      );
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'verifyWorkoutData',
        error.message || 'Failed to verify workout data.',
      );
    }
  }

  /**
   * Generate share image and post to Farcaster
   */
  @Post('/runner-workflow/share-run/:id')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Generate share image and post to Farcaster' })
  async shareWorkoutAchievement(
    @Session() session: QuickAuthPayload,
    @Param('id', ParseIntPipe) completedRunId: number,
    @Res() res: Response,
  ) {
    try {
      const result = await this.runnerWorkflowService.shareWorkoutAchievement(
        session.sub,
        completedRunId,
      );
      return hasResponse(res, result);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.BAD_REQUEST,
        'shareWorkoutAchievement',
        error.message || 'Failed to share workout.',
      );
    }
  }

  /**
   * Get detailed run information by ID
   */
  @Get('/runner-workflow/runs/:id')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get detailed run information by ID' })
  async getRunDetail(
    @Session() session: QuickAuthPayload,
    @Param('id', ParseIntPipe) runId: number,
    @Res() res: Response,
  ) {
    try {
      const runDetail = await this.runnerWorkflowService.getRunDetail(
        session.sub,
        runId,
      );
      return hasResponse(res, runDetail);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getRunDetail',
          'Run not found.',
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getRunDetail',
        'Unable to retrieve run details.',
      );
    }
  }

  /**
   * Get user's workout validation status
   */
  @Get('/runner-workflow/validation-status')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get user workout validation status' })
  async getValidationStatus(
    @Session() session: QuickAuthPayload,
    @Res() res: Response,
  ) {
    try {
      const validationStatus =
        await this.runnerWorkflowService.getUserValidationStatus(session.sub);
      return hasResponse(res, validationStatus);
    } catch (error) {
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getValidationStatus',
        'Unable to retrieve validation status.',
      );
    }
  }

  /**
   * Update a workout session
   */
  @Put('/workouts/:id')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Update a workout session' })
  async updateWorkout(
    @Session() session: QuickAuthPayload,
    @Param('id', ParseIntPipe) workoutId: number,
    @Body() updateData: any,
    @Res() res: Response,
  ) {
    try {
      const updatedWorkout = await this.trainingService.updateWorkout(
        session.sub,
        workoutId,
        updateData,
      );
      return hasResponse(res, updatedWorkout);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'updateWorkout',
          'Workout not found.',
        );
      }
      if (error instanceof BadRequestException) {
        return hasError(
          res,
          HttpStatus.BAD_REQUEST,
          'updateWorkout',
          error.message,
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'updateWorkout',
        'Unable to update workout.',
      );
    }
  }

  /**
   * Get global recent workouts from all users with pagination
   */
  @Get('/workouts')
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

  /**
   * Get personal analytics for user
   */
  @Get('/progress/personal-analytics/:fid')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get comprehensive personal analytics for user' })
  async getPersonalAnalytics(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: Response,
  ) {
    try {
      const analytics = await this.trainingService.getPersonalAnalytics(fid);
      return hasResponse(res, analytics);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getPersonalAnalytics',
          'User not found.',
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getPersonalAnalytics',
        'Unable to retrieve personal analytics.',
      );
    }
  }

  /**
   * Get community context for user
   */
  @Get('/progress/community-context/:fid')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get community comparison data for user' })
  async getCommunityContext(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: Response,
  ) {
    try {
      const context = await this.trainingService.getCommunityContext(fid);
      return hasResponse(res, context);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getCommunityContext',
          'User not found.',
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getCommunityContext',
        'Unable to retrieve community context.',
      );
    }
  }

  /**
   * Get insights for user
   */
  @Get('/progress/insights/:fid')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get data-driven insights and recommendations' })
  async getInsights(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: Response,
  ) {
    try {
      const insights = await this.trainingService.getInsights(fid);
      return hasResponse(res, insights);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getInsights',
          'User not found.',
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getInsights',
        'Unable to retrieve insights.',
      );
    }
  }

  /**
   * Get weekly summary for user
   */
  @Get('/progress/weekly-summary/:fid')
  @UseGuards(AuthorizationGuard)
  @ApiOperation({ summary: 'Get weekly performance summary' })
  async getWeeklySummary(
    @Param('fid', ParseIntPipe) fid: number,
    @Res() res: Response,
  ) {
    try {
      const summary = await this.trainingService.getWeeklySummary(fid);
      return hasResponse(res, summary);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return hasError(
          res,
          HttpStatus.NOT_FOUND,
          'getWeeklySummary',
          'User not found.',
        );
      }
      return hasError(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'getWeeklySummary',
        'Unable to retrieve weekly summary.',
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
  @Get('/runs/:castHash')
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
}
