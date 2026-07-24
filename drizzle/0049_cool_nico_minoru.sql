ALTER TABLE "positions" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_positions_department_id" ON "positions" USING btree ("department_id");--> statement-breakpoint
-- Backfill existing seeded rows (matches src/database/seeds/credentials.seed.ts pairing) before
-- a follow-up migration sets this column NOT NULL.
UPDATE "positions" SET "department_id" = (SELECT "id" FROM "departments" WHERE "code" = 'IT') WHERE "code" = 'ADMIN';--> statement-breakpoint
UPDATE "positions" SET "department_id" = (SELECT "id" FROM "departments" WHERE "code" = 'BGD') WHERE "code" = 'DIRECTOR';--> statement-breakpoint
UPDATE "positions" SET "department_id" = (SELECT "id" FROM "departments" WHERE "code" = 'KD') WHERE "code" = 'STAFF-KD';--> statement-breakpoint
UPDATE "positions" SET "department_id" = (SELECT "id" FROM "departments" WHERE "code" = 'MH') WHERE "code" = 'STAFF-MH';--> statement-breakpoint
UPDATE "positions" SET "department_id" = (SELECT "id" FROM "departments" WHERE "code" = 'KHO') WHERE "code" = 'STAFF-KHO';--> statement-breakpoint
UPDATE "positions" SET "department_id" = (SELECT "id" FROM "departments" WHERE "code" = 'SX') WHERE "code" = 'STAFF-SX';--> statement-breakpoint
UPDATE "positions" SET "department_id" = (SELECT "id" FROM "departments" WHERE "code" = 'QC') WHERE "code" = 'STAFF-QC';