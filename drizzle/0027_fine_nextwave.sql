ALTER TABLE "supplier_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_attachments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_payment_info" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_representatives" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "supplier_groups" CASCADE;--> statement-breakpoint
DROP TABLE "supplier_attachments" CASCADE;--> statement-breakpoint
DROP TABLE "supplier_payment_info" CASCADE;--> statement-breakpoint
DROP TABLE "supplier_representatives" CASCADE;--> statement-breakpoint
DROP TABLE "suppliers" CASCADE;--> statement-breakpoint
--> hand-edited: `DROP TABLE "suppliers" CASCADE` above already drops every FK constraint that
--> references it, including this one, so the generated unconditional DROP CONSTRAINT would fail
--> with "constraint does not exist". IF EXISTS makes it a no-op instead.
ALTER TABLE "materials" DROP CONSTRAINT IF EXISTS "materials_preferred_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "materials" DROP COLUMN "preferred_supplier_id";--> statement-breakpoint
DROP TYPE "public"."payment_method";--> statement-breakpoint
DROP TYPE "public"."payment_term";--> statement-breakpoint
DROP TYPE "public"."supplier_status";--> statement-breakpoint
DROP TYPE "public"."supplier_type";