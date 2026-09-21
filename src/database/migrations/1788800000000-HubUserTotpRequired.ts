import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `totpRequired` to `hub_user` — the per-user "an administrator requires
 * two-factor for this account" flag.
 *
 * NOT NULL DEFAULT false, so every existing account stays exactly as it is
 * today: two-factor optional, the user's own choice. Only an ADMIN flipping
 * the flag (`PATCH /hub-users/:id/totp-required`) makes login demand
 * enrolment.
 *
 * Guarded, matching the other migrations in this folder — the long-lived hub
 * databases predate migration tracking, so the statement has to be safe to
 * meet a column that already exists.
 */
export class HubUserTotpRequired1788800000000 implements MigrationInterface {
  name = 'HubUserTotpRequired1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "totpRequired" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "totpRequired"`,
    );
  }
}
