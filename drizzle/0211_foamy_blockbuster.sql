ALTER TYPE "public"."upload_type" ADD VALUE 'QUOTATION_SUPPLIER_EVIDENCE';--> statement-breakpoint
CREATE TABLE "purchase_quotation_item_supplier_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_item_supplier_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "uq_purchase_quotation_item_supplier_files" UNIQUE("quotation_item_supplier_id","file_id")
);
--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_supplier_files" ADD CONSTRAINT "purchase_quotation_item_supplier_files_quotation_item_supplier_id_purchase_quotation_item_suppliers_id_fk" FOREIGN KEY ("quotation_item_supplier_id") REFERENCES "public"."purchase_quotation_item_suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_supplier_files" ADD CONSTRAINT "purchase_quotation_item_supplier_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_item_supplier_files_supplier_id" ON "purchase_quotation_item_supplier_files" USING btree ("quotation_item_supplier_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_quotation_item_supplier_files_file_id" ON "purchase_quotation_item_supplier_files" USING btree ("file_id");