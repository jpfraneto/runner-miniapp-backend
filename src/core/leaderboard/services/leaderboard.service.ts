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
  // Week zero date: July 19, 2024 at 18:00:00.000Z (3 PM Chile time)
  private readonly WEEK_ZERO_DATE = new Date('2024-07-19T18:00:00.000Z');
  // Chile timezone offset: UTC-3
  private readonly CHILE_OFFSET = -3 * 60; // -3 hours in minutes

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
  async getWeeklyLeaderboard(
    weekNumber: number,
    year: number = 2024,
  ): Promise<Leaderboard> {
    // First try to get from LeaderboardHistory table (pre-calculated)
    const historicalEntries = await this.leaderboardHistoryRepo.find({
      where: { weekNumber },
      relations: ['user'],
      order: { rank: 'ASC' },
    });

    if (historicalEntries.length > 0) {
      return historicalEntries.map((entry, index) => ({
        position: entry.rank,
        fid: entry.user.fid,
        username: entry.user.username,
        totalKilometers: Number(entry.distanceKm),
        totalRuns: 1, // We don't store runs count in LeaderboardHistory, so default to 1
      }));
    }

    // If no historical data, calculate from running sessions
    const weekRange = this.getWeekRange(weekNumber);
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
   * Get current week number (0-based, starting from July 19, 2024)
   */
  private getCurrentWeekNumber(): number {
    const now = new Date();
    const chileTime = this.convertToChileTime(now);

    // Calculate weeks since week zero
    const diffInMs = chileTime.getTime() - this.WEEK_ZERO_DATE.getTime();
    const weeksSinceZero = Math.floor(diffInMs / (7 * 24 * 60 * 60 * 1000));

    return Math.max(0, weeksSinceZero);
  }

  /**
   * Convert UTC time to Chile time (UTC-3)
   */
  private convertToChileTime(utcDate: Date): Date {
    const chileTime = new Date(
      utcDate.getTime() + this.CHILE_OFFSET * 60 * 1000,
    );
    return chileTime;
  }

  /**
   * Get start and end dates for a specific week
   */
  private getWeekRange(weekNumber: number): { startDate: Date; endDate: Date } {
    // Week resets every Friday at 3 PM Chile time
    const weekStart = new Date(this.WEEK_ZERO_DATE);
    weekStart.setTime(
      weekStart.getTime() + weekNumber * 7 * 24 * 60 * 60 * 1000,
    );

    const weekEnd = new Date(weekStart);
    weekEnd.setTime(weekEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

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
