-- Renaming salesStaffId → staffId (dropping the "sales" qualifier) while it's still a brand-new,
-- unused column — a plain rename-in-place instead of drizzle-kit's naive add-new/drop-old split
-- (see 0047, now a no-op), so no data is lost and the FK/index carry over under their new names.
ALTER TABLE "orders" RENAME COLUMN "sales_staff_id" TO "staff_id";--> statement-breakpoint
ALTER TABLE "orders" RENAME CONSTRAINT "orders_sales_staff_id_users_id_fk" TO "orders_staff_id_users_id_fk";--> statement-breakpoint
ALTER INDEX "idx_orders_sales_staff_id" RENAME TO "idx_orders_staff_id";
