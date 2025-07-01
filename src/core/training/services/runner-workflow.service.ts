// src/core/training/services/runner-workflow.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../../../models/User/User.model';
import { TrainingPlan } from '../../../models/TrainingPlan/TrainingPlan.model';
import { WeeklyTrainingPlan } from '../../../models/WeeklyTrainingPlan/WeeklyTrainingPlan.model';
import { PlannedSession } from '../../../models/PlannedSession/PlannedSession.model';
import {
  CompletedRun,
  RunStatusEnum,
} from '../../../models/CompletedRun/CompletedRun.model';
import { UserStats } from '../../../models/UserStats/UserStats.model';
import { FarcasterCast } from '../../../models/FarcasterCast/FarcasterCast.model';
import {
  ScreenshotProcessorService,
  ExtractedWorkoutData,
} from './screenshot-processor.service';
import { DigitalOceanSpacesService } from './digital-ocean-spaces.service';
import { v4 as uuidv4 } from 'uuid';

// DTOs
export interface WorkoutSessionData {
  userFid: number; // Farcaster ID
  plannedSessionId?: number;
  completedDate: Date;
  notes?: string;
  screenshots: Buffer[];
}

export interface ProcessedWorkoutResult {
  completedRun: CompletedRun;
  extractedData: ExtractedWorkoutData;
  screenshotUrls: string[];
  isPersonalBest: boolean;
  personalBestType?: string;
}

export interface RunDetailResponse {
  run: {
    id: number;
    status: string;
    completedDate: string;
    actualDistance: number;
    actualTime: number;
    actualPace: string;
    calories: number;
    avgHeartRate: number;
    maxHeartRate: number;
    screenshotUrls: string[];
    verified: boolean;
    notes: string;
    isPersonalBest: boolean;
    personalBestType?: string;
    createdAt: string;
  };
  extractedData: {
    runningApp: string;
    confidence: number;
    weather?: {
      temperature?: number;
      conditions?: string;
    };
    route?: {
      name?: string;
      type?: string;
    };
    splits?: Array<{
      distance: number;
      time: string;
      pace: string;
    }>;
    rawText: string[];
  };
  achievements: {
    isPersonalBest: boolean;
    personalBestType?: string;
    badges: string[];
    milestones: string[];
  };
  shareData: {
    shareText: string;
    shareImageUrl?: string;
    socialStats?: {
      likes: number;
      shares: number;
      comments: number;
    };
  };
  context?: {
    plannedSession?: {
      targetDistance: number;
      targetTime: number;
      targetPace: string;
      instructions: string;
    };
    performanceVsTarget?: {
      distanceComparison: 'above' | 'below' | 'exact';
      timeComparison: 'faster' | 'slower' | 'exact';
      overallRating: 'excellent' | 'good' | 'needs_improvement';
    };
  };
}

