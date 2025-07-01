// src/models/User/User.model.ts

import { NotificationQueue } from '../NotificationQueue';
import { TrainingPlan } from '../TrainingPlan/TrainingPlan.model';
import { CompletedRun } from '../CompletedRun/CompletedRun.model';
import { UserStats } from '../UserStats/UserStats.model'; // Fixed import path
import { Achievement } from '../Streaks/Streaks.model';
import { CoachInteraction } from '../RunningCoach/RunningCoach.model';
import { FarcasterCast } from '../FarcasterCast/FarcasterCast.model';

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

  @Column({ type: 'json', nullable: true })
  preferences: {
    reminderTime?: string;
    timezone?: string;
    coachPersonality?: 'motivational' | 'supportive' | 'strict';
    shareByDefault?: boolean;
    privateProfile?: boolean;
  };

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

  @OneToMany(() => CompletedRun, (run) => run.user, { cascade: true })
  completedRuns: CompletedRun[];

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
