ALTER TABLE "items" DROP CONSTRAINT "items_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_items_code_active" ON "items" USING btree ("code") WHERE deleted_at IS NULL;