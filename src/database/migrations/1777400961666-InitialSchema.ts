import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1777400961666 implements MigrationInterface {
    name = 'InitialSchema1777400961666'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "service_token" ("id" SERIAL NOT NULL, "tokenHash" character varying NOT NULL, "schoolId" integer NOT NULL, "label" character varying NOT NULL, "lastUsedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac4ab6890f34bc9749c041d3983" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."school_status_enum" AS ENUM('active', 'suspended')`);
        await queryRunner.query(`CREATE TYPE "public"."school_environment_enum" AS ENUM('production', 'stage')`);
        await queryRunner.query(`CREATE TABLE "school" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "s3LogoKey" character varying, "status" "public"."school_status_enum" NOT NULL DEFAULT 'active', "environment" "public"."school_environment_enum" NOT NULL DEFAULT 'production', "frontendPort" integer, "provisioningStatus" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_88faf116813403541a61c87cbe3" UNIQUE ("slug"), CONSTRAINT "UQ_2008be28a7a1af4980e3adfb259" UNIQUE ("frontendPort"), CONSTRAINT "PK_57836c3fe2f2c7734b20911755e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."hub_user_role_enum" AS ENUM('system_admin', 'school_owner')`);
        await queryRunner.query(`CREATE TABLE "hub_user" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" "public"."hub_user_role_enum" NOT NULL DEFAULT 'school_owner', "schoolId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isFirstLogin" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_8ec541e15adb7bca8a6a6109159" UNIQUE ("email"), CONSTRAINT "PK_31d6bade4f968a1772ac5795c40" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "hub_user"`);
        await queryRunner.query(`DROP TYPE "public"."hub_user_role_enum"`);
        await queryRunner.query(`DROP TABLE "school"`);
        await queryRunner.query(`DROP TYPE "public"."school_environment_enum"`);
        await queryRunner.query(`DROP TYPE "public"."school_status_enum"`);
        await queryRunner.query(`DROP TABLE "service_token"`);
    }

}
