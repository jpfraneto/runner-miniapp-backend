// src/models/PlannedSession/PlannedSession.model.ts

/**
 * PLANNED SESSION MODEL
 *
 * PURPOSE: Represents a single planned workout/run
 *
 * HIERARCHY ROLE: DETAILED LEVEL
 * - This is what the AI coach assigns for a specific day
 * - Contains exact instructions for what the user should do
 * - Links to both the overall training plan and the specific week
 *
 * RELATIONSHIPS:
 * - Belongs to: TrainingPlan (overall cycle)
 * - Belongs to: WeeklyTrainingPlan (specific week)
 * - Can have: Multiple CompletedRuns (user might attempt the same session multiple times)
 *
 * SESSION TYPES EXPLAINED:
 * - INTERVALS: Structured speed work (e.g., 8x400m with 90s rest)
 * - FIXED_TIME: Time-based runs (e.g., "Run for 45 minutes")
 * - FIXED_LENGTH: Distance-based runs (e.g., "Run 10km")
 * - TEMPO: Sustained effort runs at threshold pace
 * - LONG_RUN: Weekly long run for endurance
 * - RECOVERY: Easy-paced recovery runs
 * - FARTLEK: Unstructured speed play
 *
 * KEY FEATURES:
 * - Specific targets (distance, time, pace)
 * - Detailed instructions from AI coach
 * - Interval structure for complex workouts
 * - Priority levels (some workouts are more important)
 * - Flexible scheduling options
 * - Motivational messages
 *
 * EXAMPLE USAGE:
 * - "What's my workout for today?"
 * - "Show me all the speed sessions in my plan"
 * - "Did I complete Wednesday's interval workout?"
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../User/User.model';
import { TrainingPlan } from '../TrainingPlan/TrainingPlan.model';
import { WeeklyTrainingPlan } from '../WeeklyTrainingPlan/WeeklyTrainingPlan.model';

export enum SessionTypeEnum {
  INTERVALS = 'intervals',
  FIXED_TIME = 'fixed_time',
  FIXED_LENGTH = 'fixed_length',
  TEMPO = 'tempo',
  LONG_RUN = 'long_run',
  RECOVERY = 'recovery',
  FARTLEK = 'fartlek',
}

export enum SessionPriorityEnum {
  EASY = 'easy', // Optional/flexible session
  MODERATE = 'moderate', // Regular session
  HARD = 'hard', // Important session
  KEY_WORKOUT = 'key_workout', // Must-do session for plan success
}

@Entity({ name: 'planned_sessions' })
export class PlannedSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  trainingPlanId: number;

  @Column()
  weeklyTrainingPlanId: number;

  @Column()
  weekNumber: number; // Redundant but useful for queries

  @Column()
  sessionNumber: number; // 1, 2, or 3 for the week

  @Column({
    type: 'enum',
    enum: SessionTypeEnum,
  })
  sessionType: SessionTypeEnum;

  @Column({
    type: 'enum',
    enum: SessionPriorityEnum,
    default: SessionPriorityEnum.MODERATE,
  })
  priority: SessionPriorityEnum;

  @Column({ type: 'date' })
  scheduledDate: Date;

  @Column({ nullable: true })
  scheduledTimeOfDay: string; // "morning", "evening", or specific time "07:00"

  // SESSION PARAMETERS - What the AI coach prescribes
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  targetDistance: number; // km (for fixed_length)

  @Column({ nullable: true })
  targetTime: number; // minutes (for fixed_time)

  @Column({ nullable: true })
  targetPace: string; // e.g., "5:30/km" (for all types)

  // Interval structure fields (converted from JSON)
  @Column({ nullable: true })
  warmupMinutes: number; // Warmup duration in minutes

  @Column({ nullable: true })
  cooldownMinutes: number; // Cooldown duration in minutes

  @Column({ type: 'text', nullable: true })
  intervalStructure: string; // JSON string for complex interval data (rarely used)

  @Column({ type: 'text', nullable: true })
  instructions: string; // AI coach instructions

  @Column({ type: 'text', nullable: true })
  motivationalMessage: string; // Personalized motivation

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ default: false })
  isKeyWorkout: boolean; // Important session that shouldn't be skipped

  @Column({ default: false })
  allowFlexibleScheduling: boolean; // Can be moved to different day

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => TrainingPlan, (plan) => plan.allPlannedSessions)
  @JoinColumn({ name: 'trainingPlanId' })
  trainingPlan: TrainingPlan;

  @ManyToOne(() => WeeklyTrainingPlan, (week) => week.plannedSessions)
  @JoinColumn({ name: 'weeklyTrainingPlanId' })
  weeklyTrainingPlan: WeeklyTrainingPlan;

  // Remove CompletedRun relationship
}
