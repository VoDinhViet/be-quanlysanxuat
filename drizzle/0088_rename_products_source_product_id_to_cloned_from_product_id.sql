-- Pure rename: products.source_product_id -> products.cloned_from_product_id (and the FK
-- constraint + index that carry the old name in theirs). Hand-written because drizzle-kit's
-- rename-disambiguation prompt requires a TTY (same reason as 0085/0087).
ALTER TABLE "products" RENAME COLUMN "source_product_id" TO "cloned_from_product_id";--> statement-breakpoint
ALTER TABLE "products" RENAME CONSTRAINT "products_source_product_id_products_id_fk" TO "products_cloned_from_product_id_products_id_fk";--> statement-breakpoint
ALTER INDEX "idx_products_source_product_id" RENAME TO "idx_products_cloned_from_product_id";
