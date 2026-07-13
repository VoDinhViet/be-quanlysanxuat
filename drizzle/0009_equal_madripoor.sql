ALTER TABLE "users" ADD COLUMN "username" varchar(100);--> statement-breakpoint
UPDATE "users" SET "username" = "code" WHERE "username" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
