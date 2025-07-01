import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../User/User.model';

export enum AchievementTypeEnum {
  WEEKLY_STREAK = 'weekly_streak',
  GOAL_COMPLETION = 'goal_completion',
  CONSISTENCY_MILESTONE = 'consistency_milestone',
  DISTANCE_MILESTONE = 'distance_milestone',
}

@Entity({ name: 'achievements' })
export class Achievement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: AchievementTypeEnum,
  })
  type: AchievementTypeEnum;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column({ default: 0 })
  tokenReward: number; // $RUNNER tokens earned

  @Column({ default: false })
  claimed: boolean;

  @Column({ nullable: true })
  claimTransactionHash: string;

  @Column({ type: 'json', nullable: true })
  metadata: any; // Flexible data for different achievement types

  @CreateDateColumn()
  earnedAt: Date;

  @Column({ nullable: true })
  claimedAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.achievements)
  @JoinColumn({ name: 'userId' })
  user: User;
}
