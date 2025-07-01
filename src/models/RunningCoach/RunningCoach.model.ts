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

@Entity({ name: 'coach_interactions' })
export class CoachInteraction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  message: string;

  @Column({ type: 'json', nullable: true })
  context: any; // Workout data, user state, etc.

  @Column({ default: false })
  sentAsCast: boolean; // Whether sent as Farcaster comment/DM

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => User, (user) => user.coachInteractions)
  @JoinColumn({ name: 'userId' })
  user: User;
}
