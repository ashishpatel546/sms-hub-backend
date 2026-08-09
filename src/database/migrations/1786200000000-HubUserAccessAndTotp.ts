import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1A — hub user access levels + mandatory TOTP.
 *
 * Two orthogonal additions to `hub_user`:
 *
 *  1. `accessLevel` (VIEW / EDIT / ADMIN). Deliberately NOT folded into
 *     `role`: `role` stays `SYSTEM_ADMIN` because it is the cross-service
 *     contract — `sms-backend` reads it off the shared-secret JWT to admit
 *     `/admin/*` traffic. Access level is a hub-local concern and must not
 *     leak into that decision.
 *
 *  2. TOTP columns. `totpLastStep` is the replay guard: the RFC 6238 time
 *     step of the last accepted code. It lives in the database rather than
 *     in process memory because the hub runs under PM2 cluster mode, where
 *     a module-level Map is per-worker and would let the same code be
 *     replayed against a different worker.
 *
 * Guarded throughout, matching the other migrations in this folder — the
 * long-lived hub databases predate migration tracking, so every statement
 * has to be safe to meet an object that already exists.
 */
export class HubUserAccessAndTotp1786200000000 implements MigrationInterface {
  name = 'HubUserAccessAndTotp1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no CREATE TYPE IF NOT EXISTS; a DO block is its spelling.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hub_access_level_enum') THEN
          CREATE TYPE "public"."hub_access_level_enum" AS ENUM('VIEW', 'EDIT', 'ADMIN');
        END IF;
      END $$
    `);

    // The column add and its backfill share one guard on purpose. New rows
    // must default to VIEW (least privilege), but every row that exists at
    // the moment this runs is a seeded platform super admin and has to stay
    // one — otherwise the migration locks everyone out of their own console.
    // Re-running must not re-promote later VIEW/EDIT users, hence the guard
    // covers the UPDATE too rather than only the ALTER.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'hub_user' AND column_name = 'accessLevel'
        ) THEN
          ALTER TABLE "hub_user"
            ADD COLUMN "accessLevel" "public"."hub_access_level_enum" NOT NULL DEFAULT 'VIEW';
          UPDATE "hub_user" SET "accessLevel" = 'ADMIN';
        END IF;
      END $$
    `);

    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`,
    );
    // No FK: the creator may later be deleted, and losing the audit crumb
    // would be worse than holding a dangling id.
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "createdById" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP`,
    );

    // Base32 shared secret. Nullable because a user exists before enrolment.
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "totpSecret" character varying`,
    );
    // Set only once the first code is verified — a stored secret alone does
    // not mean the authenticator app was actually paired.
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP`,
    );
    // bigint: the time step is unix-seconds/30, which stays well inside int4
    // for centuries, but the column is cheap to widen now and impossible to
    // widen quietly later.
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN IF NOT EXISTS "totpLastStep" bigint`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hub_user_recovery_code" (
        "id" SERIAL NOT NULL,
        "hubUserId" integer NOT NULL,
        "codeHash" character varying NOT NULL,
        "usedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hub_user_recovery_code_id" PRIMARY KEY ("id")
      )
    `);

    // Every read is "the unused codes belonging to this user".
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_hub_user_recovery_code_hubUserId" ON "hub_user_recovery_code" ("hubUserId")`,
    );

    // ADD CONSTRAINT has no IF NOT EXISTS; the DO block is its spelling.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_hub_user_recovery_code_hubUserId'
        ) THEN
          ALTER TABLE "hub_user_recovery_code"
            ADD CONSTRAINT "FK_hub_user_recovery_code_hubUserId"
            FOREIGN KEY ("hubUserId") REFERENCES "hub_user"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_user_recovery_code" DROP CONSTRAINT IF EXISTS "FK_hub_user_recovery_code_hubUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_hub_user_recovery_code_hubUserId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "hub_user_recovery_code"`);

    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "totpLastStep"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "totpEnabledAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "totpSecret"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "lastLoginAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "createdById"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "isActive"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "name"`,
    );
    // Must come after the column that references it.
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "accessLevel"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."hub_access_level_enum"`,
    );
  }
}
