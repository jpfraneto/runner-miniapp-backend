// src/models/TrainingPlan/TrainingPlan.model.ts

/**
 * TRAINING PLAN MODEL
 *
 * PURPOSE: Represents a long-term training cycle (e.g., "16-week Marathon Training")
 *
 * HIERARCHY ROLE: TOP LEVEL
 * - This is the master plan that contains multiple weeks of training
 * - Examples: "Marathon Training", "5K Speed Program", "Consistency Building"
 * - Typically spans 8-20 weeks depending on the goal
 *
 * RELATIONSHIPS:
 * - Belongs to: User (one user can have multiple training plans)
 * - Contains: Multiple WeeklyTrainingPlans (Week 1, Week 2, etc.)
 * - Contains: All PlannedSessions across all weeks
 * - Contains: All CompletedRuns related to this training cycle
 *
 * KEY FEATURES:
 * - Defines the overall goal (Marathon, 5K, consistency, etc.)
 * - Sets weekly frequency (3x, 4x, 5x per week)
 * - Tracks progress through currentWeek
 * - Can be paused, completed, or archived
 * - AI generates the overall strategy and progression
 *
 * EXAMPLE USAGE:
 * - "Show me all my training plans"
 * - "What's my current training goal?"
 * - "How many weeks left in my marathon plan?"
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
import { User } from '../User/User.model';
import { WeeklyTrainingPlan } from '../WeeklyTrainingPlan';
import { PlannedSession } from '../PlannedSession';

export enum GoalTypeEnum {
  CONSISTENCY = 'consistency',
  MARATHON = 'marathon',
  HALF_MARATHON = 'half_marathon',
  TEN_K = '10k',
  FIVE_K = '5k',
  CUSTOM = 'custom',
}

export enum PlanStatusEnum {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

@Entity({ name: 'training_plans' })
export class TrainingPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: GoalTypeEnum,
    default: GoalTypeEnum.CONSISTENCY,
  })
  goalType: GoalTypeEnum;

  @Column({ nullable: true })
  customGoalDescription: string;

  @Column({ type: 'date', nullable: true })
  targetDate: Date; // Race date or goal completion date

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column({ default: 3 })
  weeklyFrequency: number; // 2x, 3x, 4x per week

  @Column({ nullable: true })
  totalWeeks: number; // e.g., 16 weeks for marathon

  @Column({
    type: 'enum',
    enum: PlanStatusEnum,
    default: PlanStatusEnum.ACTIVE,
  })
  status: PlanStatusEnum;

  @Column({ default: 1 })
  currentWeek: number; // Which week are we on?

  @Column({ type: 'text', nullable: true })
  description: string;

  // AI generated plan fields (converted from JSON)
  @Column({ type: 'text', nullable: true })
  planSummary: string; // AI-generated plan summary

  @Column({ type: 'text', nullable: true })
  keyWorkouts: string; // Comma-separated list of key workouts

  @Column({ type: 'text', nullable: true })
  progressionStrategy: string; // AI-generated progression strategy

  @Column({ nullable: true })
  peakWeek: number; // Which week is the peak week

  @Column({ type: 'text', nullable: true })
  taperWeeks: string; // Comma-separated list of taper week numbers

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.trainingPlans)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => WeeklyTrainingPlan, (week) => week.trainingPlan, {
    cascade: true,
  })
  weeklyPlans: WeeklyTrainingPlan[];

  @OneToMany(() => PlannedSession, (session) => session.trainingPlan)
  allPlannedSessions: PlannedSession[];
}
