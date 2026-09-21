ALTER TABLE "roles" ADD COLUMN "is_protected" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "roles" SET "is_protected" = true WHERE "code" = 'ADMIN';