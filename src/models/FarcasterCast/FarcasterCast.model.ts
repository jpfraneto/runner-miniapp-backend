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
import { RunningSession } from '../RunningSession/RunningSession.model';

@Entity({ name: 'farcaster_casts' })
export class FarcasterCast {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  userId: number;

  @Column({ nullable: true })
  completedRunId: number;

  @Column()
  imageUrl: string; // Generated share image

  @Column({ type: 'text' })
  caption: string;

  @Column({ nullable: true, unique: true })
  farcasterCastHash: string;

  @Column({ default: 0 })
  likes: number;

  @Column({ default: 0 })
  comments: number;

  @Column({ default: 0 })
  shares: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.farcasterCasts, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => RunningSession, { nullable: true })
  @JoinColumn({ name: 'runningSessionId' })
  runningSession: RunningSession;
}
