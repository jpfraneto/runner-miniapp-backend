// src/models/WeeklyTrainingPlan/WeeklyTrainingPlan.model.ts

/**
 * WEEKLY TRAINING PLAN MODEL
 *
 * PURPOSE: Represents one week within a training cycle
 *
 * HIERARCHY ROLE: MIDDLE LEVEL
 * - Sits between TrainingPlan (overall cycle) and PlannedSession (individual workouts)
 * - Each week has a specific focus and type (build, recovery, peak, taper)
 * - Contains 2-5 planned sessions depending on the training frequency
 *
 * RELATIONSHIPS:
 * - Belongs to: TrainingPlan (Week 5 of "Marathon Training")
 * - Contains: Multiple PlannedSessions (Monday run, Wednesday speed, Saturday long run)
 * - Contains: CompletedRuns from this specific week
 *
 * KEY FEATURES:
 * - Week-specific focus ("Speed work", "Base building", "Recovery")
 * - Week type classification (Build, Recovery, Peak, Taper, Race)
 * - Weekly goals (total distance, total time)
 * - Completion tracking (how many sessions completed vs planned)
 * - AI coach notes specific to this week's objectives
 *
 * WEEK TYPES EXPLAINED:
 * - BUILD: Progressive volume/intensity increase
 * - RECOVERY: Lower volume for adaptation
 * - PEAK: Highest volume/intensity of training cycle
 * - TAPER: Pre-race reduction in volume
 * - RACE: Race week with minimal training
 *
 * EXAMPLE USAGE:
 * - "Show me this week's training plan"
 * - "How did I perform in week 8 of my marathon training?"
 * - "What's the focus for next week?"
 */

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TrainingPlan } from '../TrainingPlan/TrainingPlan.model';
import { PlannedSession } from '../PlannedSession/PlannedSession.model';
import { CompletedRun } from '../CompletedRun/CompletedRun.model';

export enum WeekTypeEnum {
  BUILD = 'build', // Building volume/intensity
  RECOVERY = 'recovery', // Easy recovery week
  PEAK = 'peak', // Highest volume/intensity
  TAPER = 'taper', // Pre-race taper
  RACE = 'race', // Race week
}

@Entity({ name: 'weekly_training_plans' })
export class WeeklyTrainingPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  trainingPlanId: number;

  @Column()
  weekNumber: number; // Week 1, 2, 3, etc. of the training plan

  @Column({ type: 'date' })
  weekStartDate: Date;

  @Column({ type: 'date' })
  weekEndDate: Date;

  @Column({
    type: 'enum',
    enum: WeekTypeEnum,
    default: WeekTypeEnum.BUILD,
  })
  weekType: WeekTypeEnum;

  @Column({ nullable: true })
  weeklyGoalDistance: number; // Total km target for the week

  @Column({ nullable: true })
  weeklyGoalTime: number; // Total minutes target for the week

  @Column({ default: 3 })
  plannedSessionsCount: number; // How many runs planned this week

  @Column({ default: 0 })
  completedSessionsCount: number; // How many actually completed

  @Column({ default: false })
  isCompleted: boolean; // Week marked as complete

  @Column({ type: 'text', nullable: true })
  weeklyFocus: string; // "Speed work", "Base building", "Recovery", etc.

  @Column({ type: 'text', nullable: true })
  coachNotes: string; // AI coach notes for this week

  @Column({ type: 'json', nullable: true })
  weeklyTargets: {
    longRunDistance?: number;
    totalVolume?: number;
    keyWorkouts?: string[];
    restDays?: number[]; // Which days of week are rest (0=Sunday, 1=Monday, etc.)
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => TrainingPlan, (plan) => plan.weeklyPlans)
  @JoinColumn({ name: 'trainingPlanId' })
  trainingPlan: TrainingPlan;

  @OneToMany(() => PlannedSession, (session) => session.weeklyTrainingPlan)
  plannedSessions: PlannedSession[];

  @OneToMany(() => CompletedRun, (run) => run.weeklyTrainingPlan)
  completedRuns: CompletedRun[];
}
