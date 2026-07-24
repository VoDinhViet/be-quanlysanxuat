-- The revision layer is being replaced by whole-product copy/clone (POST /products/:id/copy).
-- Wipe the product family before repointing BOM/routing FKs from revision to product — cascades
-- to product_attachments, product_revisions, boms, bom_items, and revision_operations.
TRUNCATE TABLE "products" CASCADE;--> statement-breakpoint
ALTER TABLE "product_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revision_operations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Dropping product_revisions CASCADE already takes the products/boms FKs pointing at it with it
-- (see the "drop cascades to constraint ..." notice on apply) — the two explicit DROP CONSTRAINT
-- statements drizzle-kit generated for those same FKs would fail with "constraint does not
-- exist" if run after this, so they're omitted here.
DROP TABLE "product_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "revision_operations" CASCADE;--> statement-breakpoint
ALTER TABLE "boms" DROP CONSTRAINT "boms_revision_id_unique";--> statement-breakpoint
DROP INDEX "idx_products_current_revision_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "current_revision_id";--> statement-breakpoint
ALTER TABLE "boms" DROP COLUMN "revision_id";--> statement-breakpoint
DROP TYPE "public"."product_revision_status";