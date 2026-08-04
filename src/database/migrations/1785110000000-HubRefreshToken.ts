import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `hub_refresh_token` — server-side sessions for the platform console.
 *
 * Before this, the hub issued an 8h access token and nothing else, so an
 * operator who signed in during the day was bounced to `/login` by the next
 * morning. `sms-backend` has had refresh tokens since its initial schema;
 * this brings the hub in line.
 */
export class HubRefreshToken1785110000000 implements MigrationInterface {
  name = 'HubRefreshToken1785110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guarded like InitialSchema, and for the same reason: environments that
    // predate migration tracking may already carry this table (the local dev
    // stack ran this schema before the migration ever executed anywhere).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "hub_refresh_token" (
        "id" SERIAL NOT NULL,
        "token" character varying(128) NOT NULL,
        "previousToken" character varying(128),
        "previousTokenExpiresAt" TIMESTAMP,
        "hubUserId" integer NOT NULL,
        "deviceInfo" character varying,
        "ipAddress" character varying,
        "lastActive" TIMESTAMP NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_hub_refresh_token_id" PRIMARY KEY ("id")
      )
    `);

    // Every refresh is a lookup by token — and the value must be unique for
    // rotation to be able to swap one row's token safely.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_hub_refresh_token_token" ON "hub_refresh_token" ("token")`,
    );
    // Grace-window lookups hit this when a client presents a handle that has
    // already been rotated away.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_hub_refresh_token_previousToken" ON "hub_refresh_token" ("previousToken")`,
    );
    // Supports "revoke every session for this admin" and the expiry sweep.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_hub_refresh_token_hubUserId" ON "hub_refresh_token" ("hubUserId")`,
    );
    // ADD CONSTRAINT has no IF NOT EXISTS; the DO block is its spelling.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_hub_refresh_token_hubUserId'
        ) THEN
          ALTER TABLE "hub_refresh_token"
            ADD CONSTRAINT "FK_hub_refresh_token_hubUserId"
            FOREIGN KEY ("hubUserId") REFERENCES "hub_user"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "hub_refresh_token" DROP CONSTRAINT IF EXISTS "FK_hub_refresh_token_hubUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_hub_refresh_token_hubUserId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_hub_refresh_token_previousToken"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_hub_refresh_token_token"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "hub_refresh_token"`);
  }
}
