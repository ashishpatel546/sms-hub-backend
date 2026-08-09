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

/**
 * What a hub user may do *inside the hub console*.
 *
 * Deliberately orthogonal to {@link HubUserRole}: `role` is the cross-service
 * contract that `sms-backend` reads off the shared-secret JWT to admit
 * `/admin/*` traffic, so it stays `SYSTEM_ADMIN` for everyone. Access level
 * is hub-local and never participates in that decision.
 *
 * Hierarchical, not a flat allowlist — see `HUB_ACCESS_HIERARCHY` in
 * `modules/auth/hub-access.guard.ts`.
 */
export enum HubAccessLevel {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
  ADMIN = 'ADMIN',
}

@Entity('hub_user')
export class HubUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  /**
   * Alternative login identifier, alongside email. Nullable and unique —
   * Postgres treats NULLs as distinct under a plain UNIQUE constraint, so any
   * number of accounts may leave it unset.
   */
  @Column({ type: 'varchar', length: 20, nullable: true, unique: true })
  mobile: string | null;

  @Column()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: HubUserRole,
    default: HubUserRole.SYSTEM_ADMIN,
  })
  role: HubUserRole;

  /**
   * `enumName` is pinned because TypeORM would otherwise derive
   * `hub_user_accessLevel_enum` from the table/column pair and not find the
   * type the migration actually created.
   */
  @Column({
    type: 'enum',
    enum: HubAccessLevel,
    enumName: 'hub_access_level_enum',
    default: HubAccessLevel.VIEW,
  })
  accessLevel: HubAccessLevel;

  /** Display name. Nullable — rows seeded before Phase 1A only had an email. */
  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Who invited this user. No FK on purpose: the creator may later be
   * deleted, and losing the audit crumb is worse than a dangling id.
   */
  @Column({ type: 'int', nullable: true })
  createdById: number | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ default: true })
  isFirstLogin: boolean;

  // ── TOTP ──────────────────────────────────────────────────────────────────

  /**
   * Base32 shared secret. Present as soon as `/auth/totp/setup` is called,
   * which is *not* the same as being enrolled — see `totpEnabledAt`.
   *
   * Never leaves the server. `HubUsersService.toPublic()` is the only thing
   * that should ever shape a `HubUser` for a response.
   */
  @Column({ type: 'varchar', nullable: true })
  totpSecret: string | null;

  /**
   * Set once the user has proved they can produce a code from the secret.
   * A stored secret alone means a QR was rendered, not that anything scanned
   * it — gating login on the secret would lock out anyone who opened the
   * setup screen and closed it.
   */
  @Column({ type: 'timestamp', nullable: true })
  totpEnabledAt: Date | null;

  /**
   * RFC 6238 time step of the last accepted code, for replay protection.
   *
   * In the database rather than process memory because the hub runs under
   * PM2 cluster mode: a module-level Map is per-worker, so a code burned on
   * worker A would still be accepted by worker B.
   *
   * Stored as bigint, which the driver hands back as a string; the
   * transformer keeps the field a plain number in TypeScript.
   */
  @Column({
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null): number | null =>
        value === null || value === undefined ? null : Number(value),
    },
  })
  totpLastStep: number | null;
}
