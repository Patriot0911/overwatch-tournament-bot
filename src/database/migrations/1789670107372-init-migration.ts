import { MigrationInterface, QueryRunner } from "typeorm";

export class InitMigration1789670107372 implements MigrationInterface {
    name = 'InitMigration1789670107372'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "discord_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "discord_id" character varying NOT NULL, "username" character varying NOT NULL, "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_660800d8832722f9d149bf4b3ff" UNIQUE ("discord_id"), CONSTRAINT "PK_08f611f0deb6dec9299cbc8224a" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "discord_users"`);
    }
}
