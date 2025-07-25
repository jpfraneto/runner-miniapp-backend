import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../User/User.model';

@Entity({ name: 'leaderboard_history' })
export class LeaderboardHistory {
  @Column({ primary: true })
  fid: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user: User;

  @Column()
  weekNumber: number;

  @Column({ type: 'datetime' })
  startDate: Date;

  @Column({ type: 'datetime' })
  endDate: Date;

  @Column()
  rank: number;

  @Column({ type: 'decimal', precision: 8, scale: 2 })
  distanceKm: number;

  @Column({ type: 'varchar', length: 16 })
  medalColor: string;
}
