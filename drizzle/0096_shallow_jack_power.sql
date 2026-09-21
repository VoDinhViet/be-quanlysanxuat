ALTER TABLE "purchase_quotation_items" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
UPDATE "purchase_quotation_items" SET "supplier_id" = "purchase_quotations"."supplier_id"
FROM "purchase_quotations"
WHERE "purchase_quotations"."id" = "purchase_quotation_items"."quotation_id";--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ALTER COLUMN "supplier_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_quotation_items" ADD CONSTRAINT "purchase_quotation_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_items_supplier_id" ON "purchase_quotation_items" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "purchase_quotations" DROP CONSTRAINT "purchase_quotations_supplier_id_suppliers_id_fk";--> statement-breakpoint
DROP INDEX "idx_purchase_quotations_supplier_id";--> statement-breakpoint
ALTER TABLE "purchase_quotations" DROP COLUMN "supplier_id";
