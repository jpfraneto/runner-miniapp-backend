// src/models/RunningSession/RunningSession.model.ts

/**
 * RUNNING SESSION MODEL
 *
 * PURPOSE: Model to store running session data that matches frontend interface
 *
 * Updated to match the RunningSession and RunningInterval interfaces:
 * - Proper field mapping between frontend and backend
 * - Support for all optional fields from frontend
 * - Correct data types and constraints
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../User/User.model';

export enum UnitType {
  KM = 'km',
  MI = 'mi',
}

export enum IntervalType {
  WORK = 'work',
  REST = 'rest',
}

@Entity({ name: 'running_sessions' })
export class RunningSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  fid: number; // Changed from string to number to match frontend interface

  @Column({ type: 'text', nullable: true })
  comment: string; // Added comment field from frontend

  @Column({ default: false })
  isWorkoutImage: boolean;

  @Column({ type: 'decimal', precision: 8, scale: 3 })
  distance: number;

  @Column({ type: 'text', nullable: true })
  castHash: string;

  @Column()
  duration: number; // in minutes

  @Column({
    type: 'enum',
    enum: UnitType,
    default: UnitType.KM,
  })
  units: UnitType; // "km" or "mi"

  @Column()
  pace: string; // format: "mm:ss/km" or "mm:ss/mi"

  @Column({ type: 'decimal', precision: 3, scale: 2 })
  confidence: number; // 0-1 range

  @Column({ type: 'json' })
  extractedText: string[]; // Changed to JSON array to match frontend

  // Optional fields from frontend interface
  @Column({ type: 'datetime', nullable: true })
  completedDate: Date; // Added completedDate field

  @Column({ type: 'int', nullable: true })
  calories: number; // Added calories field

  @Column({ type: 'int', nullable: true })
  avgHeartRate: number; // Added avgHeartRate field

  @Column({ type: 'int', nullable: true })
  maxHeartRate: number; // Added maxHeartRate field

  @Column({ default: false })
  isPersonalBest: boolean; // Added isPersonalBest field

  @Column({ nullable: true })
  personalBestType: string; // Added personalBestType field

  @Column({ type: 'json', nullable: true })
  screenshotUrls: string[]; // Changed to array to match frontend

  @Column({ type: 'text', nullable: true })
  rawText: string; // Added rawText field

  // Legacy fields (keeping for backward compatibility)
  @Column({ type: 'text', nullable: true })
  notes: string; // User's notes about the session

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ================================
  // RELATIONSHIPS
  // ================================

  @ManyToOne(() => User, (user) => user.runningSessions)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => RunningInterval, (interval) => interval.runningSession, {
    cascade: true,
  })
  intervals: RunningInterval[];
}

@Entity({ name: 'running_intervals' })
export class RunningInterval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  runningSessionId: number;

  @Column()
  number: number; // interval number (1, 2, 3, etc.)

  @Column({
    type: 'enum',
    enum: IntervalType,
  })
  type: IntervalType; // "work" or "rest"

  @Column({ type: 'decimal', precision: 8, scale: 3 })
  distance: number;

  @Column()
  duration: string; // format: "mm:ss"

  @Column()
  pace: string; // format: "mm:ss/km" or "mm:ss/mi"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => RunningSession, (session) => session.intervals)
  @JoinColumn({ name: 'runningSessionId' })
  runningSession: RunningSession;
}
