// src/models/CompletedRun/CompletedRun.model.ts

/**
 * COMPLETED RUN MODEL
 *
 * PURPOSE: Represents what the user actually did (vs. what was planned)
 *
 * HIERARCHY ROLE: EXECUTION LEVEL
 * - This is where user's real performance data gets stored
 * - Can be linked to planned sessions OR be freestyle runs
 * - Contains data from screenshot uploads and AI extraction
 * - Tracks social sharing and performance analysis
 *
 * RELATIONSHIPS:
 * - Belongs to: User (who did the run)
 * - Can link to: TrainingPlan (optional - null for freestyle runs)
 * - Can link to: WeeklyTrainingPlan (optional - null for freestyle runs)
 * - Can link to: PlannedSession (optional - null for freestyle runs)
 *
 * KEY FEATURES:
 * - Actual performance data (distance, time, pace)
 * - Screenshot processing with GPT-4 Vision
 * - AI confidence scores and extracted metadata
 * - Social sharing integration with Farcaster
 * - Performance comparison vs. planned targets
 * - Personal best tracking
 * - Verification system for data accuracy
 *
 * RUN STATUSES EXPLAINED:
 * - COMPLETED: "I DID IT" - successfully finished the run
 * - SKIPPED: "I DID NOT DO IT" - didn't attempt the run
 * - PARTIAL: Started but didn't finish (injury, time constraints, etc.)
 *
 * DATA SOURCES:
 * 1. Screenshot upload → GPT-4 Vision extracts data automatically
 * 2. Manual entry → User types in the data
 * 3. App integration → Direct sync from running apps (future feature)
 *
 * EXAMPLE USAGE:
 * - "Upload your run screenshots"
 * - "Share your workout on Farcaster"
 * - "How did I perform vs. my planned workout?"
 * - "Show me all my personal bests"
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../User/User.model';
import { TrainingPlan } from '../TrainingPlan/TrainingPlan.model';
import { WeeklyTrainingPlan } from '../WeeklyTrainingPlan/WeeklyTrainingPlan.model';
import { PlannedSession } from '../PlannedSession/PlannedSession.model';

export enum RunStatusEnum {
  COMPLETED = 'completed', // "I DID IT"
  SKIPPED = 'skipped', // "I DID NOT DO IT"
  PARTIAL = 'partial', // Started but didn't finish
}

@Entity({ name: 'completed_runs' })
export class CompletedRun {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  trainingPlanId: number; // Can be null for freestyle runs

  @Column({ nullable: true })
  weeklyTrainingPlanId: number; // Can be null for freestyle runs

  @Column({ nullable: true })
  plannedSessionId: number; // Can be null for freestyle runs

  @Column({
    type: 'enum',
    enum: RunStatusEnum,
  })
  status: RunStatusEnum;

  @Column({ type: 'date' })
  completedDate: Date;

  // ================================
  // ACTUAL PERFORMANCE DATA
  // From screenshots or manual entry
  // ================================

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  actualDistance: number; // km

  @Column({ nullable: true })
  actualTime: number; // minutes

  @Column({ nullable: true })
  avgPace: string; // e.g., "5:30/km"

  @Column({ nullable: true })
  bestPace: string; // e.g., "4:42/km"

  @Column({ nullable: true })
  calories: number;

  @Column({ nullable: true })
  avgHeartRate: number;

  @Column({ nullable: true })
  maxHeartRate: number;

  @Column({ nullable: true })
  elevationGain: number; // meters

  @Column({ nullable: true })
  steps: number;

  // ================================
  // SCREENSHOT & AI PROCESSING
  // GPT-4 Vision extracts this data
  // ================================

  @Column({ nullable: true })
  screenshotUrl1: string; // DigitalOcean Spaces URL for first screenshot

  @Column({ nullable: true })
  screenshotUrl2: string; // DigitalOcean Spaces URL for second screenshot

  @Column({ nullable: true })
  screenshotUrl3: string; // DigitalOcean Spaces URL for third screenshot

  @Column({ nullable: true })
  screenshotUrl4: string; // DigitalOcean Spaces URL for fourth screenshot

  // Extracted data fields (converted from JSON)
  @Column({ nullable: true })
  runningApp: string; // "Strava", "Nike Run Club", "Garmin Connect", etc.

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  extractionConfidence: number; // AI extraction confidence (0-1)

  @Column({ nullable: true })
  weatherTemperature: number; // Temperature in Celsius

  @Column({ nullable: true })
  weatherConditions: string; // "sunny", "rainy", "cloudy"

  @Column({ nullable: true })
  routeName: string; // "Morning Loop", "Central Park"

  @Column({ nullable: true })
  routeType: string; // "outdoor", "treadmill", "track"

  @Column({ type: 'text', nullable: true })
  splitsData: string; // JSON string of splits data (for complex data that's rarely used)

  @Column({ type: 'text', nullable: true })
  rawText: string; // OCR text for debugging (comma-separated)

  @Column({ default: false })
  verified: boolean; // User verified the extracted data

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date;

  @Column({ default: false })
  isValidWorkout: boolean; // Whether this was a valid workout submission

  @Column({ type: 'text', nullable: true })
  validationNotes: string; // Notes about why workout was invalid

  @Column({ type: 'text', nullable: true })
  notes: string; // User's notes about the run

  // ================================
  // SOCIAL SHARING
  // Integration with Farcaster
  // ================================

  @Column({ nullable: true })
  shareImageUrl: string; // Generated share image URL

  @Column({ default: false })
  shared: boolean; // Whether shared on Farcaster

  @Column({ nullable: true })
  castHash: string; // Farcaster cast hash if shared

  @Column({ type: 'timestamp', nullable: true })
  sharedAt: Date;

  // ================================
  // PERFORMANCE ANALYSIS
  // How did they do vs. planned?
  // ================================

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  performanceScore: number; // 0-100 vs planned targets

  @Column({ default: false })
  exceededTargets: boolean; // Did better than planned

  @Column({ default: false })
  isPersonalBest: boolean; // New personal record

  @Column({ nullable: true })
  personalBestType: string; // "fastest_5k", "longest_run", "fastest_mile", etc.

  // ================================
  // TIMESTAMPS
  // ================================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  extractedAt: Date; // When AI processed screenshots

  // ================================
  // RELATIONSHIPS
  // All are optional to support freestyle runs
  // ================================

  @ManyToOne(() => User, (user) => user.completedRuns)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => TrainingPlan, (plan) => plan.allCompletedRuns, {
    nullable: true,
  })
  @JoinColumn({ name: 'trainingPlanId' })
  trainingPlan: TrainingPlan;

  @ManyToOne(() => WeeklyTrainingPlan, (week) => week.completedRuns, {
    nullable: true,
  })
  @JoinColumn({ name: 'weeklyTrainingPlanId' })
  weeklyTrainingPlan: WeeklyTrainingPlan;

  @ManyToOne(() => PlannedSession, (session) => session.completedRuns, {
    nullable: true,
  })
  @JoinColumn({ name: 'plannedSessionId' })
  plannedSession: PlannedSession;
}