@Injectable()
export class RunnerWorkflowService {
  private readonly logger = new Logger(RunnerWorkflowService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TrainingPlan)
    private readonly trainingPlanRepo: Repository<TrainingPlan>,
    @InjectRepository(WeeklyTrainingPlan)
    private readonly weeklyTrainingPlanRepo: Repository<WeeklyTrainingPlan>,
    @InjectRepository(PlannedSession)
    private readonly plannedSessionRepo: Repository<PlannedSession>,
    @InjectRepository(CompletedRun)
    private readonly completedRunRepo: Repository<CompletedRun>,
    @InjectRepository(UserStats)
    private readonly userStatsRepo: Repository<UserStats>,
    @InjectRepository(FarcasterCast)
    private readonly farcasterCastRepo: Repository<FarcasterCast>,
    private readonly screenshotProcessor: ScreenshotProcessorService,
    private readonly digitalOceanSpaces: DigitalOceanSpacesService,
  ) {}

  // ================================
  // GET TODAY'S MISSION
  // ================================

  async getTodaysMission(userFid: number) {
    const user = await this.getUserByFid(userFid);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find today's planned session
    const plannedSession = await this.plannedSessionRepo.findOne({
      where: {
        trainingPlan: { userId: user.id },
        scheduledDate: today,
      },
      relations: ['trainingPlan', 'weeklyTrainingPlan'],
    });

    // Check if user completed anything today
    const completedRun = await this.completedRunRepo.findOne({
      where: {
        userId: user.id,
        completedDate: today,
        status: RunStatusEnum.COMPLETED,
      },
      relations: ['plannedSession'],
    });

    // Get weekly progress
    const weekStart = this.getWeekStartDate();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weeklyPlanned = await this.plannedSessionRepo.count({
      where: {
        trainingPlan: { userId: user.id },
        scheduledDate: Between(weekStart, weekEnd),
      },
    });

    const weeklyCompleted = await this.completedRunRepo.count({
      where: {
        userId: user.id,
        completedDate: Between(weekStart, weekEnd),
        status: RunStatusEnum.COMPLETED,
      },
    });

    return {
      plannedSession,
      completedRun,
      hasCompletedToday: !!completedRun,
      weeklyProgress: {
        completed: weeklyCompleted,
        planned: weeklyPlanned,
        completionRate:
          weeklyPlanned > 0 ? (weeklyCompleted / weeklyPlanned) * 100 : 0,
      },
      streak: {
        current: user.currentStreak,
        needsTodaysRun: !completedRun,
        isAtRisk: this.isStreakAtRisk(user),
      },
    };
  }

  /**
   * Complete workflow for processing a workout session
   */
  async processWorkoutSession(
    data: WorkoutSessionData,
  ): Promise<ProcessedWorkoutResult> {
    try {
      // Step 0: Look up user by Farcaster ID to get database ID
      const user = await this.getUserByFid(data.userFid);
      const userId = user.id; // Database primary key

      // Step 0.5: Check if user is banned
      const banStatus = await this.isUserBanned(userId);
      if (banStatus.isBanned) {
        throw new BadRequestException(
          `Your account is currently suspended. You can resume using RUNNER on ${banStatus.banExpiresAt?.toLocaleDateString()}.`,
        );
      }

      this.logger.log(
        `Starting workout session processing for user FID ${data.userFid} (DB ID: ${userId})`,
      );

      // Step 1: Upload screenshots to DigitalOcean Spaces
      const sessionId = uuidv4();
      const screenshotUrls = await this.digitalOceanSpaces.uploadScreenshots(
        data.screenshots,
        userId,
        sessionId,
      );

      this.logger.log(
        `Uploaded ${screenshotUrls.length} screenshots for session ${sessionId}`,
      );

      // Step 2: Process screenshots with GPT-4 Vision
      const extractedData = await this.screenshotProcessor.processScreenshots(
        data.screenshots,
      );

      this.logger.log(
        `Extracted workout data with ${Math.round(extractedData.confidence * 100)}% confidence`,
      );

      // Step 2.5: Validate the workout data
      const validationResult = await this.validateWorkoutData(
        userId,
        extractedData,
      );

      if (!validationResult.isValid) {
        this.logger.warn(
          `Invalid workout detected for user ${userId}: ${validationResult.reason}`,
        );

        // Check if user should be banned
        const banResult = await this.handleInvalidWorkoutSubmission(
          userId,
          validationResult,
        );

        if (banResult.isBanned) {
          throw new BadRequestException(
            `Your account has been temporarily suspended for submitting invalid workouts. You can resume using RUNNER on ${banResult.banExpiresAt.toLocaleDateString()}.`,
          );
        }
      }

      // Step 3: Create or update completed run record
      const completedRun = await this.createCompletedRun(
        data,
        userId,
        screenshotUrls,
        extractedData,
        validationResult,
      );

      // Step 4: Check for personal bests
      const { isPersonalBest, personalBestType } =
        await this.checkPersonalBests(userId, extractedData);

      // Step 5: Update user statistics
      await this.updateUserStats(userId, extractedData, isPersonalBest);

      // Step 6: Update completed run with personal best info
      if (isPersonalBest) {
        completedRun.isPersonalBest = true;
        completedRun.personalBestType = personalBestType;
        await this.completedRunRepo.save(completedRun);
      }

      this.logger.log(
        `Successfully processed workout session for user FID ${data.userFid} (DB ID: ${userId})`,
      );

      return {
        completedRun,
        extractedData,
        screenshotUrls,
        isPersonalBest,
        personalBestType,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process workout session for user FID ${data.userFid}:`,
        error,
      );
      throw new Error(`Workout session processing failed: ${error.message}`);
    }
  }

  /**
   * Create a new completed run record
   */
  private async createCompletedRun(
    data: WorkoutSessionData,
    userId: number, // Database primary key
    screenshotUrls: string[],
    extractedData: ExtractedWorkoutData,
    validationResult?: {
      isValid: boolean;
      reason?: string;
      confidence: number;
    },
  ): Promise<CompletedRun> {
    const completedRun = this.completedRunRepo.create({
      userId: userId, // Use the database ID, not Farcaster ID
      plannedSessionId: data.plannedSessionId,
      completedDate: data.completedDate,
      status: RunStatusEnum.COMPLETED,
      actualDistance: extractedData.distance,
      actualTime: extractedData.duration,
      actualPace: extractedData.pace,
      calories: extractedData.calories,
      avgHeartRate: extractedData.avgHeartRate,
      maxHeartRate: extractedData.maxHeartRate,
      elevationGain: extractedData.elevationGain,
      steps: extractedData.steps,
      screenshotUrls,
      extractedData: {
        runningApp: extractedData.runningApp,
        confidence: extractedData.confidence,
        weather: extractedData.weather,
        route: extractedData.route,
        splits: extractedData.splits,
        rawText: extractedData.extractedText,
      },
      verified: false, // User needs to verify the extracted data
      notes: data.notes,
      extractedAt: new Date(),
      isValidWorkout: validationResult?.isValid ?? true, // Default to true if no validation result
      validationNotes: validationResult?.reason || null,
    });

    return this.completedRunRepo.save(completedRun);
  }

  /**
   * Check if this workout is a personal best
   */
  private async checkPersonalBests(
    userId: number,
    extractedData: ExtractedWorkoutData,
  ): Promise<{ isPersonalBest: boolean; personalBestType?: string }> {
    if (!extractedData.distance || !extractedData.duration) {
      return { isPersonalBest: false };
    }

    try {
      // Get user's previous personal bests
      const userStats = await this.userStatsRepo.findOne({
        where: { userId },
      });

      if (!userStats) {
        return { isPersonalBest: false };
      }

      const isPersonalBest = {
        fastest5k: false,
        fastest10k: false,
        longestRun: false,
        fastestMile: false,
      };

      // Check 5K personal best
      if (Math.abs(extractedData.distance - 5) < 0.1) {
        const current5k = userStats.personalRecords?.fastest5k;
        if (!current5k || extractedData.duration < current5k.time) {
          isPersonalBest.fastest5k = true;
        }
      }

      // Check 10K personal best
      if (Math.abs(extractedData.distance - 10) < 0.1) {
        const current10k = userStats.personalRecords?.fastest10k;
        if (!current10k || extractedData.duration < current10k.time) {
          isPersonalBest.fastest10k = true;
        }
      }

      // Check longest run
      const currentLongest = userStats.personalRecords?.longestRun;
      if (!currentLongest || extractedData.distance > currentLongest.distance) {
        isPersonalBest.longestRun = true;
      }

      // Check fastest mile
      if (Math.abs(extractedData.distance - 1.609) < 0.1) {
        // 1 mile = 1.609 km
        const currentMile = userStats.personalRecords?.fastestMarathon; // Using marathon field for mile
        if (!currentMile || extractedData.duration < currentMile.time) {
          isPersonalBest.fastestMile = true;
        }
      }

      // Determine the most significant personal best
      if (isPersonalBest.fastest5k)
        return { isPersonalBest: true, personalBestType: 'fastest_5k' };
      if (isPersonalBest.fastest10k)
        return { isPersonalBest: true, personalBestType: 'fastest_10k' };
      if (isPersonalBest.longestRun)
        return { isPersonalBest: true, personalBestType: 'longest_run' };
      if (isPersonalBest.fastestMile)
        return { isPersonalBest: true, personalBestType: 'fastest_mile' };

      return { isPersonalBest: false };
    } catch (error) {
      this.logger.error(
        `Error checking personal bests for user ${userId}:`,
        error,
      );
      return { isPersonalBest: false };
    }
  }

  /**
   * Update user statistics after a workout
   */
  private async updateUserStats(
    userId: number,
    extractedData: ExtractedWorkoutData,
    isPersonalBest: boolean,
  ): Promise<void> {
    try {
      let userStats = await this.userStatsRepo.findOne({
        where: { userId },
      });

      if (!userStats) {
        userStats = this.userStatsRepo.create({
          userId,
          bestPace: null,
          longestRun: 0,
          longestRunTime: null,
          fastestKm: null,
          avgRunDistance: 0,
          avgRunTime: 0,
          avgPace: 0,
          thisWeekDistance: 0,
          thisWeekRuns: 0,
          thisWeekTime: 0,
          thisMonthDistance: 0,
          thisMonthRuns: 0,
          thisMonthTime: 0,
          lastWeekDistance: 0,
          lastWeekRuns: 0,
          lastMonthDistance: 0,
          lastMonthRuns: 0,
          totalPlannedSessions: 0,
          completedPlannedSessions: 0,
          planCompletionRate: 0,
          intervalSessionsCompleted: 0,
          fixedTimeSessionsCompleted: 0,
          fixedLengthSessionsCompleted: 0,
          freestyleRuns: 0,
          workoutsShared: 0,
          totalLikesReceived: 0,
          totalCommentsReceived: 0,
          averageLikesPerShare: 0,
          socialEngagementScore: 0,
          streakHistory: [],
          totalStreaksStarted: 0,
          streaksOver7Days: 0,
          streaksOver30Days: 0,
          weeklyConsistencyScore: 0,
          avgHeartRate: null,
          maxHeartRate: null,
          totalCaloriesBurned: 0,
          totalElevationGain: 0,
          totalSteps: 0,
          totalAchievements: 0,
          badgesEarned: 0,
          milestonesReached: 0,
          personalRecords: {},
          totalAppSessions: 0,
          totalTimeInApp: 0,
          screenshotsUploaded: 0,
          aiExtractionUses: 0,
          avgExtractionConfidence: 0,
          manualDataEntries: 0,
          runningAppsUsed: [],
          mostUsedRunningApp: null,
        });
      }

      // Update basic stats with proper decimal handling
      userStats.totalCaloriesBurned += extractedData.calories || 0;
      userStats.totalElevationGain = Number(
        (
          Number(userStats.totalElevationGain || 0) +
          (extractedData.elevationGain || 0)
        ).toFixed(2),
      );
      userStats.totalSteps += extractedData.steps || 0;
      userStats.screenshotsUploaded += 1;
      userStats.aiExtractionUses += 1;

      // Update extraction confidence
      const totalConfidence =
        Number(userStats.avgExtractionConfidence || 0) *
          (userStats.aiExtractionUses - 1) +
        (extractedData.confidence || 0);
      userStats.avgExtractionConfidence = Number(
        (totalConfidence / userStats.aiExtractionUses).toFixed(2),
      );

      // Update weekly stats
      const currentWeekStart = this.getWeekStartDate();
      const today = new Date();

      // Check if we need to reset weekly stats
      if (
        !userStats.weeklyStatsLastReset ||
        new Date(userStats.weeklyStatsLastReset) < currentWeekStart
      ) {
        // Move current week to last week
        userStats.lastWeekDistance = Number(userStats.thisWeekDistance || 0);
        userStats.lastWeekRuns = userStats.thisWeekRuns;
        // Reset current week
        userStats.thisWeekDistance = 0;
        userStats.thisWeekRuns = 0;
        userStats.thisWeekTime = 0;
        userStats.weeklyStatsLastReset = today;
      }

      // Update current week stats
      userStats.thisWeekDistance = Number(
        (
          Number(userStats.thisWeekDistance || 0) +
          (extractedData.distance || 0)
        ).toFixed(2),
      );
      userStats.thisWeekRuns += 1;
      userStats.thisWeekTime += extractedData.duration || 0;

      // Update monthly stats
      const currentMonth = today.getFullYear() * 100 + today.getMonth();
      const lastMonthReset = userStats.monthlyStatsLastReset
        ? new Date(userStats.monthlyStatsLastReset)
        : null;
      const lastMonth = lastMonthReset
        ? lastMonthReset.getFullYear() * 100 + lastMonthReset.getMonth()
        : null;

      // Check if we need to reset monthly stats
      if (!lastMonthReset || lastMonth < currentMonth) {
        // Move current month to last month
        userStats.lastMonthDistance = Number(userStats.thisMonthDistance || 0);
        userStats.lastMonthRuns = userStats.thisMonthRuns;
        // Reset current month
        userStats.thisMonthDistance = 0;
        userStats.thisMonthRuns = 0;
        userStats.thisMonthTime = 0;
        userStats.monthlyStatsLastReset = today;
      }

      // Update current month stats
      userStats.thisMonthDistance = Number(
        (
          Number(userStats.thisMonthDistance || 0) +
          (extractedData.distance || 0)
        ).toFixed(2),
      );
      userStats.thisMonthRuns += 1;
      userStats.thisMonthTime += extractedData.duration || 0;

      // Update personal records if this is a personal best
      if (isPersonalBest && extractedData.distance && extractedData.duration) {
        if (!userStats.personalRecords) {
          userStats.personalRecords = {};
        }

        const todayStr = today.toISOString().split('T')[0];

        // Update 5K personal best
        if (Math.abs(extractedData.distance - 5) < 0.1) {
          if (
            !userStats.personalRecords.fastest5k ||
            extractedData.duration < userStats.personalRecords.fastest5k.time
          ) {
            userStats.personalRecords.fastest5k = {
              time: extractedData.duration,
              date: todayStr,
            };
          }
        }

        // Update 10K personal best
        if (Math.abs(extractedData.distance - 10) < 0.1) {
          if (
            !userStats.personalRecords.fastest10k ||
            extractedData.duration < userStats.personalRecords.fastest10k.time
          ) {
            userStats.personalRecords.fastest10k = {
              time: extractedData.duration,
              date: todayStr,
            };
          }
        }

        // Update longest run
        if (
          !userStats.personalRecords.longestRun ||
          extractedData.distance > userStats.personalRecords.longestRun.distance
        ) {
          userStats.personalRecords.longestRun = {
            distance: extractedData.distance,
            date: todayStr,
          };
        }

        userStats.totalAchievements += 1;
      }

      // Update running app usage
      if (extractedData.runningApp) {
        if (!userStats.runningAppsUsed) {
          userStats.runningAppsUsed = [];
        }

        const existingApp = userStats.runningAppsUsed.find(
          (app) => app.app === extractedData.runningApp,
        );
        if (existingApp) {
          existingApp.count += 1;
          existingApp.lastUsed = new Date().toISOString();
        } else {
          userStats.runningAppsUsed.push({
            app: extractedData.runningApp,
            count: 1,
            lastUsed: new Date().toISOString(),
          });
        }

        // Update most used app
        const mostUsed = userStats.runningAppsUsed.reduce((prev, current) =>
          prev.count > current.count ? prev : current,
        );
        userStats.mostUsedRunningApp = mostUsed.app;
      }

      // Save the detailed stats
      await this.userStatsRepo.save(userStats);

      // Update the main user record with proper decimal handling
      const totalRuns =
        userStats.thisWeekRuns +
        userStats.lastWeekRuns +
        userStats.lastMonthRuns;

      // Convert decimal strings to numbers before arithmetic
      const thisWeekDistance = Number(userStats.thisWeekDistance || 0);
      const lastWeekDistance = Number(userStats.lastWeekDistance || 0);
      const lastMonthDistance = Number(userStats.lastMonthDistance || 0);

      const totalDistance = Number(
        (thisWeekDistance + lastWeekDistance + lastMonthDistance).toFixed(2),
      );
      const totalTimeMinutes = userStats.thisWeekTime + userStats.thisMonthTime;

      await this.userRepo.update(userId, {
        totalRuns: totalRuns,
        totalDistance: totalDistance,
        totalTimeMinutes: totalTimeMinutes,
        lastRunDate: today,
      });

      this.logger.log(
        `Updated user stats for user ${userId}: runs=${totalRuns}, distance=${totalDistance}km, time=${totalTimeMinutes}min`,
      );
    } catch (error) {
      this.logger.error(`Error updating user stats for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate pace in minutes per km from pace string
   */
  private calculatePaceMinutes(pace?: string): number | null {
    if (!pace) return null;

    // Handle formats like "5:30/km" or "8:30/mile"
    const match = pace.match(/(\d+):(\d+)\/(km|mile)/);
    if (!match) return null;

    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const unit = match[3];

    let paceMinutes = minutes + seconds / 60;

    // Convert from miles to km if needed
    if (unit === 'mile') {
      paceMinutes = paceMinutes * 1.609; // Convert to km
    }

    return paceMinutes;
  }

  // ================================
  // MARK SESSION COMPLETED
  // ================================

  async markSessionCompleted(
    userFid: number,
    plannedSessionId: number,
    didComplete: boolean,
  ) {
    const user = await this.getUserByFid(userFid);

    const plannedSession = await this.plannedSessionRepo.findOne({
      where: { id: plannedSessionId },
      relations: ['trainingPlan'],
    });

    if (!plannedSession) {
      throw new NotFoundException('Planned session not found');
    }

    // Verify session belongs to user
    if (plannedSession.trainingPlan.userId !== user.id) {
      throw new BadRequestException('Session does not belong to user');
    }

    if (didComplete) {
      // Check if they already have a completed run for this session
      const existingRun = await this.completedRunRepo.findOne({
        where: {
          userId: user.id,
          plannedSessionId,
          status: RunStatusEnum.COMPLETED,
        },
      });

      if (!existingRun) {
        // Create a manual completion record (no screenshots)
        const completedRun = this.completedRunRepo.create({
          userId: user.id,
          trainingPlanId: plannedSession.trainingPlanId,
          weeklyTrainingPlanId: plannedSession.weeklyTrainingPlanId,
          plannedSessionId,
          status: RunStatusEnum.COMPLETED,
          completedDate: new Date(),
          notes:
            'Manually marked as completed - upload screenshots for verification',
          verified: false,
        });

        await this.completedRunRepo.save(completedRun);
      }

      await this.plannedSessionRepo.update(plannedSessionId, {
        isCompleted: true,
      });
      await this.updateUserStats(user.id, null, false);

      return {
        success: true,
        message:
          'Session marked as completed! Upload screenshots to verify your performance.',
      };
    } else {
      // Mark as skipped
      const skippedRun = this.completedRunRepo.create({
        userId: user.id,
        trainingPlanId: plannedSession.trainingPlanId,
        weeklyTrainingPlanId: plannedSession.weeklyTrainingPlanId,
        plannedSessionId,
        status: RunStatusEnum.SKIPPED,
        completedDate: new Date(),
        notes: 'User marked as not completed',
      });

      await this.completedRunRepo.save(skippedRun);
      await this.updateUserStats(user.id, null, false);

      return {
        success: true,
        message: 'No worries! Try again tomorrow. Consistency is key! 💪',
      };
    }
  }

  // ================================
  // GET USER PERFORMANCE DATA
  // ================================

  async getUserPerformanceData(userFid: number) {
    const user = await this.getUserByFid(userFid);

    // Get user stats
    const stats = await this.userStatsRepo.findOne({
      where: { userId: user.id },
    });

    // Get recent runs
    const recentRuns = await this.completedRunRepo.find({
      where: { userId: user.id, status: RunStatusEnum.COMPLETED },
      order: { completedDate: 'DESC' },
      take: 10,
      relations: ['plannedSession'],
    });

    // Get current week's progress
    const weekStart = this.getWeekStartDate();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const currentWeekPlanned = await this.plannedSessionRepo.find({
      where: {
        trainingPlan: { userId: user.id },
        scheduledDate: Between(weekStart, weekEnd),
      },
    });

    const currentWeekCompleted = await this.completedRunRepo.find({
      where: {
        userId: user.id,
        completedDate: Between(weekStart, weekEnd),
        status: RunStatusEnum.COMPLETED,
      },
    });

    return {
      user: {
        totalRuns: user.totalRuns,
        totalDistance: user.totalDistance,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak,
        runnerTokens: user.runnerTokens,
      },
      stats,
      recentRuns,
      currentWeekProgress: {
        planned: currentWeekPlanned,
        completed: currentWeekCompleted,
        completionRate:
          currentWeekPlanned.length > 0
            ? (currentWeekCompleted.length / currentWeekPlanned.length) * 100
            : 0,
      },
      streak: {
        current: user.currentStreak,
        longest: user.longestStreak,
        needsTodaysRun: !(await this.hasRunToday(user.id)),
        isAtRisk: this.isStreakAtRisk(user),
      },
    };
  }

  // ================================
  // VERIFY WORKOUT DATA
  // ================================

  async verifyWorkoutData(
    completedRunId: number,
    userId: number,
  ): Promise<CompletedRun> {
    try {
      const completedRun = await this.completedRunRepo.findOne({
        where: { id: completedRunId, userId },
      });

      if (!completedRun) {
        throw new Error('Completed run not found');
      }

      completedRun.verified = true;
      completedRun.verifiedAt = new Date();

      return this.completedRunRepo.save(completedRun);
    } catch (error) {
      this.logger.error(
        `Error verifying workout data for run ${completedRunId}:`,
        error,
      );
      throw error;
    }
  }

  // ================================
  // SHARE WORKOUT ACHIEVEMENT
  // ================================

  async shareWorkoutAchievement(userFid: number, completedRunId: number) {
    const user = await this.getUserByFid(userFid);

    const completedRun = await this.completedRunRepo.findOne({
      where: { id: completedRunId, userId: user.id },
    });

    if (!completedRun) {
      throw new NotFoundException('Completed run not found');
    }

    // TODO: Implement share image generation and Farcaster posting
    // This will be implemented in the next phase

    return {
      success: true,
      message: 'Sharing functionality coming soon!',
      shareImageUrl: null,
      castHash: null,
    };
  }

  // ================================
  // HELPER METHODS
  // ================================

  private async getUserByFid(fid: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException(`User with FID ${fid} not found`);
    }
    return user;
  }

  private async hasRunToday(userId: number): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysRun = await this.completedRunRepo.findOne({
      where: {
        userId,
        completedDate: today,
        status: RunStatusEnum.COMPLETED,
      },
    });

    return !!todaysRun;
  }

  private isStreakAtRisk(user: User): boolean {
    if (!user.lastRunDate || user.currentStreak === 0) return false;

    const today = new Date();
    const lastRun = new Date(user.lastRunDate);
    const daysDiff = Math.floor(
      (today.getTime() - lastRun.getTime()) / (1000 * 60 * 60 * 24),
    );

    return daysDiff >= 1;
  }

  private getWeekStartDate(): Date {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }

  // ================================
  // GET RUN DETAIL
  // ================================

  /**
   * Get detailed run information by ID
   */
  async getRunDetail(
    userFid: number,
    runId: number,
  ): Promise<RunDetailResponse> {
    // Get user by Farcaster ID
    const user = await this.getUserByFid(userFid);

    // Fetch the completed run with all related data
    const completedRun = await this.completedRunRepo.findOne({
      where: { id: runId },
      relations: ['plannedSession', 'trainingPlan', 'weeklyTrainingPlan'],
    });

    if (!completedRun) {
      throw new NotFoundException('Run not found');
    }

    // Verify the run belongs to the authenticated user
    if (completedRun.userId !== user.id) {
      throw new NotFoundException('Run not found');
    }

    // Get social stats if the run was shared
    let socialStats = null;
    if (completedRun.shared) {
      const farcasterCast = await this.farcasterCastRepo.findOne({
        where: { completedRunId: runId },
      });
      if (farcasterCast) {
        socialStats = {
          likes: farcasterCast.likes,
          shares: farcasterCast.shares,
          comments: farcasterCast.comments,
        };
      }
    }

    // Generate share text
    const shareText = this.generateShareText(completedRun);

    // Calculate achievements
    const achievements = this.calculateAchievements(completedRun);

    // Get context data if this was a planned session
    const context = await this.getRunContext(completedRun);

    return {
      run: {
        id: completedRun.id,
        status: completedRun.status,
        completedDate: completedRun.completedDate.toISOString(),
        actualDistance: completedRun.actualDistance,
        actualTime: completedRun.actualTime,
        actualPace: completedRun.actualPace,
        calories: completedRun.calories,
        avgHeartRate: completedRun.avgHeartRate,
        maxHeartRate: completedRun.maxHeartRate,
        screenshotUrls: completedRun.screenshotUrls || [],
        verified: completedRun.verified,
        notes: completedRun.notes,
        isPersonalBest: completedRun.isPersonalBest,
        personalBestType: completedRun.personalBestType,
        createdAt: completedRun.createdAt.toISOString(),
      },
      extractedData: {
        runningApp: completedRun.extractedData?.runningApp || 'Unknown',
        confidence: completedRun.extractedData?.confidence || 0,
        weather: completedRun.extractedData?.weather,
        route: completedRun.extractedData?.route,
        splits: completedRun.extractedData?.splits,
        rawText: completedRun.extractedData?.rawText || [],
      },
      achievements,
      shareData: {
        shareText,
        shareImageUrl: completedRun.shareImageUrl,
        socialStats,
      },
      context,
    };
  }

  /**
   * Generate compelling share text based on workout data
   */
  private generateShareText(run: CompletedRun): string {
    const distance = run.actualDistance;
    const time = run.actualTime;
    const pace = run.actualPace;

    if (run.isPersonalBest) {
      const pbType = run.personalBestType;
      if (pbType === 'fastest_5k' && distance >= 5) {
        return `New personal best! 5km in ${this.formatTime(time)} 💪 #PersonalRecord #RUNNER`;
      } else if (pbType === 'longest_run') {
        return `New longest run! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #PersonalRecord #RUNNER`;
      } else if (pbType === 'fastest_mile') {
        return `New fastest mile! ${this.formatTime(time)} 🚀 #PersonalRecord #RUNNER`;
      }
      return `New personal best! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🎉 #PersonalRecord #RUNNER`;
    }

    // Check for milestone distances
    if (distance >= 42.2) {
      return `Just completed a marathon! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #Marathon #RUNNER`;
    } else if (distance >= 21.1) {
      return `Half marathon completed! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #HalfMarathon #RUNNER`;
    } else if (distance >= 10) {
      return `Double digits! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #10K #RUNNER`;
    } else if (distance >= 5) {
      return `Solid 5K! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #5K #RUNNER`;
    }

    // Default motivational message
    return `Just crushed a ${distance.toFixed(2)}km run in ${this.formatTime(time)}! 🏃‍♂️ Feeling strong! #RUNNER`;
  }

  /**
   * Calculate achievements for the run
   */
  private calculateAchievements(run: CompletedRun): {
    isPersonalBest: boolean;
    personalBestType?: string;
    badges: string[];
    milestones: string[];
  } {
    const badges: string[] = [];
    const milestones: string[] = [];

    // Personal best badges
    if (run.isPersonalBest) {
      badges.push('personal-best');
      if (run.personalBestType) {
        badges.push(run.personalBestType);
      }
    }

    // Distance milestones
    const distance = run.actualDistance;
    if (distance >= 42.2) {
      milestones.push('marathon');
    } else if (distance >= 21.1) {
      milestones.push('half-marathon');
    } else if (distance >= 10) {
      milestones.push('10k');
    } else if (distance >= 5) {
      milestones.push('5k');
    }

    // Consistency badges
    if (run.verified) {
      badges.push('verified');
    }

    // Social badges
    if (run.shared) {
      badges.push('shared');
    }

    return {
      isPersonalBest: run.isPersonalBest,
      personalBestType: run.personalBestType,
      badges,
      milestones,
    };
  }

  /**
   * Get context data for the run (planned session comparison)
   */
  private async getRunContext(
    run: CompletedRun,
  ): Promise<RunDetailResponse['context']> {
    if (!run.plannedSession) {
      return undefined;
    }

    const plannedSession = run.plannedSession;
    const actualDistance = run.actualDistance;
    const actualTime = run.actualTime;

    // Calculate performance vs target
    const distanceComparison = this.compareDistanceValues(
      actualDistance,
      plannedSession.targetDistance,
    );
    const timeComparison = this.compareTimeValues(
      actualTime,
      plannedSession.targetTime,
    );

    // Determine overall rating
    let overallRating: 'excellent' | 'good' | 'needs_improvement' = 'good';
    if (distanceComparison === 'above' && timeComparison === 'faster') {
      overallRating = 'excellent';
    } else if (distanceComparison === 'below' && timeComparison === 'slower') {
      overallRating = 'needs_improvement';
    }

    return {
      plannedSession: {
        targetDistance: plannedSession.targetDistance,
        targetTime: plannedSession.targetTime,
        targetPace: plannedSession.targetPace,
        instructions: plannedSession.instructions,
      },
      performanceVsTarget: {
        distanceComparison,
        timeComparison,
        overallRating,
      },
    };
  }

  /**
   * Compare actual vs target distance values
   */
  private compareDistanceValues(
    actual: number,
    target: number,
  ): 'above' | 'below' | 'exact' {
    const tolerance = 0.1; // 10% tolerance
    const difference = Math.abs(actual - target) / target;

    if (difference <= tolerance) {
      return 'exact';
    }
    return actual > target ? 'above' : 'below';
  }

  /**
   * Compare actual vs target time values (lower time is better)
   */
  private compareTimeValues(
    actual: number,
    target: number,
  ): 'faster' | 'slower' | 'exact' {
    const tolerance = 0.1; // 10% tolerance
    const difference = Math.abs(actual - target) / target;

    if (difference <= tolerance) {
      return 'exact';
    }
    return actual < target ? 'faster' : 'slower';
  }

  /**
   * Format time in minutes to HH:MM:SS
   */
  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ================================
  // WORKOUT VALIDATION SYSTEM
  // ================================

  /**
   * Validate if the extracted workout data represents a legitimate workout
   */
  private async validateWorkoutData(
    userId: number,
    extractedData: ExtractedWorkoutData,
  ): Promise<{
    isValid: boolean;
    reason?: string;
    confidence: number;
  }> {
    // Check if this was identified as a non-workout image
    if (!extractedData.isWorkoutImage) {
      return {
        isValid: false,
        reason:
          'Non-workout image detected - please upload screenshots from your running app',
        confidence: 0,
      };
    }

    // Check if we have the minimum required data
    if (!extractedData.distance || !extractedData.duration) {
      return {
        isValid: false,
        reason: 'Missing essential workout data (distance or duration)',
        confidence: extractedData.confidence || 0,
      };
    }

    // Validate distance (must be reasonable for a run)
    if (extractedData.distance < 0.1 || extractedData.distance > 100) {
      return {
        isValid: false,
        reason: `Unrealistic distance: ${extractedData.distance}km`,
        confidence: extractedData.confidence || 0,
      };
    }

    // Validate duration (must be reasonable for a run)
    if (extractedData.duration < 0.5 || extractedData.duration > 600) {
      return {
        isValid: false,
        reason: `Unrealistic duration: ${extractedData.duration} minutes`,
        confidence: extractedData.confidence || 0,
      };
    }

    // Validate pace (must be reasonable for a run)
    if (extractedData.pace) {
      const paceMinutes = this.calculatePaceMinutes(extractedData.pace);
      if (paceMinutes && (paceMinutes < 2 || paceMinutes > 20)) {
        return {
          isValid: false,
          reason: `Unrealistic pace: ${extractedData.pace}`,
          confidence: extractedData.confidence || 0,
        };
      }
    }

    // Check for suspicious patterns
    const suspiciousPatterns = this.detectSuspiciousPatterns(extractedData);
    if (suspiciousPatterns.length > 0) {
      return {
        isValid: false,
        reason: `Suspicious workout patterns detected: ${suspiciousPatterns.join(', ')}`,
        confidence: extractedData.confidence || 0,
      };
    }

    // Check confidence threshold
    if (extractedData.confidence < 0.3) {
      return {
        isValid: false,
        reason:
          'Low confidence in data extraction - please ensure clear screenshots',
        confidence: extractedData.confidence,
      };
    }

    return {
      isValid: true,
      confidence: extractedData.confidence,
    };
  }

  /**
   * Detect suspicious patterns in workout data
   */
  private detectSuspiciousPatterns(
    extractedData: ExtractedWorkoutData,
  ): string[] {
    const patterns: string[] = [];

    // Check for impossibly fast paces
    if (extractedData.pace) {
      const paceMinutes = this.calculatePaceMinutes(extractedData.pace);
      if (paceMinutes && paceMinutes < 3) {
        patterns.push('extremely fast pace');
      }
    }

    // Check for impossibly long distances in short times
    if (extractedData.distance && extractedData.duration) {
      const avgPace = extractedData.duration / extractedData.distance;
      if (avgPace < 2) {
        patterns.push('impossible speed for distance');
      }
    }

    // Check for suspicious heart rate data
    if (
      extractedData.avgHeartRate &&
      (extractedData.avgHeartRate < 40 || extractedData.avgHeartRate > 220)
    ) {
      patterns.push('unrealistic heart rate');
    }

    if (
      extractedData.maxHeartRate &&
      (extractedData.maxHeartRate < 60 || extractedData.maxHeartRate > 250)
    ) {
      patterns.push('unrealistic max heart rate');
    }

    // Check for suspicious calorie counts
    if (extractedData.calories && extractedData.duration) {
      const caloriesPerMinute = extractedData.calories / extractedData.duration;
      if (caloriesPerMinute > 20) {
        patterns.push('unrealistic calorie burn rate');
      }
    }

    return patterns;
  }

  /**
   * Handle invalid workout submission and manage user bans
   */
  private async handleInvalidWorkoutSubmission(
    userId: number,
    validationResult: { isValid: boolean; reason?: string; confidence: number },
  ): Promise<{
    isBanned: boolean;
    banExpiresAt?: Date;
    invalidSubmissions: number;
  }> {
    // Get current user
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Check if user is already banned
    if (user.isBanned) {
      const now = new Date();
      if (user.banExpiresAt && now < user.banExpiresAt) {
        return {
          isBanned: true,
          banExpiresAt: user.banExpiresAt,
          invalidSubmissions: user.invalidWorkoutSubmissions,
        };
      } else {
        // Ban has expired, reset it
        await this.userRepo.update(userId, {
          isBanned: false,
          bannedAt: null,
          banExpiresAt: null,
        });
      }
    }

    // Increment invalid submission count
    const newInvalidCount = user.invalidWorkoutSubmissions + 1;

    // Check if user should be banned (after 3 invalid submissions)
    if (newInvalidCount >= 3) {
      const banExpiresAt = new Date();
      banExpiresAt.setDate(banExpiresAt.getDate() + 7); // 1 week ban

      const banHistory = user.banHistory || [];
      banHistory.push({
        bannedAt: new Date().toISOString(),
        expiresAt: banExpiresAt.toISOString(),
        reason: `Multiple invalid workout submissions (${newInvalidCount} total)`,
        invalidSubmissions: newInvalidCount,
      });

      // Apply the ban
      await this.userRepo.update(userId, {
        invalidWorkoutSubmissions: newInvalidCount,
        isBanned: true,
        bannedAt: new Date(),
        banExpiresAt,
        banHistory,
      });

      this.logger.warn(
        `User ${userId} banned for 1 week due to ${newInvalidCount} invalid workout submissions`,
      );

      return {
        isBanned: true,
        banExpiresAt,
        invalidSubmissions: newInvalidCount,
      };
    } else {
      // Just increment the count
      await this.userRepo.update(userId, {
        invalidWorkoutSubmissions: newInvalidCount,
      });

      this.logger.warn(
        `User ${userId} has ${newInvalidCount} invalid workout submissions`,
      );

      return {
        isBanned: false,
        invalidSubmissions: newInvalidCount,
      };
    }
  }

  /**
   * Check if user is currently banned
   */
  public async isUserBanned(userId: number): Promise<{
    isBanned: boolean;
    banExpiresAt?: Date;
    remainingDays?: number;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.isBanned) {
      return { isBanned: false };
    }

    const now = new Date();
    if (!user.banExpiresAt || now >= user.banExpiresAt) {
      // Ban has expired, reset it
      await this.userRepo.update(userId, {
        isBanned: false,
        bannedAt: null,
        banExpiresAt: null,
      });
      return { isBanned: false };
    }

    const remainingMs = user.banExpiresAt.getTime() - now.getTime();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

    return {
      isBanned: true,
      banExpiresAt: user.banExpiresAt,
      remainingDays,
    };
  }

  /**
   * Get user's workout validation status
   */
  public async getUserValidationStatus(userFid: number): Promise<{
    invalidSubmissions: number;
    isBanned: boolean;
    banExpiresAt?: Date;
    remainingDays?: number;
    warningsRemaining: number;
  }> {
    const user = await this.getUserByFid(userFid);
    const banStatus = await this.isUserBanned(user.id);

    const warningsRemaining = Math.max(0, 3 - user.invalidWorkoutSubmissions);

    return {
      invalidSubmissions: user.invalidWorkoutSubmissions,
      isBanned: banStatus.isBanned,
      banExpiresAt: banStatus.banExpiresAt,
      remainingDays: banStatus.remainingDays,
      warningsRemaining,
    };
  }
}
