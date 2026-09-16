DROP INDEX "uq_items_code_active";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "revision" varchar(50) DEFAULT 'R01' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_items_code_revision_active" ON "items" USING btree ("code","revision") WHERE deleted_at IS NULL;