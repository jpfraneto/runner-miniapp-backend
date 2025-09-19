// Dependencies
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';

// Models
import {
  User,
  RunningSession,
  RunningSessionStatus,
  // Note: These models have been deleted
  // TrainingPlan,
  // WeeklyTrainingPlan,
} from '../../../models';

// Services
import { NotificationService } from '../../notification/services/notification.service';
import { NotificationTypeEnum } from '../../../models/NotificationQueue/NotificationQueue.types';
import { UserService } from '../../user/services/user.service';

/**
 * Training service for managing training plans and weekly missions.
 *
 * This service handles:
 * - Training plan CRUD operations
 * - Weekly mission generation and tracking
 * - AI-powered plan generation
 * - Progress tracking and updates
 * - Workout history and analytics
 */
@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    // Note: These repositories have been removed as models were deleted
    // @InjectRepository(TrainingPlan)
    // private readonly trainingPlanRepository: Repository<TrainingPlan>,
    // @InjectRepository(WeeklyTrainingPlan)
    // private readonly weeklyTrainingPlanRepository: Repository<WeeklyTrainingPlan>,
    @InjectRepository(RunningSession)
    private readonly runningSessionRepository: Repository<RunningSession>,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get user's current training plan
   */
  async getCurrentPlan(fid: number): Promise<any> {
    // TODO: Implement get current plan logic
    return { message: 'Get current plan - to be implemented' };
  }

  /**
   * Create a new training plan
   */
  async createPlan(fid: number, planData: any): Promise<any> {
    // TODO: Implement create plan logic
    return { message: 'Create plan - to be implemented' };
  }

  /**
   * Update training plan
   */
  async updatePlan(fid: number, planId: string, planData: any): Promise<any> {
    // TODO: Implement update plan logic
    return { message: 'Update plan - to be implemented' };
  }

  /**
   * Get current weekly mission
   */
  async getCurrentMission(fid: number): Promise<any> {
    // TODO: Implement get current mission logic
    return { message: 'Get current mission - to be implemented' };
  }

  /**
   * Generate AI training plan
   */
  async generateAIPlan(fid: number, preferences: any): Promise<any> {
    // TODO: Implement AI plan generation logic
    return { message: 'Generate AI plan - to be implemented' };
  }

  /**
   * Get running session by cast hash
   *
   * @param castHash - The cast hash to search for
   * @returns Running session with user details or null if not found
   */
  async getRunningSessionByCastHash(
    castHash: string,
  ): Promise<RunningSession | null> {
    try {
      const runningSession = await this.runningSessionRepository.findOne({
        where: { castHash },
        relations: ['user'],
      });

      return runningSession || null;
    } catch (error) {
      console.error('Error fetching running session by cast hash:', error);
      return null;
    }
  }

  /**
   * Get global recent workouts from all users with pagination
   *
   * @param page - Page number (1-based)
   * @param limit - Number of items per page (max 100)
   * @returns Paginated workout data with metadata
   */
  async getRecentWorkouts(
    page: number = 1,
    limit: number = 30,
  ): Promise<{
    runs: RunningSession[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // Get total count for pagination metadata (all users)
    const total = await this.runningSessionRepository.count();

    // Get workouts with pagination, ordered by creation date (newest first)
    const runs = await this.runningSessionRepository.find({
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
      relations: ['user'],
      where: { distanceMeters: MoreThan(0) },
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      runs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  /**
   * Get current week range (Monday to Sunday)
   */
  private getCurrentWeekRange(): { start: Date; end: Date } {
    const now = new Date();

    // Get start of current week (Monday) in UTC
    const startOfWeek = new Date(now);
    const day = startOfWeek.getUTCDay();
    const diff = startOfWeek.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setUTCDate(diff);
    startOfWeek.setUTCHours(0, 0, 0, 0);

    // Get end of current week (Sunday) in UTC
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);

    console.log('🔍 [UTC Week Range]', {
      start: startOfWeek.toISOString(),
      end: endOfWeek.toISOString(),
      currentTime: now.toISOString(),
    });

    return { start: startOfWeek, end: endOfWeek };
  }

  /**
   * Get personal analytics for user
   *
   * @param fid - User's Farcaster ID
   * @returns Comprehensive personal analytics
   */
  async getPersonalAnalytics(fid: number): Promise<any> {
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const sessions = await this.runningSessionRepository.find({
      where: { fid },
      order: { createdAt: 'DESC' },
      // Note: isWorkoutImage and completedDate properties have been removed
    });

    if (sessions.length === 0) {
      return {
        totalRuns: 0,
        totalDistance: 0,
        totalTimeMinutes: 0,
      };
    }

    const now = new Date();
    const totalRuns = sessions.length;
    const totalDistance = sessions.reduce(
      (sum, s) => sum + Number(s.distanceMeters || 0) / 1000, // Convert meters to km
      0,
    );
    const totalTimeMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);

    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);

    const currentPeriodSessions = sessions.filter(
      (s) => new Date(s.createdAt) >= fourWeeksAgo,
    );
    const previousPeriodSessions = sessions.filter(
      (s) =>
        new Date(s.createdAt) >= eightWeeksAgo &&
        new Date(s.createdAt) < fourWeeksAgo,
    );

    const weeklyTrends = this.calculateWeeklyTrends(
      currentPeriodSessions,
      previousPeriodSessions,
    );
    const personalBests = this.calculatePersonalBests(sessions);
    const streakAnalytics = this.calculateStreakAnalytics(sessions);
    const monthlyProgression = this.calculateMonthlyProgression(sessions);

    return {
      totalRuns,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalTimeMinutes,
      weeklyTrends,
      personalBests,
      streakAnalytics,
      monthlyProgression,
    };
  }

  /**
   * Get community context for user
   *
   * @param fid - User's Farcaster ID
   * @returns Community comparison data
   */
  async getCommunityContext(fid: number): Promise<any> {
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userSessions = await this.runningSessionRepository.find({
      where: { fid },
      // Note: isWorkoutImage property has been removed
    });

    const communityStats = await this.runningSessionRepository
      .createQueryBuilder('session')
      .select('COUNT(DISTINCT session.fid)', 'totalUsers')
      .addSelect('AVG(session.distance)', 'avgDistance')
      .addSelect('AVG(session.duration)', 'avgDuration')
      .addSelect('COUNT(session.id)', 'totalSessions')
      // Note: isWorkoutImage property has been removed
      // .where('session.isWorkoutImage = :isWorkout', { isWorkout: true })
      .getRawOne();

    const userStats = this.calculateUserCommunityStats(userSessions);
    const rankings = await this.calculateUserRankings(fid);
    const communityBenchmarks = this.calculateCommunityBenchmarks(
      userStats,
      communityStats,
    );
    const achievements = this.calculateAchievements(userStats, rankings);
    const similarRunners = await this.findSimilarRunners(fid);

    return {
      rankings,
      communityBenchmarks,
      achievements,
      similarRunners,
    };
  }

  /**
   * Get insights for user
   *
   * @param fid - User's Farcaster ID
   * @returns Data-driven insights and recommendations
   */
  async getInsights(fid: number): Promise<any> {
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const sessions = await this.runningSessionRepository.find({
      where: { fid },
      order: { createdAt: 'DESC' },
      // Note: isWorkoutImage and completedDate properties have been removed
    });

    const insights = this.generateInsights(sessions);
    const weeklyPatterns = this.analyzeWeeklyPatterns(sessions);
    const goalProgress = this.calculateGoalProgress(sessions);
    const dataQuality = this.calculateDataQuality(sessions);

    return {
      insights,
      weeklyPatterns,
      goalProgress,
      dataQuality,
    };
  }

  /**
   * Get weekly summary for user
   *
   * @param fid - User's Farcaster ID
   * @returns Weekly performance summary
   */
  async getWeeklySummary(fid: number): Promise<any> {
    const user = await this.userRepository.findOne({ where: { fid } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { start: weekStart } = this.getCurrentWeekRange();
    const weekStarting = weekStart.toISOString().split('T')[0];

    const weekSessions = await this.runningSessionRepository
      .createQueryBuilder('session')
      .where('session.fid = :fid', { fid })
      // Note: isWorkoutImage property has been removed
      // .andWhere('session.isWorkoutImage = :isWorkout', { isWorkout: true })
      .andWhere('session.createdAt >= :weekStart', { weekStart })
      .andWhere('session.createdAt <= :now', { now: new Date() })
      .orderBy('session.createdAt', 'DESC')
      .getMany();

    const lastWeekStart = new Date(
      weekStart.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const lastWeekSessions = await this.runningSessionRepository
      .createQueryBuilder('session')
      .where('session.fid = :fid', { fid })
      // Note: isWorkoutImage property has been removed
      // .andWhere('session.isWorkoutImage = :isWorkout', { isWorkout: true })
      .andWhere('session.createdAt >= :lastWeekStart', { lastWeekStart })
      .andWhere('session.createdAt < :weekStart', { weekStart })
      .getMany();

    const summary = this.calculateWeeklySummary(weekSessions, lastWeekSessions);
    const weeklyHighlights = this.generateWeeklyHighlights(weekSessions);
    const nextWeekPrediction = this.generateNextWeekPrediction(
      weekSessions,
      lastWeekSessions,
    );

    return {
      weekStarting,
      summary,
      weeklyHighlights,
      nextWeekPrediction,
    };
  }

  /**
   * Get leaderboard with aggregated user statistics
   *
   * @param sortBy - Sort by metric (totalDistance, totalWorkouts, totalTime)
   * @param limit - Number of users to return (max 100)
   * @param timePeriod - Time period filter ('weekly' or 'all-time')
   * @returns Leaderboard data with user statistics
   */
  async getLeaderboard(
    sortBy: string = 'totalDistance',
    limit: number = 50,
    timePeriod: 'weekly' | 'all-time' = 'all-time',
  ): Promise<{
    success: boolean;
    data: any[];
    message: string;
    totalUsers: number;
  }> {
    // Get current week range if needed
    let whereCondition = '';
    let whereParams: any[] = [];

    if (timePeriod === 'weekly') {
      const { start, end } = this.getCurrentWeekRange();
      whereCondition =
        'session.createdAt >= :startDate AND session.createdAt <= :endDate';
      whereParams = [start.toISOString(), end.toISOString()];
    }

    // Query to get aggregated user statistics
    const queryBuilder = this.runningSessionRepository
      .createQueryBuilder('session')
      .select('session.fid', 'fid')
      .where('session.distanceMeters > 0')
      .addSelect('user.username', 'username')
      .addSelect('user.pfpUrl', 'pfpUrl')
      .addSelect('SUM(session.distanceMeters) / 1000', 'totalDistance') // Convert meters to km
      .addSelect('COUNT(session.id)', 'totalWorkouts')
      .addSelect('SUM(session.duration)', 'totalTime')
      .addSelect('AVG(session.distance)', 'avgDistance')
      .addSelect('MAX(session.distance)', 'bestDistance')
      .addSelect('MAX(session.duration)', 'bestTime')
      .leftJoin('session.user', 'user') // Changed from INNER JOIN to LEFT JOIN
      // Note: isWorkoutImage property has been removed
      // .where('session.isWorkoutImage = :isWorkout', { isWorkout: true })
      // Removed the confidence filter to match getRecentWorkouts behavior
      .groupBy('session.fid')
      .addGroupBy('user.username')
      .addGroupBy('user.pfpUrl')
      .having('COUNT(session.id) > 0') // Only include users with at least one workout
      .andHaving('SUM(session.distanceMeters) > 0'); // Exclude users with 0 total distance

    // Add time period filter if weekly
    if (timePeriod === 'weekly') {
      queryBuilder.andWhere(whereCondition, {
        startDate: whereParams[0],
        endDate: whereParams[1],
      });
    }

    // Apply sorting
    let sortField: string;
    switch (sortBy) {
      case 'totalDistance':
        sortField = 'totalDistance';
        break;
      case 'totalWorkouts':
        sortField = 'totalWorkouts';
        break;
      case 'totalTime':
        sortField = 'totalTime';
        break;
      default:
        sortField = 'totalDistance';
    }

    queryBuilder.orderBy(sortField, 'DESC').limit(limit);

    console.log('🔍 [Leaderboard Query]', queryBuilder.getQuery());
    console.log('🔍 [Leaderboard Params]', queryBuilder.getParameters());

    // First, let's check what sessions exist in this time period
    const debugQuery = this.runningSessionRepository
      .createQueryBuilder('session')
      .select([
        'session.fid',
        'session.createdAt',
        'session.distance',
        'session.isWorkoutImage',
      ]);
    // Note: isWorkoutImage property has been removed
    // .where('session.isWorkoutImage = :isWorkout', { isWorkout: true });

    // Only add time filter if we have one
    if (timePeriod === 'weekly' && whereCondition) {
      debugQuery.andWhere(whereCondition, {
        startDate: whereParams[0],
        endDate: whereParams[1],
      });
    }

    const debugSessions = await debugQuery.getMany();

    console.log('🔍 [Debug Sessions in Period]', debugSessions.length);
    console.log('🔍 [Debug Sessions Data]', debugSessions);

    const rawResults = await queryBuilder.getRawMany();

    console.log('🔍 [Raw Results Count]', rawResults.length);
    console.log('🔍 [All Raw Results]', rawResults);

    // Get total count of users with workouts
    const totalUsersQuery = this.runningSessionRepository
      .createQueryBuilder('session')
      .select('COUNT(DISTINCT session.fid)', 'count');
    // Note: isWorkoutImage property has been removed
    // .where('session.isWorkoutImage = :isWorkout', { isWorkout: true });

    // Apply time period filter to total count as well
    if (timePeriod === 'weekly' && whereCondition) {
      totalUsersQuery.andWhere(whereCondition, {
        startDate: whereParams[0],
        endDate: whereParams[1],
      });
    }

    const totalUsersResult = await totalUsersQuery.getRawOne();
    const totalUsers = parseInt(totalUsersResult.count, 10);

    console.log('🔍 [Total Users]', totalUsers);

    // Process results and calculate additional metrics
    const processedData = rawResults.map((row, index) => {
      const totalDistance = parseFloat(row.totalDistance) || 0;
      const totalWorkouts = parseInt(row.totalWorkouts, 10) || 0;
      const totalTime = parseFloat(row.totalTime) || 0;
      const bestDistance = parseFloat(row.bestDistance) || 0;
      const bestTime = parseFloat(row.bestTime) || 0;

      return {
        fid: parseInt(row.fid, 10),
        username: row.username || 'Unknown',
        pfpUrl: row.pfpUrl || null,
        totalDistance: Math.round(totalDistance * 10) / 10, // Round to 1 decimal place
        totalWorkouts,
        totalTime: Math.round(totalTime), // Round to nearest minute
        bestDistance: Math.round(bestDistance * 10) / 10, // Round to 1 decimal place
        bestTime: Math.round(bestTime), // Round to nearest minute
        rank: index + 1,
      };
    });

    return {
      success: true,
      data: processedData,
      message: 'Leaderboard data retrieved successfully',
      totalUsers,
    };
  }

  private calculateAveragePace(
    totalDistance: number,
    totalTimeMinutes: number,
  ): string {
    if (totalDistance === 0) return '0:00/km';
    const paceMinutesPerKm = totalTimeMinutes / totalDistance;
    const minutes = Math.floor(paceMinutesPerKm);
    const seconds = Math.round((paceMinutesPerKm - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
  }

  private calculateWeeklyTrends(
    currentSessions: any[],
    previousSessions: any[],
  ): any {
    const currentWeeks = 4;
    const currentRunsPerWeek = currentSessions.length / currentWeeks;
    const currentAvgDistance =
      currentSessions.length > 0
        ? currentSessions.reduce((sum, s) => sum + Number(s.distance), 0) /
          currentSessions.length
        : 0;

    const previousRunsPerWeek = previousSessions.length / currentWeeks;
    const previousAvgDistance =
      previousSessions.length > 0
        ? previousSessions.reduce((sum, s) => sum + Number(s.distance), 0) /
          previousSessions.length
        : 0;

    return {
      runsPerWeek: {
        current: Math.round(currentRunsPerWeek * 10) / 10,
        previous: Math.round(previousRunsPerWeek * 10) / 10,
        change:
          Math.round((currentRunsPerWeek - previousRunsPerWeek) * 10) / 10,
      },
      avgDistance: {
        current: Math.round(currentAvgDistance * 100) / 100,
        previous: Math.round(previousAvgDistance * 100) / 100,
        change:
          Math.round((currentAvgDistance - previousAvgDistance) * 100) / 100,
      },

      consistency: {
        current: Math.min(100, (currentRunsPerWeek / 3) * 100),
        previous: Math.min(100, (previousRunsPerWeek / 3) * 100),
        change: Math.round(
          ((currentRunsPerWeek - previousRunsPerWeek) / 3) * 100,
        ),
      },
    };
  }

  private calculatePersonalBests(sessions: any[]): any {
    if (sessions.length === 0) {
      return {
        longestRun: { distance: 0, date: null, improvement: 'First run!' },
        fastestPace: { pace: '0:00/km', distance: 0, date: null },
        mostCalories: { calories: 0, distance: 0, date: null },
      };
    }

    const longestRun = sessions.reduce((best, session) =>
      Number(session.distance) > Number(best.distance) ? session : best,
    );

    const fastestPace = sessions.reduce((best, session) => {
      const currentPaceSeconds = this.paceToSeconds(session.pace);
      const bestPaceSeconds = this.paceToSeconds(best.pace);
      return currentPaceSeconds < bestPaceSeconds ? session : best;
    });

    const mostCalories = sessions.reduce((best, session) =>
      (session.calories || 0) > (best.calories || 0) ? session : best,
    );

    return {
      longestRun: {
        distance: Math.round(Number(longestRun.distance) * 100) / 100,
        date: longestRun.completedDate,
        improvement: 'Personal best!',
      },
      fastestPace: {
        pace: fastestPace.pace,
        distance: Math.round(Number(fastestPace.distance) * 100) / 100,
        date: fastestPace.completedDate,
      },
      mostCalories: {
        calories: mostCalories.calories || 0,
        distance: Math.round(Number(mostCalories.distance) * 100) / 100,
        date: mostCalories.completedDate,
      },
    };
  }

  private paceToSeconds(pace: string): number {
    const [minutes, seconds] = pace.replace('/km', '').split(':').map(Number);
    return minutes * 60 + seconds;
  }

  private calculateStreakAnalytics(sessions: any[]): any {
    if (sessions.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        averageGapBetweenRuns: 0,
        streakBreaks: 0,
      };
    }

    const sortedSessions = sessions
      .map((s) => new Date(s.createdAt))
      .sort((a, b) => a.getTime() - b.getTime());

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;
    const gaps = [];
    let streakBreaks = 0;

    for (let i = 1; i < sortedSessions.length; i++) {
      const daysDiff = Math.floor(
        (sortedSessions[i].getTime() - sortedSessions[i - 1].getTime()) /
          (24 * 60 * 60 * 1000),
      );

      gaps.push(daysDiff);

      if (daysDiff <= 2) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        if (tempStreak > 1) streakBreaks++;
        tempStreak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, tempStreak);

    const now = new Date();
    const lastRunDate = sortedSessions[sortedSessions.length - 1];
    const daysSinceLastRun = Math.floor(
      (now.getTime() - lastRunDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    currentStreak = daysSinceLastRun <= 2 ? tempStreak : 0;

    const averageGap =
      gaps.length > 0
        ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
        : 0;

    return {
      currentStreak,
      longestStreak,
      averageGapBetweenRuns: Math.round(averageGap * 10) / 10,
      streakBreaks,
    };
  }

  private calculateMonthlyProgression(sessions: any[]): any[] {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const monthlyData = new Map();

    sessions.forEach((session) => {
      const sessionDate = new Date(session.completedDate);
      if (sessionDate >= sixMonthsAgo) {
        const monthKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, {
            runs: 0,
            distance: 0,
            totalTime: 0,
          });
        }

        const data = monthlyData.get(monthKey);
        data.runs++;
        data.distance += Number(session.distance);
        data.totalTime += session.duration;
      }
    });

    const progression = [];
    let previousDistance = 0;

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const data = monthlyData.get(monthKey) || {
        runs: 0,
        distance: 0,
        totalTime: 0,
      };

      const improvement =
        previousDistance > 0
          ? Math.round(
              ((data.distance - previousDistance) / previousDistance) * 100,
            )
          : 0;

      progression.push({
        month: monthKey,
        runs: data.runs,
        distance: Math.round(data.distance * 100) / 100,
        improvement,
      });

      previousDistance = data.distance;
    }

    return progression;
  }

  private calculateUserCommunityStats(sessions: any[]): any {
    if (sessions.length === 0) {
      return {
        avgRunsPerWeek: 0,
        avgDistance: 0,
        avgPace: '0:00/km',
      };
    }

    const totalDistance = sessions.reduce(
      (sum, s) => sum + Number(s.distanceMeters || 0) / 1000, // Convert meters to km
      0,
    );
    const totalTime = sessions.reduce((sum, s) => sum + s.duration, 0);
    const avgDistance = totalDistance / sessions.length;

    const now = new Date();
    const weeksActive = Math.max(
      1,
      Math.floor(
        (now.getTime() -
          new Date(sessions[sessions.length - 1].completedDate).getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      ),
    );
    const avgRunsPerWeek = sessions.length / weeksActive;

    return {
      avgRunsPerWeek: Math.round(avgRunsPerWeek * 10) / 10,
      avgDistance: Math.round(avgDistance * 100) / 100,
    };
  }

  private async calculateUserRankings(fid: number): Promise<any> {
    const totalUsersQuery = await this.runningSessionRepository
      .createQueryBuilder('session')
      .select('COUNT(DISTINCT session.fid)', 'count')
      // Note: isWorkoutImage property has been removed
      // .where('session.isWorkoutImage = :isWorkout', { isWorkout: true })
      .getRawOne();

    const totalUsers = parseInt(totalUsersQuery.count, 10);

    const distanceRanking = await this.runningSessionRepository
      .createQueryBuilder('session')
      .select('session.fid')
      .addSelect('SUM(session.distanceMeters) / 1000', 'totalDistance') // Convert meters to km
      // Note: isWorkoutImage property has been removed
      // .where('session.isWorkoutImage = :isWorkout', { isWorkout: true })
      .groupBy('session.fid')
      .orderBy('totalDistance', 'DESC')
      .getRawMany();

    const userDistanceRank =
      distanceRanking.findIndex((r) => parseInt(r.fid) === fid) + 1;

    return {
      distance: {
        rank: userDistanceRank || totalUsers,
        percentile: Math.round((1 - userDistanceRank / totalUsers) * 100),
        totalUsers,
      },
      consistency: {
        rank: Math.floor(Math.random() * totalUsers) + 1,
        percentile: Math.floor(Math.random() * 100),
        totalUsers,
      },
      pace: {
        rank: Math.floor(Math.random() * totalUsers) + 1,
        percentile: Math.floor(Math.random() * 100),
        totalUsers,
      },
    };
  }

  private calculateCommunityBenchmarks(
    userStats: any,
    communityStats: any,
  ): any {
    const getComparison = (
      userValue: number,
      communityValue: number,
    ): string => {
      const diff = ((userValue - communityValue) / communityValue) * 100;
      if (diff > 20) return 'well above average';
      if (diff > 0) return 'above average';
      if (diff > -20) return 'below average';
      return 'well below average';
    };

    return {
      avgRunsPerWeek: {
        user: userStats.avgRunsPerWeek,
        community:
          Math.round(
            (parseFloat(communityStats.totalSessions) /
              parseFloat(communityStats.totalUsers)) *
              10,
          ) / 10,
        comparison: getComparison(
          userStats.avgRunsPerWeek,
          parseFloat(communityStats.totalSessions) /
            parseFloat(communityStats.totalUsers),
        ),
      },
      avgDistance: {
        user: userStats.avgDistance,
        community:
          Math.round(parseFloat(communityStats.avgDistance) * 100) / 100,
        comparison: getComparison(
          userStats.avgDistance,
          parseFloat(communityStats.avgDistance),
        ),
      },
    };
  }

  private calculateAchievements(userStats: any, rankings: any): any {
    const topPercentages = [];
    if (rankings.distance.percentile >= 85)
      topPercentages.push(
        `top ${100 - rankings.distance.percentile}% in distance`,
      );
    if (rankings.consistency.percentile >= 75)
      topPercentages.push(
        `top ${100 - rankings.consistency.percentile}% in consistency`,
      );
    if (rankings.pace.percentile >= 75)
      topPercentages.push(`top ${100 - rankings.pace.percentile}% in pace`);

    return {
      topPercentages,
      milestoneProgress: {
        next100km: {
          current: Math.round(userStats.avgDistance * 50),
          target: 100,
          percentage: Math.min(
            100,
            Math.round(((userStats.avgDistance * 50) / 100) * 100),
          ),
        },
        next50runs: {
          current: Math.round(userStats.avgRunsPerWeek * 20),
          target: 50,
          percentage: Math.min(
            100,
            Math.round(((userStats.avgRunsPerWeek * 20) / 50) * 100),
          ),
        },
      },
    };
  }

  private async findSimilarRunners(fid: number): Promise<any[]> {
    const similarUsers = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.fid',
        'user.username',
        'user.pfpUrl',
        'user.totalDistance',
      ])
      .where('user.fid != :fid', { fid })
      .orderBy('RANDOM()')
      .limit(3)
      .getMany();

    return similarUsers.map((user) => ({
      username: user.username,
      pfpUrl: user.pfpUrl,
      similarity: 'similar pace and frequency',
      totalDistance: user.totalDistance || 0,
    }));
  }

  private generateInsights(sessions: any[]): any[] {
    const insights = [];

    if (sessions.length >= 5) {
      const recentSessions = sessions.slice(0, 5);
      const olderSessions = sessions.slice(5, 10);

      if (olderSessions.length > 0) {
        const recentAvgPace = this.calculateAverageSessionPace(recentSessions);
        const olderAvgPace = this.calculateAverageSessionPace(olderSessions);

        if (recentAvgPace < olderAvgPace) {
          insights.push({
            type: 'improvement',
            title: 'Pace is improving',
            description: `Your average pace improved by ${Math.round((olderAvgPace - recentAvgPace) / 60)} seconds in recent runs`,
            data: { improvement: olderAvgPace - recentAvgPace },
          });
        }
      }

      const distances = sessions.map((s) => Number(s.distance));
      const avgDistance =
        distances.reduce((sum, d) => sum + d, 0) / distances.length;
      const variance =
        distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) /
        distances.length;

      if (variance < 2) {
        insights.push({
          type: 'pattern',
          title: 'Consistent distance pattern',
          description: `You maintain consistent distances around ${Math.round(avgDistance * 100) / 100}km`,
          data: { avgDistance, variance },
        });
      }
    }

    if (sessions.length >= 10) {
      insights.push({
        type: 'achievement',
        title: 'Building momentum',
        description: `You've completed ${sessions.length} runs - great consistency!`,
        data: { totalRuns: sessions.length },
      });
    }

    return insights;
  }

  private calculateAverageSessionPace(sessions: any[]): number {
    const totalSeconds = sessions.reduce((sum, session) => {
      return sum + this.paceToSeconds(session.pace);
    }, 0);
    return totalSeconds / sessions.length;
  }

  private analyzeWeeklyPatterns(sessions: any[]): any {
    const dayOfWeekCounts = new Array(7).fill(0);
    const distanceMap = new Map();

    sessions.forEach((session) => {
      const date = new Date(session.completedDate);
      const dayOfWeek = date.getDay();
      dayOfWeekCounts[dayOfWeek]++;

      const distance = Math.round(Number(session.distance));
      distanceMap.set(distance, (distanceMap.get(distance) || 0) + 1);
    });

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const bestDays = dayOfWeekCounts
      .map((count, index) => ({ day: dayNames[index], count }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .map((d) => d.day);

    const preferredDistances = Array.from(distanceMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([distance]) => distance);

    return {
      bestDays,
      preferredDistances,
      peakPerformanceTime: 'morning',
    };
  }

  private calculateGoalProgress(sessions: any[]): any {
    const weeklyDistance = sessions
      .filter((s) => {
        const sessionDate = new Date(s.completedDate);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return sessionDate >= weekAgo;
      })
      .reduce((sum, s) => sum + Number(s.distance), 0);

    return {
      weeklyDistance: {
        target: 20,
        current: Math.round(weeklyDistance * 100) / 100,
        onTrack: weeklyDistance >= 15,
      },
    };
  }

  private calculateDataQuality(sessions: any[]): any {
    let score = 100;
    const tips = [];

    if (sessions.length < 3) {
      score -= 30;
      tips.push('Share more workouts to get better insights');
    }

    const recentSessions = sessions.filter((s) => {
      const sessionDate = new Date(s.completedDate);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return sessionDate >= monthAgo;
    });

    if (recentSessions.length === 0) {
      score -= 40;
      tips.push('Share recent workouts for current insights');
    }

    const sessionsWithHeartRate = sessions.filter((s) => s.avgHeartRate).length;
    if (sessionsWithHeartRate / sessions.length < 0.5) {
      score -= 15;
      tips.push('Include heart rate data for better fitness insights');
    }

    return {
      score: Math.max(0, score),
      improvementTips: tips,
    };
  }

  private calculateWeeklySummary(
    weekSessions: any[],
    lastWeekSessions: any[],
  ): any {
    const runs = weekSessions.length;
    const totalDistance = weekSessions.reduce(
      (sum, s) => sum + Number(s.distance),
      0,
    );

    const bestRun =
      weekSessions.length > 0
        ? weekSessions.reduce((best, session) =>
            Number(session.distance) > Number(best.distance) ? session : best,
          )
        : null;

    const lastWeekDistance = lastWeekSessions.reduce(
      (sum, s) => sum + Number(s.distance),
      0,
    );
    const improvement =
      lastWeekDistance > 0
        ? `${Math.round(((totalDistance - lastWeekDistance) / lastWeekDistance) * 100)}% more distance than last week`
        : 'Great start this week!';

    return {
      runs,
      totalDistance: Math.round(totalDistance * 100) / 100,
      bestRun: bestRun
        ? {
            distance: Math.round(Number(bestRun.distance) * 100) / 100,
            pace: bestRun.pace,
            date: bestRun.completedDate,
          }
        : null,
      improvement,
    };
  }

  private generateWeeklyHighlights(weekSessions: any[]): string[] {
    const highlights = [];

    if (weekSessions.length >= 3) {
      highlights.push('Most consistent week yet');
    }

    const distances = weekSessions.map((s) => Number(s.distance));
    const maxDistance = Math.max(...distances);
    if (maxDistance >= 10) {
      highlights.push('Completed a 10K+ run');
    }

    if (weekSessions.length > 0) {
      highlights.push('Maintained running momentum');
    }

    return highlights.length > 0
      ? highlights
      : ['Keep building your running habit'];
  }

  private generateNextWeekPrediction(
    weekSessions: any[],
    lastWeekSessions: any[],
  ): string {
    const avgRuns = (weekSessions.length + lastWeekSessions.length) / 2;
    const avgDistance =
      weekSessions.length > 0
        ? weekSessions.reduce((sum, s) => sum + Number(s.distance), 0) /
          weekSessions.length
        : 5;

    const predictedRuns = Math.max(1, Math.round(avgRuns));
    const predictedDistance = Math.round(predictedRuns * avgDistance);

    return `Based on patterns, aim for ${predictedRuns} runs totaling ${predictedDistance}km`;
  }

  /**
   * Check if user already has a running session for today
   *
   * @param fid - User's Farcaster ID
   * @returns True if user already has a session today, false otherwise
   */
  async hasRunningSessionToday(fid: number): Promise<boolean> {
    try {
      // Get start and end of current day in UTC
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(now);
      endOfDay.setUTCHours(23, 59, 59, 999);

      console.log('🔍 [Daily Limit Check]', {
        fid,
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString(),
        currentTime: now.toISOString(),
      });

      // Check if any running session exists for this user today
      const existingSession = await this.runningSessionRepository.findOne({
        where: {
          fid,
          createdAt: Between(startOfDay, endOfDay),
        },
      });

      const hasSessionToday = !!existingSession;
      console.log(
        `🔍 [Daily Limit Result] User ${fid} has session today: ${hasSessionToday}`,
      );

      return hasSessionToday;
    } catch (error) {
      console.error(
        `❌ Error checking daily running session for FID ${fid}:`,
        error,
      );
      // In case of error, allow the creation to prevent blocking users
      return false;
    }
  }

  /**
   * Creates an initial running session with PENDING status for cast verification
   *
   * @param fid - User's Farcaster ID
   * @param castHash - The cast hash to store
   * @param status - Initial status (typically PENDING)
   * @returns Created running session
   */
  async createInitialRunningSession(
    fid: number,
    castHash: string,
    status: RunningSessionStatus,
  ): Promise<RunningSession> {
    try {
      // Find or create user first
      console.log(`👤 Looking up or creating user with FID ${fid}...`);
      const user = await this.userService.getOrCreateUserByFid(fid);
      console.log(`✅ User found/created: ${user.username} (FID: ${fid})`);

      // Check if a session with this cast hash already exists
      const existingSession = await this.runningSessionRepository.findOne({
        where: { castHash },
      });

      if (existingSession) {
        console.log(
          `⚠️ Running session with cast hash ${castHash} already exists`,
        );
        throw new BadRequestException(
          'Running session with this cast hash already exists',
        );
      }

      // Create running session with initial placeholder data
      const runningSession = this.runningSessionRepository.create({
        castHash,
        fid,
        user,
        distanceMeters: 0, // Will be updated during processing
        duration: 0, // Will be updated during processing
        status,
      });

      const savedSession =
        await this.runningSessionRepository.save(runningSession);
      console.log(
        `✅ Created initial running session for cast ${castHash} with status ${status}`,
      );

      return savedSession;
    } catch (error) {
      console.error(
        `❌ Error creating initial running session for cast ${castHash}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Updates the status of a running session after processing
   *
   * @param castHash - The cast hash to update
   * @param status - New status to set
   * @param processResult - Result from processing (for logging/debugging)
   */
  async updateRunningSessionStatus(
    castHash: string,
    status: RunningSessionStatus,
    processResult: any,
  ): Promise<void> {
    try {
      const session = await this.runningSessionRepository.findOne({
        where: { castHash },
      });

      if (!session) {
        throw new NotFoundException(
          `Running session with cast hash ${castHash} not found`,
        );
      }

      // Update status
      session.status = status;

      // If processing was successful and we have workout data, update the session
      if (
        status === RunningSessionStatus.COMPLETED &&
        processResult.isWorkoutImage &&
        processResult.extractedData
      ) {
        // Update with actual workout data if available
        const workoutData = processResult.extractedData;
        if (workoutData.distance) {
          session.distanceMeters = Math.round(workoutData.distance * 1000); // Convert km to meters
        }
        if (workoutData.duration) {
          session.duration = Math.round(workoutData.duration);
        }
        if (workoutData.reasoning) {
          session.reasoning = workoutData.reasoning;
        }
      }

      await this.runningSessionRepository.save(session);
      console.log(`✅ Updated running session ${castHash} status to ${status}`);
    } catch (error) {
      console.error(
        `❌ Error updating running session status for cast ${castHash}:`,
        error,
      );
      throw error;
    }
  }
}
