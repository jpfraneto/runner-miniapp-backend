// src/core/leaderboard/services/leaderboard.service.ts

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaderboardHistory } from '../../../models/LeaderboardHistory/LeaderboardHistory.model';
import { RunningSession } from '../../../models/RunningSession/RunningSession.model';
import { User } from '../../../models/User/User.model';
import {
  WEEK_ZERO_END_DATE,
  getCurrentWeekNumber as getWeekNumber,
  getWeekRange as getWeekRangeUtil,
  getWeekForTimestamp,
} from '../../../constants/week-calculation';

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
    const currentWeek = getWeekNumber();
    const weekRange = getWeekRangeUtil(currentWeek);

    console.log('🏆 [LeaderboardService] Current week calculation:');
    console.log('🏆 Current time:', new Date().toISOString());
    console.log('🏆 Current week number:', currentWeek);
    console.log('🏆 Week range:', {
      startDate: weekRange.startDate.toISOString(),
      endDate: weekRange.endDate.toISOString(),
    });

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

    console.log(
      '🏆 [LeaderboardService] Found sessions for current week:',
      sessions.length,
    );
    console.log('🏆 [LeaderboardService] Recent sessions timestamps:');
    sessions.slice(-5).forEach((session) => {
      const sessionWeek = getWeekForTimestamp(session.createdAt);
      console.log(
        `🏆   ${session.user?.username || 'unknown'}: ${session.createdAt.toISOString()} (Week ${sessionWeek})`,
      );
    });

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
    const weekRange = getWeekRangeUtil(weekNumber);

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
   * Get current week number using simplified timestamp math
   */
  getCurrentWeekNumber(): number {
    return getWeekNumber();
  }

  /**
   * Get the next reset time (next Friday 3pm Chile time)
   */
  getNextResetTime(): Date {
    const now = Date.now();
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const msSinceWeekZeroEnd = now - WEEK_ZERO_END_DATE.getTime();
    const weeksPassed = Math.floor(msSinceWeekZeroEnd / WEEK_MS);
    const nextResetMs =
      WEEK_ZERO_END_DATE.getTime() + (weeksPassed + 1) * WEEK_MS;
    return new Date(nextResetMs);
  }

  /**
   * Get start and end dates for a specific week using simplified timestamp math
   */
  getWeekRange(weekNumber: number): { startDate: Date; endDate: Date } {
    return getWeekRangeUtil(weekNumber);
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
