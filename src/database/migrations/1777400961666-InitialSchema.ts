import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every statement here is guarded, which an initial migration would not
 * normally need. The existing hub databases (stage, and in all likelihood
 * production) were created ad hoc before migration tracking was in use —
 * their `migrations` table is empty even though the objects exist. An
 * unguarded re-run therefore died on the first CREATE TYPE (42710,
 * duplicate_object), and because the deploy script did not fail on it, every
 * migration behind it was silently blocked for months.
 *
 * Guarding lets the runner converge such a database: whatever exists is
 * kept, whatever is missing is created, and the run finally gets recorded.
 * On a genuinely fresh database no guard fires and this behaves exactly as
 * the original did.
 */
export class InitialSchema1777400961666 implements MigrationInterface {
  name = 'InitialSchema1777400961666';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "service_token" ("id" SERIAL NOT NULL, "tokenHash" character varying NOT NULL, "schoolId" integer NOT NULL, "label" character varying NOT NULL, "lastUsedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac4ab6890f34bc9749c041d3983" PRIMARY KEY ("id"))`,
    );
    // Postgres has no CREATE TYPE IF NOT EXISTS; a DO block is its spelling.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_status_enum') THEN
          CREATE TYPE "public"."school_status_enum" AS ENUM('active', 'suspended');
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_environment_enum') THEN
          CREATE TYPE "public"."school_environment_enum" AS ENUM('production', 'stage');
        END IF;
      END $$
    `);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "school" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "s3LogoKey" character varying, "status" "public"."school_status_enum" NOT NULL DEFAULT 'active', "environment" "public"."school_environment_enum" NOT NULL DEFAULT 'production', "frontendPort" integer, "provisioningStatus" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_88faf116813403541a61c87cbe3" UNIQUE ("slug"), CONSTRAINT "UQ_2008be28a7a1af4980e3adfb259" UNIQUE ("frontendPort"), CONSTRAINT "PK_57836c3fe2f2c7734b20911755e" PRIMARY KEY ("id"))`,
    );
    // On a database that already went through TrimHubSchema this enum exists
    // with the trimmed labels; the guard keeps it rather than fighting it —
    // Trim's recast handles either shape.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hub_user_role_enum') THEN
          CREATE TYPE "public"."hub_user_role_enum" AS ENUM('system_admin', 'school_owner');
        END IF;
      END $$
    `);
    // No DEFAULT on role here, unlike the original: the default belongs to
    // whichever enum shape survives, and both later paths set it explicitly
    // (fresh databases via TrimHubSchema, existing ones already have it).
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "hub_user" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" "public"."hub_user_role_enum" NOT NULL, "schoolId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isFirstLogin" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_8ec541e15adb7bca8a6a6109159" UNIQUE ("email"), CONSTRAINT "PK_31d6bade4f968a1772ac5795c40" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "hub_user"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."hub_user_role_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "school"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."school_environment_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."school_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "service_token"`);
  }
}
