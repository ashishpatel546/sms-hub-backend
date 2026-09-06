import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `totpBypassedAt` to `hub_user` — set when an account past its TOTP
 * grace period explicitly chooses "continue without two-factor" rather than
 * enrol. See `AuthService.skipTotpSetup` and `HubUserTotpBypass` usage in
 * `login()`/`refreshSession()`.
 *
 * Guarded throughout, matching the other migrations in this folder — the
 * long-lived hub databases predate migration tracking, so every statement
 * has to be safe to meet an object that already exists.
 */
export class HubUserTotpBypass1788700000000 implements MigrationInterface {
  name = 'HubUserTotpBypass1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "totpBypassedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "totpBypassedAt"`,
    );
  }
}
