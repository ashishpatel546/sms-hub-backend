import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 — Sub-phase 1.A trim of the hub schema.
 *
 * Removes silo-era artefacts now that:
 *  - the canonical `school` table lives in `sms-backend`
 *  - per-school CI/CD (and therefore service tokens) is gone
 *  - `SCHOOL_OWNER` no longer exists — school admins are `SUPER_ADMIN`
 *    rows in `sms-backend.user`
 *
 * The role enum is also re-cased from `system_admin` to `SYSTEM_ADMIN`
 * to align with `UserRole.SYSTEM_ADMIN` in `sms-backend`, allowing a
 * shared `JWT_SECRET` to validate hub-issued tokens there directly.
 */
export class TrimHubSchema1778000100000 implements MigrationInterface {
  name = 'TrimHubSchema1778000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop service_token (per-school CI/CD retired)
    await queryRunner.query(`DROP TABLE IF EXISTS "service_token"`);

    // 2. Drop school table + its enums (canonical lives in sms-backend now)
    await queryRunner.query(`DROP TABLE IF EXISTS "school"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."school_environment_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."school_status_enum"`,
    );

    // 3. Drop schoolId from hub_user (SYSTEM_ADMIN is not tied to any school)
    await queryRunner.query(
      `ALTER TABLE "hub_user" DROP COLUMN IF EXISTS "schoolId"`,
    );

    // 4. Recreate hub_user_role_enum with only uppercase SYSTEM_ADMIN.
    //    Existing rows with 'system_admin' (lowercase) are remapped;
    //    any 'school_owner' rows are forcibly promoted to SYSTEM_ADMIN
    //    (greenfield: no production hubs to break, but this keeps the
    //    migration idempotent on stage even if seeds linger).
    await queryRunner.query(
      `ALTER TYPE "public"."hub_user_role_enum" RENAME TO "hub_user_role_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."hub_user_role_enum" AS ENUM('SYSTEM_ADMIN')`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "hub_user"
        ALTER COLUMN "role" TYPE "public"."hub_user_role_enum"
        USING (
          CASE
            WHEN "role"::text IN ('system_admin', 'school_owner', 'SYSTEM_ADMIN')
              THEN 'SYSTEM_ADMIN'
            ELSE 'SYSTEM_ADMIN'
          END
        )::"public"."hub_user_role_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "hub_user" ALTER COLUMN "role" SET DEFAULT 'SYSTEM_ADMIN'`,
    );
    await queryRunner.query(`DROP TYPE "public"."hub_user_role_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the role-enum recast.
    await queryRunner.query(
      `ALTER TYPE "public"."hub_user_role_enum" RENAME TO "hub_user_role_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."hub_user_role_enum" AS ENUM('system_admin', 'school_owner')`,
    );
    await queryRunner.query(
      `ALTER TABLE "hub_user" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "hub_user"
        ALTER COLUMN "role" TYPE "public"."hub_user_role_enum"
        USING ('system_admin')::"public"."hub_user_role_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "hub_user" ALTER COLUMN "role" SET DEFAULT 'school_owner'`,
    );
    await queryRunner.query(`DROP TYPE "public"."hub_user_role_enum_new"`);

    // Re-add schoolId (nullable).
    await queryRunner.query(
      `ALTER TABLE "hub_user" ADD COLUMN "schoolId" integer`,
    );

    // Recreate school + service_token tables.
    await queryRunner.query(
      `CREATE TYPE "public"."school_status_enum" AS ENUM('active', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."school_environment_enum" AS ENUM('production', 'stage')`,
    );
    await queryRunner.query(`
      CREATE TABLE "school" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "slug" character varying NOT NULL,
        "s3LogoKey" character varying,
        "status" "public"."school_status_enum" NOT NULL DEFAULT 'active',
        "environment" "public"."school_environment_enum" NOT NULL DEFAULT 'production',
        "frontendPort" integer,
        "provisioningStatus" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_school_slug" UNIQUE ("slug"),
        CONSTRAINT "UQ_school_frontendPort" UNIQUE ("frontendPort"),
        CONSTRAINT "PK_school_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "service_token" (
        "id" SERIAL NOT NULL,
        "tokenHash" character varying NOT NULL,
        "schoolId" integer NOT NULL,
        "label" character varying NOT NULL,
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_token_id" PRIMARY KEY ("id")
      )
    `);
  }
}
