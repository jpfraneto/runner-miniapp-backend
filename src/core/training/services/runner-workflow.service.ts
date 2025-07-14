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
  RunningSession,
  RunningInterval,
  UnitType,
} from '../../../models/RunningSession/RunningSession.model';
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
  runningSession: RunningSession;
  extractedData: ExtractedWorkoutData;
  screenshotUrls: string[];
  isPersonalBest: boolean;
  personalBestType?: string;
}

export interface RunDetailResponse {
  run: {
    id: number;
    completedDate: string;
    distance: number;
    duration: number;
    pace: string;
    calories?: number;
    avgHeartRate?: number;
    maxHeartRate?: number;
    screenshotUrls: string[];
    notes: string;
    isPersonalBest: boolean;
    personalBestType?: string;
    createdAt: string;
    confidence: number;
    units: string;
  };
  intervals: Array<{
    number: number;
    type: string;
    distance: number;
    duration: string;
    pace: string;
  }>;
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
    @InjectRepository(RunningSession)
    private readonly runningSessionRepo: Repository<RunningSession>,
    @InjectRepository(RunningInterval)
    private readonly runningIntervalRepo: Repository<RunningInterval>,
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
    const completedRun = await this.runningSessionRepo.findOne({
      where: {
        userId: user.id,
        completedDate: today,
      },
      relations: ['intervals'],
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

    const weeklyCompleted = await this.runningSessionRepo.count({
      where: {
        userId: user.id,
        completedDate: Between(weekStart, weekEnd),
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

  // ================================
  // PROCESS WORKOUT SESSION
  // ================================

  async processWorkoutSession(
    data: WorkoutSessionData,
  ): Promise<ProcessedWorkoutResult> {
    try {
      const user = await this.getUserByFid(data.userFid);
      const userId = user.id;

      // Check if user is banned
      const banStatus = await this.isUserBanned(userId);
      if (banStatus.isBanned) {
        throw new BadRequestException(
          `Your account is currently suspended. You can resume using RUNNER on ${banStatus.banExpiresAt?.toLocaleDateString()}.`,
        );
      }

      this.logger.log(
        `Starting workout session processing for user FID ${data.userFid}`,
      );

      // Upload screenshots
      const sessionId = uuidv4();
      const screenshotUrls = await this.digitalOceanSpaces.uploadScreenshots(
        data.screenshots,
        userId,
        sessionId,
      );

      // Process screenshots with AI
      const extractedData = await this.screenshotProcessor.processScreenshots(
        data.screenshots,
      );

      // Validate workout data
      const validationResult = await this.validateWorkoutData(
        userId,
        extractedData,
      );
      if (!validationResult.isValid) {
        this.logger.warn(
          `Invalid workout detected for user ${userId}: ${validationResult.reason}`,
        );

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

      // Check for personal bests
      const personalBestResult = await this.checkPersonalBests(
        userId,
        extractedData,
      );

      // Create RunningSession
      const runningSession = this.runningSessionRepo.create({
        userId: user.id,
        fid: user.fid,
        comment: data.notes || '',
        isWorkoutImage: extractedData.isWorkoutImage,
        distance: extractedData.distance,
        duration: extractedData.duration,
        units: (extractedData.units as UnitType) || UnitType.KM,
        pace: extractedData.pace,
        confidence: extractedData.confidence,
        extractedText: extractedData.extractedText || [],
        completedDate: data.completedDate,
        calories: extractedData.calories,
        avgHeartRate: extractedData.avgHeartRate,
        maxHeartRate: extractedData.maxHeartRate,
        isPersonalBest: personalBestResult.isPersonalBest,
        personalBestType: personalBestResult.personalBestType,
        screenshotUrls: screenshotUrls,
        rawText: extractedData.extractedText?.join('\n'),
        notes: data.notes,
      });

      const savedSession = await this.runningSessionRepo.save(runningSession);

      // Create intervals if they exist
      if (extractedData.intervals && extractedData.intervals.length > 0) {
        const intervals = extractedData.intervals.map((interval, index) =>
          this.runningIntervalRepo.create({
            runningSessionId: savedSession.id,
            number: index + 1,
            type: interval.type,
            distance: interval.distance,
            duration: interval.duration,
            pace: interval.pace,
          }),
        );
        await this.runningIntervalRepo.save(intervals);
      }

      // Update user stats
      await this.updateUserStats(
        userId,
        extractedData,
        personalBestResult.isPersonalBest,
      );

      this.logger.log(
        `Successfully processed workout session for user FID ${data.userFid}`,
      );

      return {
        runningSession: savedSession,
        extractedData,
        screenshotUrls,
        isPersonalBest: personalBestResult.isPersonalBest,
        personalBestType: personalBestResult.personalBestType,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process workout session for user FID ${data.userFid}:`,
        error,
      );
      throw new Error(`Workout session processing failed: ${error.message}`);
    }
  }

  // ================================
  // GET RUN DETAIL
  // ================================

  async getRunDetail(
    userFid: number,
    runId: number,
  ): Promise<RunDetailResponse> {
    const user = await this.getUserByFid(userFid);

    const runningSession = await this.runningSessionRepo.findOne({
      where: { id: runId },
      relations: ['intervals', 'user'],
    });

    if (!runningSession) {
      throw new NotFoundException('Run not found');
    }

    if (runningSession.userId !== user.id) {
      throw new NotFoundException('Run not found');
    }

    // Get social stats if available
    let socialStats = null;
    const farcasterCast = await this.farcasterCastRepo.findOne({
      where: { runningSession: { id: runId } },
    });
    if (farcasterCast) {
      socialStats = {
        likes: farcasterCast.likes || 0,
        shares: farcasterCast.shares || 0,
        comments: farcasterCast.comments || 0,
      };
    }

    const shareText = this.generateShareText(runningSession);
    const achievements = this.calculateAchievements(runningSession);

    return {
      run: {
        id: runningSession.id,
        completedDate:
          runningSession.completedDate?.toISOString() ||
          runningSession.createdAt.toISOString(),
        distance: runningSession.distance,
        duration: runningSession.duration,
        pace: runningSession.pace,
        calories: runningSession.calories,
        avgHeartRate: runningSession.avgHeartRate,
        maxHeartRate: runningSession.maxHeartRate,
        screenshotUrls: runningSession.screenshotUrls || [],
        notes: runningSession.notes || runningSession.comment || '',
        isPersonalBest: runningSession.isPersonalBest || false,
        personalBestType: runningSession.personalBestType,
        createdAt: runningSession.createdAt.toISOString(),
        confidence: runningSession.confidence,
        units: runningSession.units,
      },
      intervals:
        runningSession.intervals?.map((interval) => ({
          number: interval.number,
          type: interval.type,
          distance: interval.distance,
          duration: interval.duration,
          pace: interval.pace,
        })) || [],
      achievements,
      shareData: {
        shareText,
        shareImageUrl: undefined, // Can add this field later if needed
        socialStats,
      },
    };
  }

  // ================================
  // GET USER PERFORMANCE DATA
  // ================================

  async getUserPerformanceData(userFid: number) {
    const user = await this.getUserByFid(userFid);

    const stats = await this.userStatsRepo.findOne({
      where: { userId: user.id },
    });

    const recentRuns = await this.runningSessionRepo.find({
      where: { fid: userFid },
      order: { completedDate: 'DESC' },
      take: 10,
      relations: ['intervals'],
    });

    const weekStart = this.getWeekStartDate();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const currentWeekPlanned = await this.plannedSessionRepo.find({
      where: {
        trainingPlan: { userId: user.id },
        scheduledDate: Between(weekStart, weekEnd),
      },
    });

    const currentWeekCompleted = await this.runningSessionRepo.find({
      where: {
        fid: userFid,
        completedDate: Between(weekStart, weekEnd),
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
        needsTodaysRun: !(await this.hasRunToday(user.fid)),
        isAtRisk: this.isStreakAtRisk(user),
      },
    };
  }

  // ================================
  // SHARE WORKOUT
  // ================================

  async shareWorkoutAchievement(userFid: number, runningSessionId: number) {
    const user = await this.getUserByFid(userFid);

    const runningSession = await this.runningSessionRepo.findOne({
      where: { id: runningSessionId, fid: userFid },
    });

    if (!runningSession) {
      throw new NotFoundException('Running session not found');
    }

    // TODO: Implement share image generation and Farcaster posting
    return {
      success: true,
      message: 'Sharing functionality coming soon!',
      shareImageUrl: null,
      castHash: null,
    };
  }

  // ================================
  // STUBS FOR CONTROLLER COMPATIBILITY
  // ================================

  async markSessionCompleted(...args: any[]): Promise<any> {
    // TODO: Implement actual logic
    return { success: true, message: 'markSessionCompleted stub' };
  }

  async verifyWorkoutData(...args: any[]): Promise<any> {
    // TODO: Implement actual logic
    return { success: true, message: 'verifyWorkoutData stub' };
  }

  // ================================
  // PRIVATE HELPER METHODS
  // ================================

  private async getUserByFid(fid: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException(`User with FID ${fid} not found`);
    }
    return user;
  }

  private async hasRunToday(fid: number): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysRun = await this.runningSessionRepo.findOne({
      where: {
        fid,
        completedDate: today,
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
    const currentDay = today.getDay();
    
    // Calculate days since Monday (Monday = 0, Tuesday = 1, ..., Sunday = 6)
    const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    // Calculate the start of the week (Monday)
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysSinceMonday);
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }

  private generateShareText(run: RunningSession): string {
    const distance = run.distance;
    const time = run.duration;

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

    // Milestone distances
    if (distance >= 42.2) {
      return `Just completed a marathon! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #Marathon #RUNNER`;
    } else if (distance >= 21.1) {
      return `Half marathon completed! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #HalfMarathon #RUNNER`;
    } else if (distance >= 10) {
      return `Double digits! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #10K #RUNNER`;
    } else if (distance >= 5) {
      return `Solid 5K! ${distance.toFixed(2)}km in ${this.formatTime(time)} 🏃‍♂️ #5K #RUNNER`;
    }

    return `Just crushed a ${distance.toFixed(2)}km run in ${this.formatTime(time)}! 🏃‍♂️ Feeling strong! #RUNNER`;
  }

  private calculateAchievements(run: RunningSession): {
    isPersonalBest: boolean;
    personalBestType?: string;
    badges: string[];
    milestones: string[];
  } {
    const badges: string[] = [];
    const milestones: string[] = [];

    if (run.isPersonalBest) {
      badges.push('personal-best');
      if (run.personalBestType) {
        badges.push(run.personalBestType);
      }
    }

    const distance = run.distance;
    if (distance >= 42.2) {
      milestones.push('marathon');
    } else if (distance >= 21.1) {
      milestones.push('half-marathon');
    } else if (distance >= 10) {
      milestones.push('10k');
    } else if (distance >= 5) {
      milestones.push('5k');
    }

    badges.push('verified');

    return {
      isPersonalBest: run.isPersonalBest || false,
      personalBestType: run.personalBestType,
      badges,
      milestones,
    };
  }

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
  // PERSONAL BESTS
  // ================================

  private async checkPersonalBests(
    fid: number,
    extractedData: ExtractedWorkoutData,
  ): Promise<{ isPersonalBest: boolean; personalBestType?: string }> {
    if (!extractedData.distance || !extractedData.duration) {
      return { isPersonalBest: false };
    }

    try {
      const userStats = await this.userStatsRepo.findOne({
        where: { userId: (await this.getUserByFid(fid)).id },
      });

      if (!userStats) {
        return { isPersonalBest: false };
      }

      // Check 5K personal best
      if (Math.abs(extractedData.distance - 5) < 0.1) {
        const current5k = userStats.fastest5kTime;
        if (!current5k || extractedData.duration < current5k) {
          return { isPersonalBest: true, personalBestType: 'fastest_5k' };
        }
      }

      // Check 10K personal best
      if (Math.abs(extractedData.distance - 10) < 0.1) {
        const current10k = userStats.fastest10kTime;
        if (!current10k || extractedData.duration < current10k) {
          return { isPersonalBest: true, personalBestType: 'fastest_10k' };
        }
      }

      // Check longest run
      const currentLongest = userStats.longestRunDistance;
      if (!currentLongest || extractedData.distance > currentLongest) {
        return { isPersonalBest: true, personalBestType: 'longest_run' };
      }

      return { isPersonalBest: false };
    } catch (error) {
      this.logger.error(
        `Error checking personal bests for user ${fid}:`,
        error,
      );
      return { isPersonalBest: false };
    }
  }

  // ================================
  // USER STATS
  // ================================

  private async updateUserStats(
    fid: number,
    extractedData: ExtractedWorkoutData,
    isPersonalBest: boolean,
  ): Promise<void> {
    try {
      const user = await this.getUserByFid(fid);
      let userStats = await this.userStatsRepo.findOne({
        where: { userId: user.id },
      });

      if (!userStats) {
        userStats = this.userStatsRepo.create({
          userId: user.id,
          totalCaloriesBurned: 0,
          totalElevationGain: 0,
          totalSteps: 0,
          screenshotsUploaded: 0,
          aiExtractionUses: 0,
          avgExtractionConfidence: 0,
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
          fastest5kTime: null,
          fastest5kDate: null,
          fastest10kTime: null,
          fastest10kDate: null,
          longestRunDistance: 0,
          longestRunDate: null,
          totalAchievements: 0,
        });
      }

      // Update basic stats
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

      // Update weekly/monthly stats
      await this.updateTimeBasedStats(userStats, extractedData);

      // Update personal records if this is a personal best
      if (isPersonalBest && extractedData.distance && extractedData.duration) {
        await this.updatePersonalRecords(userStats, extractedData);
        userStats.totalAchievements += 1;
      }

      await this.userStatsRepo.save(userStats);

      // Update main user record
      await this.updateMainUserStats(fid, userStats, extractedData);

      this.logger.log(`Updated user stats for user ${fid}`);
    } catch (error) {
      this.logger.error(`Error updating user stats for user ${fid}:`, error);
      throw error;
    }
  }

  private async updateTimeBasedStats(
    userStats: UserStats,
    extractedData: ExtractedWorkoutData,
  ): Promise<void> {
    const today = new Date();
    const currentWeekStart = this.getWeekStartDate();

    // Check if we need to reset weekly stats
    if (
      !userStats.weeklyStatsLastReset ||
      new Date(userStats.weeklyStatsLastReset) < currentWeekStart
    ) {
      userStats.lastWeekDistance = Number(userStats.thisWeekDistance || 0);
      userStats.lastWeekRuns = userStats.thisWeekRuns || 0;
      userStats.thisWeekDistance = 0;
      userStats.thisWeekRuns = 0;
      userStats.thisWeekTime = 0;
      userStats.weeklyStatsLastReset = today;
    }

    // Update current week stats
    userStats.thisWeekDistance = Number(
      (
        Number(userStats.thisWeekDistance || 0) + (extractedData.distance || 0)
      ).toFixed(2),
    );
    userStats.thisWeekRuns += 1;
    userStats.thisWeekTime += extractedData.duration || 0;

    // Monthly stats logic
    const currentMonth = today.getFullYear() * 100 + today.getMonth();
    const lastMonthReset = userStats.monthlyStatsLastReset
      ? new Date(userStats.monthlyStatsLastReset)
      : null;
    const lastMonth = lastMonthReset
      ? lastMonthReset.getFullYear() * 100 + lastMonthReset.getMonth()
      : null;

    if (!lastMonthReset || lastMonth < currentMonth) {
      userStats.lastMonthDistance = Number(userStats.thisMonthDistance || 0);
      userStats.lastMonthRuns = userStats.thisMonthRuns || 0;
      userStats.thisMonthDistance = 0;
      userStats.thisMonthRuns = 0;
      userStats.thisMonthTime = 0;
      userStats.monthlyStatsLastReset = today;
    }

    // Update current month stats
    userStats.thisMonthDistance = Number(
      (
        Number(userStats.thisMonthDistance || 0) + (extractedData.distance || 0)
      ).toFixed(2),
    );
    userStats.thisMonthRuns += 1;
    userStats.thisMonthTime += extractedData.duration || 0;
  }

  private async updatePersonalRecords(
    userStats: UserStats,
    extractedData: ExtractedWorkoutData,
  ): Promise<void> {
    const today = new Date();

    // Update 5K personal best
    if (Math.abs(extractedData.distance - 5) < 0.1) {
      if (
        !userStats.fastest5kTime ||
        extractedData.duration < userStats.fastest5kTime
      ) {
        userStats.fastest5kTime = extractedData.duration;
        userStats.fastest5kDate = today;
      }
    }

    // Update 10K personal best
    if (Math.abs(extractedData.distance - 10) < 0.1) {
      if (
        !userStats.fastest10kTime ||
        extractedData.duration < userStats.fastest10kTime
      ) {
        userStats.fastest10kTime = extractedData.duration;
        userStats.fastest10kDate = today;
      }
    }

    // Update longest run
    if (
      !userStats.longestRunDistance ||
      extractedData.distance > userStats.longestRunDistance
    ) {
      userStats.longestRunDistance = extractedData.distance;
      userStats.longestRunDate = today;
    }
  }

  private async updateMainUserStats(
    fid: number,
    userStats: UserStats,
    extractedData: ExtractedWorkoutData,
  ): Promise<void> {
    const user = await this.getUserByFid(fid);

    const totalRuns = user.totalRuns + 1;
    const totalDistance = user.totalDistance + extractedData.distance;
    const totalTimeMinutes = user.totalTimeMinutes + extractedData.duration;

    // Calculate weekly and monthly totals
    const totalWeeklyDistance =
      (userStats.thisWeekDistance || 0) + (userStats.thisMonthDistance || 0);
    const totalWeeklyTime =
      (userStats.thisWeekTime || 0) + (userStats.thisMonthTime || 0);

    await this.userRepo.update(user.id, {
      totalRuns,
      totalDistance,
      totalTimeMinutes,
      lastRunDate: new Date(),
      lastActiveAt: new Date(),
    });
  }

  // ================================
  // VALIDATION & BAN SYSTEM
  // ================================

  private async validateWorkoutData(
    fid: number,
    extractedData: ExtractedWorkoutData,
  ): Promise<{ isValid: boolean; reason?: string; confidence: number }> {
    const user = await this.getUserByFid(fid);

    // Check if user is banned
    const banStatus = await this.isUserBanned(user.id);
    if (banStatus.isBanned) {
      return {
        isValid: false,
        reason: 'User is currently banned from submitting workouts',
        confidence: 0,
      };
    }

    // Basic validation
    if (!extractedData.distance || extractedData.distance <= 0) {
      return {
        isValid: false,
        reason: 'Invalid distance',
        confidence: 0,
      };
    }

    if (!extractedData.duration || extractedData.duration <= 0) {
      return {
        isValid: false,
        reason: 'Invalid duration',
        confidence: 0,
      };
    }

    // Suspicious pattern detection
    const suspiciousPatterns = this.detectSuspiciousPatterns(extractedData);
    if (suspiciousPatterns.length > 0) {
      return {
        isValid: false,
        reason: `Suspicious patterns detected: ${suspiciousPatterns.join(', ')}`,
        confidence: 0.3,
      };
    }

    // Confidence-based validation
    const confidence = extractedData.confidence || 0.5;
    if (confidence < 0.3) {
      return {
        isValid: false,
        reason: 'Low confidence in extracted data',
        confidence,
      };
    }

    return {
      isValid: true,
      confidence,
    };
  }

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
      paceMinutes = paceMinutes * 1.609;
    }

    return paceMinutes;
  }

  private async handleInvalidWorkoutSubmission(
    fid: number,
    validationResult: { isValid: boolean; reason?: string; confidence: number },
  ): Promise<{
    isBanned: boolean;
    banExpiresAt?: Date;
    invalidSubmissions: number;
  }> {
    const user = await this.getUserByFid(fid);
    const newInvalidCount = user.invalidWorkoutSubmissions + 1;

    if (newInvalidCount >= 3) {
      // Check if user is already banned
      if (user.isBanned && user.banExpiresAt) {
        const now = new Date();
        if (now < user.banExpiresAt) {
          // Still banned
          return {
            isBanned: true,
            banExpiresAt: user.banExpiresAt,
            invalidSubmissions: newInvalidCount,
          };
        } else {
          // Ban has expired, reset it
          await this.userRepo.update(user.id, {
            isBanned: false,
            bannedAt: null,
            banExpiresAt: null,
            invalidWorkoutSubmissions: 0,
          });
          return {
            isBanned: false,
            invalidSubmissions: 0,
          };
        }
      }

      // Ban the user for 1 week
      const banExpiresAt = new Date();
      banExpiresAt.setDate(banExpiresAt.getDate() + 7); // 1 week ban

      await this.userRepo.update(user.id, {
        invalidWorkoutSubmissions: newInvalidCount,
        isBanned: true,
        bannedAt: new Date(),
        banExpiresAt,
        lastBanStart: new Date(),
        lastBanExpires: banExpiresAt,
        lastBanReason:
          validationResult.reason || 'Multiple invalid submissions',
        totalBans: user.totalBans + 1,
      });

      this.logger.warn(
        `User ${fid} banned for 1 week due to ${newInvalidCount} invalid workout submissions`,
      );

      return {
        isBanned: true,
        banExpiresAt,
        invalidSubmissions: newInvalidCount,
      };
    } else {
      await this.userRepo.update(user.id, {
        invalidWorkoutSubmissions: newInvalidCount,
      });

      this.logger.warn(
        `User ${fid} has ${newInvalidCount} invalid workout submissions`,
      );

      return {
        isBanned: false,
        invalidSubmissions: newInvalidCount,
      };
    }
  }

  public async isUserBanned(fid: number): Promise<{
    isBanned: boolean;
    banExpiresAt?: Date;
    remainingDays?: number;
  }> {
    const user = await this.getUserByFid(fid);

    if (!user.isBanned || !user.banExpiresAt) {
      return {
        isBanned: false,
      };
    }

    const now = new Date();
    if (now >= user.banExpiresAt) {
      // Ban has expired, reset it
      await this.userRepo.update(user.id, {
        isBanned: false,
        bannedAt: null,
        banExpiresAt: null,
      });

      return {
        isBanned: false,
      };
    }

    const remainingDays = Math.ceil(
      (user.banExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      isBanned: true,
      banExpiresAt: user.banExpiresAt,
      remainingDays,
    };
  }

  public async getUserValidationStatus(userFid: number): Promise<{
    invalidSubmissions: number;
    isBanned: boolean;
    banExpiresAt?: Date;
    remainingDays?: number;
    warningsRemaining: number;
  }> {
    const user = await this.getUserByFid(userFid);
    const banStatus = await this.isUserBanned(user.id);

    const warningsRemaining = Math.max(
      0,
      3 - (user.invalidWorkoutSubmissions || 0),
    );

    return {
      invalidSubmissions: user.invalidWorkoutSubmissions || 0,
      isBanned: banStatus.isBanned,
      banExpiresAt: banStatus.banExpiresAt,
      remainingDays: banStatus.remainingDays,
      warningsRemaining,
    };
  }
}
