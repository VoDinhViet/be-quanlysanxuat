ALTER TABLE "credentials" ADD COLUMN "is_protected" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "credentials" SET "is_protected" = true WHERE "username" = 'admin';