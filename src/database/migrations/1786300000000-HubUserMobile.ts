import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `mobile` to `hub_user` so a hub console account can log in with
 * mobile as well as email, mirroring how sms-backend staff/parent accounts
 * already support both identifiers.
 *
 * Nullable and unique: most operators will still only have an email on
 * file, but two accounts must never share a mobile number — Postgres treats
 * NULLs as distinct, so any number of blank mobiles coexist fine under a
 * plain UNIQUE constraint.
 *
 * Guarded throughout, matching the other migrations in this folder — the
 * long-lived hub databases predate migration tracking, so every statement
 * has to be safe to meet an object that already exists.
 */
export class HubUserMobile1786300000000 implements MigrationInterface {
  name = 'HubUserMobile1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "mobile" character varying(20)`,
    );

    // ADD CONSTRAINT has no IF NOT EXISTS; the DO block is its spelling.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'UQ_hub_user_mobile'
        ) THEN
          ALTER TABLE "hub_user"
            ADD CONSTRAINT "UQ_hub_user_mobile" UNIQUE ("mobile");
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP CONSTRAINT IF EXISTS "UQ_hub_user_mobile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "mobile"`,
    );
  }
}
