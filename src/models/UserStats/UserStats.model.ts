import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../User/User.model';

@Entity({ name: 'user_stats' })
export class UserStats {
  @Column({ primary: true })
  fid: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user: User;

  @Column({ default: 0 })
  totalRuns: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  totalDistance: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  longestRun: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  best5kTime: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  best10kTime: number;

  @Column({ type: 'datetime', nullable: true })
  firstRunDate: Date;

  @Column({ type: 'datetime', nullable: true })
  lastRunDate: Date;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  updatedAt: Date;
}
