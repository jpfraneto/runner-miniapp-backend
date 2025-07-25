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
  PrimaryColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../User/User.model';

export enum RunningSessionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity({ name: 'running_sessions' })
export class RunningSession {
  @PrimaryColumn({ type: 'varchar', length: 66 })
  castHash: string; // Unique identifier for the run

  @Column()
  fid: number; // Farcaster ID, also foreign key

  @ManyToOne(() => User, (user) => user.runningSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user: User;

  @Column({ type: 'int' })
  distanceMeters: number;

  @Column()
  duration: number; // in minutes

  @Column({ type: 'text', nullable: true })
  reasoning: string; // LLM reasoning for data extraction

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'enum', enum: RunningSessionStatus })
  status: RunningSessionStatus;
}
