ALTER TYPE "public"."iqc_attachment_kind" RENAME TO "qc_file_kind";--> statement-breakpoint
ALTER TABLE "supplier_attachments" RENAME TO "supplier_files";--> statement-breakpoint
ALTER TABLE "order_attachments" RENAME TO "order_files";--> statement-breakpoint
ALTER TABLE "qc_attachments" RENAME TO "qc_files";--> statement-breakpoint
ALTER TABLE "supplier_files" DROP CONSTRAINT "uq_supplier_attachments_supplier_file";--> statement-breakpoint
ALTER TABLE "qc_files" DROP CONSTRAINT "uq_qc_attachments_inspection_file_kind";--> statement-breakpoint
ALTER TABLE "supplier_files" DROP CONSTRAINT "supplier_attachments_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_files" DROP CONSTRAINT "supplier_attachments_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "order_files" DROP CONSTRAINT "order_attachments_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "order_files" DROP CONSTRAINT "order_attachments_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "qc_files" DROP CONSTRAINT "qc_attachments_inspection_id_qc_inspections_id_fk";
--> statement-breakpoint
ALTER TABLE "qc_files" DROP CONSTRAINT "qc_attachments_file_id_files_id_fk";
--> statement-breakpoint
DROP INDEX "idx_supplier_attachments_supplier_id";--> statement-breakpoint
DROP INDEX "idx_supplier_attachments_file_id";--> statement-breakpoint
DROP INDEX "idx_order_attachments_order_id";--> statement-breakpoint
DROP INDEX "idx_order_attachments_file_id";--> statement-breakpoint
DROP INDEX "idx_qc_attachments_file_id";--> statement-breakpoint
DROP INDEX "idx_qc_attachments_inspection_id_kind";--> statement-breakpoint
ALTER TABLE "supplier_files" ADD CONSTRAINT "supplier_files_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_files" ADD CONSTRAINT "supplier_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_files" ADD CONSTRAINT "qc_files_inspection_id_qc_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_files" ADD CONSTRAINT "qc_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_files_supplier_id" ON "supplier_files" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_files_file_id" ON "supplier_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_order_files_order_id" ON "order_files" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_files_file_id" ON "order_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_qc_files_file_id" ON "qc_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_qc_files_inspection_id_kind" ON "qc_files" USING btree ("inspection_id","kind");--> statement-breakpoint
ALTER TABLE "supplier_files" ADD CONSTRAINT "uq_supplier_files_supplier_file" UNIQUE("supplier_id","file_id");--> statement-breakpoint
ALTER TABLE "qc_files" ADD CONSTRAINT "uq_qc_files_inspection_file_kind" UNIQUE("inspection_id","file_id","kind");