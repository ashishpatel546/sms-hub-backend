import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Platform-admin role. After Phase 1 trim, `SCHOOL_OWNER` is removed —
 * school admins now live in `sms-backend.user` table as `SUPER_ADMIN`.
 *
 * Value is uppercase `SYSTEM_ADMIN` to match `UserRole.SYSTEM_ADMIN`
 * in `sms-backend` so the shared `JWT_SECRET` validates payloads
 * across both services without a role-translation layer.
 */
export enum HubUserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
}

@Entity('hub_user')
export class HubUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: HubUserRole,
    default: HubUserRole.SYSTEM_ADMIN,
  })
  role: HubUserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: true })
  isFirstLogin: boolean;
}
