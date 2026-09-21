ALTER TYPE "public"."upload_type" ADD VALUE 'PRODUCTION_ORDER_SIGNED_DOCUMENT';--> statement-breakpoint
ALTER TYPE "public"."production_order_log_action" ADD VALUE 'SIGNED_FILE_UPDATED' BEFORE 'COMPLETED';--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "signed_file_id" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_signed_file_id_files_id_fk" FOREIGN KEY ("signed_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_orders_signed_file_id" ON "production_orders" USING btree ("signed_file_id");