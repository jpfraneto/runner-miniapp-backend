import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../User/User.model';

@Entity({ name: 'user_badge' })
export class UserBadge {
  @Column({ primary: true })
  fid: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fid', referencedColumnName: 'fid' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  badgeType: string;

  @Column({ type: 'datetime' })
  dateAwarded: Date;
}
