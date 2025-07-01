// src/models/UserStats/UserStats.model.ts

/**
 * USER STATS MODEL
 *
 * PURPOSE: Stores detailed analytics and computed metrics for users
 *
 * HIERARCHY ROLE: ANALYTICS LAYER
 * - Separate from User model to keep the main User table fast
 * - Contains heavy analytics that don't need to be queried often
 * - Gets updated periodically (not on every run completion)
 *
 * RELATIONSHIPS:
 * - 1:1 with User (each user has exactly one UserStats record)
 * - Computed from: All CompletedRuns, PlannedSessions, TrainingPlans
 *
 * KEY FEATURES:
 * - Performance metrics (best pace, longest run, averages)
 * - Weekly/monthly aggregates (this week's distance, last month's runs)
 * - Training plan analytics (completion rates, session types)
 * - Social engagement metrics (shares, likes, engagement score)
 * - Streak tracking and history
 * - Health metrics (heart rate, calories, elevation)
 * - Achievement and milestone tracking
 * - App usage analytics
 * - Running app integration stats
 *
 * UPDATE FREQUENCY:
 * - Real-time: streak counters, weekly/monthly totals
 * - Hourly: performance metrics, averages
 * - Daily: historical analysis, engagement scores
 * - Weekly: reset weekly stats, update monthly stats
 *
 * USAGE PATTERNS:
 * - Dashboard: "Show my running stats overview"
 * - Profile: "Display my running achievements"
 * - Analytics: "How has my performance improved?"
 * - Social: "What's my engagement level in the community?"
 *
 * WHY SEPARATE FROM USER MODEL:
 * - User model stays lightweight for authentication and basic operations
 * - UserStats can be heavy with complex calculations
 * - Different update frequencies (User updates constantly, Stats periodically)
 * - Better query performance (don't load stats unless needed)
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../User/User.model';

@Entity({ name: 'user_stats' })
export class UserStats {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  // ================================
  // PERFORMANCE METRICS
  // Best times, longest distances, averages
  // ================================

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  bestPace: number; // Best pace in minutes per km

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  longestRun: number; // Longest single run distance in km

  @Column({ nullable: true })
  longestRunTime: number; // Longest run time in minutes

  @Column({ nullable: true })
  fastestKm: number; // Fastest single km time in seconds

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  avgRunDistance: number; // Average run distance in km

  @Column({ nullable: true })
  avgRunTime: number; // Average run duration in minutes

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  avgPace: number; // Average pace in minutes per km

  // ================================
  // WEEKLY/MONTHLY AGGREGATES
  // Current period stats for quick dashboard display
  // ================================

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  thisWeekDistance: number;

  @Column({ default: 0 })
  thisWeekRuns: number;

  @Column({ default: 0 })
  thisWeekTime: number; // minutes

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  thisMonthDistance: number;

  @Column({ default: 0 })
  thisMonthRuns: number;

  @Column({ default: 0 })
  thisMonthTime: number; // minutes

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  lastWeekDistance: number;

  @Column({ default: 0 })
  lastWeekRuns: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  lastMonthDistance: number;

  @Column({ default: 0 })
  lastMonthRuns: number;

  // ================================
  // TRAINING PLAN METRICS
  // How well do they follow their plans?
  // ================================

  @Column({ default: 0 })
  totalPlannedSessions: number; // All time planned sessions

  @Column({ default: 0 })
  completedPlannedSessions: number; // Successfully completed planned sessions

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  planCompletionRate: number; // Percentage of planned sessions completed

  @Column({ default: 0 })
  intervalSessionsCompleted: number;

  @Column({ default: 0 })
  fixedTimeSessionsCompleted: number;

  @Column({ default: 0 })
  fixedLengthSessionsCompleted: number;

  @Column({ default: 0 })
  freestyleRuns: number; // Runs not part of training plan

  // ================================
  // SOCIAL & ENGAGEMENT METRICS
  // Community participation and sharing
  // ================================

  @Column({ default: 0 })
  workoutsShared: number;

  @Column({ default: 0 })
  totalLikesReceived: number;

  @Column({ default: 0 })
  totalCommentsReceived: number;

  @Column({ default: 0 })
  averageLikesPerShare: number;

  @Column({ default: 0 })
  socialEngagementScore: number; // Computed engagement metric

  // ================================
  // STREAKS & CONSISTENCY
  // Running consistency tracking
  // ================================

  @Column({ type: 'json', nullable: true })
  streakHistory: Array<{
    startDate: string;
    endDate: string;
    length: number;
  }>;

  @Column({ default: 0 })
  totalStreaksStarted: number;

  @Column({ default: 0 })
  streaksOver7Days: number;

  @Column({ default: 0 })
  streaksOver30Days: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  weeklyConsistencyScore: number; // 0-100 based on weekly goal completion

  // ================================
  // HEALTH & FITNESS METRICS
  // Biometric and fitness data
  // ================================

  @Column({ nullable: true })
  avgHeartRate: number;

  @Column({ nullable: true })
  maxHeartRate: number;

  @Column({ default: 0 })
  totalCaloriesBurned: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  totalElevationGain: number; // Total elevation climbed in meters

  @Column({ default: 0 })
  totalSteps: number;

  // ================================
  // ACHIEVEMENTS & MILESTONES
  // Gamification and personal records
  // ================================

  @Column({ default: 0 })
  totalAchievements: number;

  @Column({ default: 0 })
  badgesEarned: number;

  @Column({ default: 0 })
  milestonesReached: number;

  @Column({ type: 'json', nullable: true })
  personalRecords: {
    fastest5k?: { time: number; date: string };
    fastest10k?: { time: number; date: string };
    fastestHalfMarathon?: { time: number; date: string };
    fastestMarathon?: { time: number; date: string };
    longestRun?: { distance: number; date: string };
  };

  // ================================
  // APP USAGE ANALYTICS
  // How they use the RUNNER app
  // ================================

  @Column({ default: 0 })
  totalAppSessions: number;

  @Column({ default: 0 })
  totalTimeInApp: number; // minutes

  @Column({ default: 0 })
  screenshotsUploaded: number;

  @Column({ default: 0 })
  aiExtractionUses: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  avgExtractionConfidence: number; // Average AI confidence score

  @Column({ default: 0 })
  manualDataEntries: number;

  // ================================
  // RUNNING APP INTEGRATION
  // Which external apps they use
  // ================================

  @Column({ type: 'json', nullable: true })
  runningAppsUsed: Array<{
    app: string; // "Strava", "Nike Run Club", etc.
    count: number;
    lastUsed: string;
  }>;

  @Column({ nullable: true })
  mostUsedRunningApp: string;

  // ================================
  // TIMESTAMPS
  // When stats were calculated
  // ================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRecalculated: Date; // When these stats were last computed

  @Column({ type: 'date', nullable: true })
  weeklyStatsLastReset: Date; // When weekly stats were last reset

  @Column({ type: 'date', nullable: true })
  monthlyStatsLastReset: Date; // When monthly stats were last reset

  // ================================
  // RELATIONSHIPS
  // ================================

  @OneToOne(() => User, (user) => user.detailedStats)
  @JoinColumn({ name: 'userId' })
  user: User;
}
