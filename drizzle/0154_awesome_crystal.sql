ALTER TABLE "credentials" DROP CONSTRAINT "credentials_username_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_credentials_username_lower" ON "credentials" USING btree (lower("username"));