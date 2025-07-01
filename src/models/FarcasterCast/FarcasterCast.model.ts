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
import { CompletedRun } from '../CompletedRun/CompletedRun.model';

@Entity({ name: 'farcaster_casts' })
export class FarcasterCast {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  completedRunId: number;

  @Column()
  imageUrl: string; // Generated share image

  @Column({ type: 'text' })
  caption: string;

  @Column({ nullable: true })
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
  @ManyToOne(() => User, (user) => user.farcasterCasts)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => CompletedRun, { nullable: true })
  @JoinColumn({ name: 'completedRunId' })
  completedRun: CompletedRun;
}
