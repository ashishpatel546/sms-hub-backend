import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { HubUser } from './hub-user.entity';

/**
 * A single-use fallback for the second factor.
 *
 * Codes are shown to the user exactly once, at enrolment, and stored only as
 * a bcrypt hash — the server cannot re-display them, which is the point.
 * Consumption is marked with `usedAt` rather than a delete so an operator can
 * still see that a recovery path was taken and when.
 */
@Index(['hubUserId'])
@Entity('hub_user_recovery_code')
export class HubUserRecoveryCode {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => HubUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hubUserId' })
  user: HubUser;

  @Column({ name: 'hubUserId', type: 'int' })
  hubUserId: number;

  @Column({ type: 'varchar' })
  codeHash: string;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
