import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { HubUser } from '../../hub-users/entities/hub-user.entity';

/**
 * Long-lived session handle for a platform admin.
 *
 * The access token stays short (`JWT_EXPIRES_IN`, default 8h) because the same
 * token is accepted by `sms-backend` on every `/admin/*` route — a stolen one
 * reaches every tenant. This row is what lets the console survive overnight
 * without widening that window: the browser trades it for a fresh access token
 * and the server can revoke it, which a JWT alone can't offer.
 *
 * Not tenant-scoped — the hub has no tenancy, and `SYSTEM_ADMIN` is not tied
 * to any school.
 */
@Index(['hubUserId'])
@Entity('hub_refresh_token')
export class HubRefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  /** Opaque 80-char hex string. Looked up directly, so it carries its own unique index. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  token: string;

  /**
   * The token this row held before the last rotation, honoured until
   * `previousTokenExpiresAt`.
   *
   * Rotation on its own would turn a dropped response into a forced logout:
   * the server has already moved on while the browser still holds the old
   * handle. A short grace window absorbs that — and the multi-tab race where
   * two tabs refresh at once — without letting a leaked token stay useful.
   */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  previousToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  previousTokenExpiresAt: Date | null;

  @ManyToOne(() => HubUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hubUserId' })
  user: HubUser;

  @Column({ name: 'hubUserId', type: 'int' })
  hubUserId: number;

  @Column({ type: 'varchar', nullable: true })
  deviceInfo: string | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'timestamp' })
  lastActive: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
