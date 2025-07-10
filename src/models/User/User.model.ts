// src/models/User/User.model.ts

import { NotificationQueue } from '../NotificationQueue';
import { TrainingPlan } from '../TrainingPlan/TrainingPlan.model';
import { UserStats } from '../UserStats/UserStats.model'; // Fixed import path
import { Achievement } from '../Streaks/Streaks.model';
import { CoachInteraction } from '../RunningCoach/RunningCoach.model';
import { FarcasterCast } from '../FarcasterCast/FarcasterCast.model';
import { RunningSession } from '../RunningSession/RunningSession.model';

/**
 * @file This file defines the User entity with its properties and relationships.
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';

// Types
import { UserRoleEnum } from './User.types';

/**
 * @class User
 * @classdesc User class represents a user in the RUNNER system.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  // ================================
  // FARCASTER IDENTITY
  // ================================

  @Column({
    unique: true,
    nullable: false,
  })
  fid: number;

  @Column()
  username: string;

  @Column({
    default: null,
    nullable: true,
  })
  pfpUrl: string;

  // ================================
  // USER ROLE & PERMISSIONS
  // ================================

  @Column({
    type: 'enum',
    enum: UserRoleEnum,
    default: UserRoleEnum.USER,
  })
  role: UserRoleEnum;

  // ================================
  // NOTIFICATION SETTINGS
  // ================================

  @Column({
    default: false,
  })
  notificationsEnabled: boolean;

  @Column({
    default: null,
    nullable: true,
  })
  notificationToken: string;

  @Column({
    default: null,
    nullable: true,
  })
  notificationUrl: string;

  @Column({
    default: null,
    nullable: true,
  })
  lastRunReminderSent: Date;

  // ================================
  // RUNNER TOKEN ECONOMY
  // ================================

  @Column({ default: 0 })
  runnerTokens: number;

  @Column({ default: 0 })
  lifetimeTokensEarned: number;

  @Column({ default: 0 })
  tokensSpent: number;

  // ================================
  // QUICK STATS (Denormalized for performance)
  // ================================

  @Column({ default: 0 })
  totalRuns: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  totalDistance: number;

  @Column({ default: 0 })
  totalTimeMinutes: number;

  @Column({ default: 0 })
  currentStreak: number;

  @Column({ default: 0 })
  longestStreak: number;

  @Column({ default: 0 })
  weeklyCompletions: number;

  // ================================
  // CURRENT STATUS
  // ================================

  @Column({ nullable: true })
  currentGoal: string;

  @Column({ type: 'date', nullable: true })
  lastRunDate: Date;

  @Column({ default: false })
  hasActiveTrainingPlan: boolean;

  @Column({ default: false })
  hasCompletedOnboarding: boolean;

  // ================================
  // SOCIAL & SHARING
  // ================================

  @Column({ default: 0 })
  totalShares: number;

  @Column({ default: 0 })
  totalLikes: number;

  @Column({ default: 0 })
  following: number;

  @Column({ default: 0 })
  followers: number;

  // ================================
  // WORKOUT VALIDATION & BAN SYSTEM
  // ================================

  @Column({ default: 0 })
  invalidWorkoutSubmissions: number; // Count of invalid workout submissions

  @Column({ default: false })
  isBanned: boolean; // Whether user is currently banned

  @Column({ type: 'timestamp', nullable: true })
  bannedAt: Date; // When the ban started

  @Column({ type: 'timestamp', nullable: true })
  banExpiresAt: Date; // When the ban expires (1 week from ban start)

  // Ban history fields (converted from JSON)
  @Column({ type: 'timestamp', nullable: true })
  lastBanStart: Date; // When the last ban started

  @Column({ type: 'timestamp', nullable: true })
  lastBanExpires: Date; // When the last ban expires

  @Column({ nullable: true })
  lastBanReason: string; // Reason for the last ban

  @Column({ default: 0 })
  totalBans: number; // Total number of bans

  // ================================
  // PREFERENCES
  // ================================

  @Column({
    type: 'enum',
    enum: ['metric', 'imperial'],
    default: 'metric',
  })
  unitPreference: 'metric' | 'imperial';

  @Column({
    type: 'enum',
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner',
  })
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced';

  @Column({ default: 3 })
  preferredWeeklyFrequency: number;

  // User preferences fields (converted from JSON)
  @Column({ nullable: true })
  reminderTime: string; // e.g., "07:00"

  @Column({ nullable: true })
  timezone: string; // e.g., "America/New_York"

  @Column({
    type: 'enum',
    enum: ['motivational', 'supportive', 'strict'],
    default: 'motivational',
  })
  coachPersonality: 'motivational' | 'supportive' | 'strict';

  @Column({ default: false })
  shareByDefault: boolean; // Whether to share workouts by default

  @Column({ default: false })
  privateProfile: boolean; // Whether profile is private

  // ================================
  // TIMESTAMPS
  // ================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  statsLastCalculated: Date;

  // ================================
  // RELATIONSHIPS
  // ================================

  @OneToMany(
    () => NotificationQueue,
    (notificationQueue) => notificationQueue.user,
    { cascade: true },
  )
  notificationQueue: NotificationQueue[];

  @OneToMany(() => TrainingPlan, (plan) => plan.user, { cascade: true })
  trainingPlans: TrainingPlan[];

  @OneToMany(() => RunningSession, (session) => session.user, { cascade: true })
  runningSessions: RunningSession[];

  // ADDED: UserStats relationship (1:1)
  @OneToOne(() => UserStats, (stats) => stats.user, { cascade: true })
  @JoinColumn()
  detailedStats: UserStats;

  @OneToMany(() => Achievement, (achievement) => achievement.user, {
    cascade: true,
  })
  achievements: Achievement[];

  @OneToMany(() => CoachInteraction, (interaction) => interaction.user, {
    cascade: true,
  })
  coachInteractions: CoachInteraction[];

  @OneToMany(() => FarcasterCast, (post) => post.user, { cascade: true })
  farcasterCasts: FarcasterCast[];
}
