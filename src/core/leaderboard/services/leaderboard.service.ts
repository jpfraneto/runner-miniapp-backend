// src/core/leaderboard/services/leaderboard.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaderboardHistory } from '../../../models/LeaderboardHistory/LeaderboardHistory.model';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
import { User } from '../../../models/User/User.model';

export interface LeaderboardEntry {
  position: number;
  fid: number;
  username: string;
  totalKilometers: number;
  totalRuns: number;
}

export type Leaderboard = LeaderboardEntry[];

@Injectable()
export class LeaderboardService {
  // Week resets every Friday at 3pm Chile time (UTC-3)
  // Week counter starts from 0 (first week with data)
  private readonly CHILE_TIMEZONE_OFFSET = -3; // UTC-3
  private readonly WEEK_RESET_DAY = 5; // Friday (0 = Sunday, 1 = Monday, ..., 5 = Friday)
  private readonly WEEK_RESET_HOUR = 15; // 3 PM

  // Reference date for the end of week 0 - this is when the first leaderboard ended
  private readonly WEEK_ZERO_END_DATE = new Date('2023-12-22T18:00:00.000Z');

  constructor(
    @InjectRepository(LeaderboardHistory)
    private readonly leaderboardHistoryRepo: Repository<LeaderboardHistory>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepo: Repository<RunningSession>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Get current week's leaderboard
   */
  async getCurrentLeaderboard(): Promise<Leaderboard> {
    const currentWeek = this.getCurrentWeekNumber();
    const weekRange = this.getWeekRange(currentWeek);

    // Get running sessions for current week
    const sessions = await this.runningSessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where(
        'session.createdAt >= :startDate AND session.createdAt < :endDate',
        {
          startDate: weekRange.startDate.toISOString(),
          endDate: weekRange.endDate.toISOString(),
        },
      )
      .getMany();

    return this.buildLeaderboardFromSessions(sessions);
  }

  /**
   * Get leaderboard for specific week
   */
  async getWeeklyLeaderboard(weekNumber: number): Promise<Leaderboard> {
    console.log(
      '🏆 [LeaderboardService] Getting leaderboard for week',
      weekNumber,
    );

    // Get week range for the specified week
    const weekRange = this.getWeekRange(weekNumber);

    console.log('🏆 [LeaderboardService] Week range:', {
      startDate: weekRange.startDate,
      endDate: weekRange.endDate,
    });

    // Get all running sessions for the specified week
    const sessions = await this.runningSessionRepo
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where(
        'session.createdAt >= :startDate AND session.createdAt < :endDate',
        {
          startDate: weekRange.startDate.toISOString(),
          endDate: weekRange.endDate.toISOString(),
        },
      )
      .getMany();

    console.log(
      '🏆 [LeaderboardService] Found sessions for week:',
      sessions.length,
    );

    return this.buildLeaderboardFromSessions(sessions);
  }

  /**
   * Get current week number (0-based, starting from week 0 reference)
   */
  private getCurrentWeekNumber(): number {
    const now = this.getChileTime();

    // Calculate the start of week 0 (7 days before the end date)
    const weekZeroStart = new Date(this.WEEK_ZERO_END_DATE);
    weekZeroStart.setDate(this.WEEK_ZERO_END_DATE.getDate() - 7);

    // Calculate the current week start (last Friday 3pm)
    let currentWeekStart = new Date(now);
    const daysSinceFriday = (now.getDay() - this.WEEK_RESET_DAY + 7) % 7;

    if (
      now.getDay() === this.WEEK_RESET_DAY &&
      now.getHours() >= this.WEEK_RESET_HOUR
    ) {
      // It's Friday after 3pm, so we're in the new week
      currentWeekStart.setHours(this.WEEK_RESET_HOUR, 0, 0, 0);
    } else {
      // Go back to the last Friday 3pm
      currentWeekStart.setDate(now.getDate() - daysSinceFriday);
      currentWeekStart.setHours(this.WEEK_RESET_HOUR, 0, 0, 0);
    }

    // Calculate weeks since week zero start
    const timeDiff = currentWeekStart.getTime() - weekZeroStart.getTime();
    const weeksDiff = Math.floor(timeDiff / (7 * 24 * 60 * 60 * 1000));

    return Math.max(0, weeksDiff);
  }

  /**
   * Get current time in Chile timezone (UTC-3)
   */
  private getChileTime(): Date {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const chileTime = new Date(utc + this.CHILE_TIMEZONE_OFFSET * 3600000);
    return chileTime;
  }

  /**
   * Get start and end dates for a specific week
   */
  private getWeekRange(weekNumber: number): { startDate: Date; endDate: Date } {
    // Calculate the start of week 0 (7 days before the end date)
    const weekZeroStart = new Date(this.WEEK_ZERO_END_DATE);
    weekZeroStart.setDate(this.WEEK_ZERO_END_DATE.getDate() - 7);

    // Calculate the start of the specified week (Friday 3pm)
    const weekStart = new Date(weekZeroStart);
    weekStart.setDate(weekZeroStart.getDate() + weekNumber * 7);
    weekStart.setHours(this.WEEK_RESET_HOUR, 0, 0, 0);

    // Calculate the end of the week (next Friday 3pm)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    weekEnd.setHours(this.WEEK_RESET_HOUR, 0, 0, 0);

    return {
      startDate: weekStart,
      endDate: weekEnd,
    };
  }

  /**
   * Build leaderboard from running sessions
   */
  private buildLeaderboardFromSessions(
    sessions: RunningSession[],
  ): Leaderboard {
    // Group sessions by user
    const userStats = new Map<
      number,
      {
        user: User;
        totalDistance: number;
        totalRuns: number;
      }
    >();

    console.log('🏆 [LeaderboardService] Sessions:', sessions);

    sessions.forEach((session) => {
      if (!session.user) return;

      const fid = session.user.fid;
      const existing = userStats.get(fid);

      if (existing) {
        existing.totalDistance += (session.distanceMeters || 0) / 1000; // Convert to km
        existing.totalRuns += 1;
      } else {
        userStats.set(fid, {
          user: session.user,
          totalDistance: (session.distanceMeters || 0) / 1000, // Convert to km
          totalRuns: 1,
        });
      }
    });

    console.log('🏆 [LeaderboardService] User stats:', userStats);

    // Convert to leaderboard entries and sort by total distance
    const entries: LeaderboardEntry[] = Array.from(userStats.entries())
      .map(([fid, stats]) => ({
        position: 0, // Will be set after sorting
        fid,
        username: stats.user.username,
        totalKilometers: Math.round(stats.totalDistance * 100) / 100, // Round to 2 decimal places
        totalRuns: stats.totalRuns,
        pfpUrl: stats.user.pfpUrl,
      }))
      .sort((a, b) => b.totalKilometers - a.totalKilometers);

    // Set positions
    entries.forEach((entry, index) => {
      entry.position = index + 1;
    });

    return entries;
  }
}
