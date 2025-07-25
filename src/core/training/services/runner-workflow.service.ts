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

import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
import {
  ScreenshotProcessorService,
  ExtractedWorkoutData,
} from './screenshot-processor.service';
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
}

@Injectable()
export class RunnerWorkflowService {
  private readonly logger = new Logger(RunnerWorkflowService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(RunningSession)
    private readonly runningSessionRepo: Repository<RunningSession>,
    private readonly screenshotProcessor: ScreenshotProcessorService,
  ) {}

  // ================================
  // PROCESS WORKOUT SESSION
  // ================================

  async processWorkoutSession(
    data: WorkoutSessionData,
  ): Promise<ProcessedWorkoutResult> {
    try {
      const user = await this.getUserByFid(data.userFid);

      // Check if user is banned
      const banStatus = await this.isUserBanned(data.userFid);
      if (banStatus.isBanned) {
        throw new BadRequestException(
          `Your account is currently suspended. You can resume using RUNNER on ${banStatus.banExpiresAt?.toLocaleDateString()}.`,
        );
      }

      this.logger.log(
        `Starting workout session processing for user FID ${data.userFid}`,
      );

      // Process screenshots with AI
      const extractedData = await this.screenshotProcessor.processScreenshots(
        data.screenshots,
      );

      // Create RunningSession
      const runningSession = this.runningSessionRepo.create({
        fid: user.fid,
        distanceMeters: extractedData.distance
          ? Math.round(extractedData.distance * 1000)
          : 0,
        castHash: undefined, // Set if you have a cast hash, else leave undefined
        duration: extractedData.duration || 0,
      });

      const savedSession = await this.runningSessionRepo.save(runningSession);

      this.logger.log(
        `Successfully processed workout session for user FID ${data.userFid}`,
      );

      return {
        runningSession: savedSession,
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
    castHash: string,
  ): Promise<RunningSession | null> {
    const user = await this.getUserByFid(userFid);

    const runningSession = await this.runningSessionRepo.findOne({
      where: { castHash },
      relations: ['user'],
    });

    if (!runningSession) {
      throw new NotFoundException('Run not found');
    }

    if (runningSession.fid !== user.fid) {
      throw new NotFoundException('Run not found');
    }

    return runningSession;
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
      },
    });

    return !!todaysRun;
  }

  private isStreakAtRisk(user: User): boolean {
    if (!user.lastActiveAt || user.currentStreak === 0) return false;

    const today = new Date();
    const lastRun = new Date(user.lastActiveAt);
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
    const distance = run.distanceMeters / 1000;
    const time = run.duration;

    // No personal best logic available

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

    // No personal best logic available

    const distance = run.distanceMeters / 1000;
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
      isPersonalBest: false,
      personalBestType: undefined,
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
  // VALIDATION & BAN SYSTEM
  // ================================

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

  public async isUserBanned(fid: number): Promise<{
    isBanned: boolean;
    banExpiresAt?: Date;
    remainingDays?: number;
  }> {
    const user = await this.getUserByFid(fid);

    if (!user.isBanned || !user.bannedAt) {
      return {
        isBanned: false,
      };
    }

    return {
      isBanned: true,
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
    const banStatus = await this.isUserBanned(user.fid);

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
