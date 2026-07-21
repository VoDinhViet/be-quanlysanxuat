-- Custom SQL migration file, put your code below! --

-- One `product_revisions` row per EXISTING product, preserving its current free-text `revision`
-- string (never reset to "R01" — whatever value was there stays there). Includes soft-deleted
-- products too, so no `products` row is ever left with a null `current_revision_id` (a row
-- undeleted later would otherwise resurface with no revision at all).
INSERT INTO "product_revisions" ("id", "product_id", "revision_no", "created_by", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id", p."revision", p."created_by", p."created_at", p."created_at"
FROM "products" p;
--> statement-breakpoint

-- Point each product at the revision just created for it. The join is unambiguous: the insert
-- above created exactly one revision per product.
UPDATE "products" p
SET "current_revision_id" = pr."id"
FROM "product_revisions" pr
WHERE pr."product_id" = p."id";
