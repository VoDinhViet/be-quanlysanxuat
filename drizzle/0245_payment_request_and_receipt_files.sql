-- Khoá ngoại khoá `SHARE ROW EXCLUSIVE` bảng được trỏ tới, mà deploy chạy migration lúc app cũ còn
-- sống: giới hạn thời gian chờ để không làm tắc ghi `files`, `inventory_receipts`, `payment_requests`.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TYPE "public"."upload_type" ADD VALUE 'PAYMENT_REQUEST_DOCUMENT';--> statement-breakpoint
ALTER TYPE "public"."upload_type" ADD VALUE 'INVENTORY_RECEIPT_DOCUMENT';--> statement-breakpoint
CREATE TABLE "inventory_receipt_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_request_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_request_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_receipt_files" ADD CONSTRAINT "inventory_receipt_files_receipt_id_inventory_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."inventory_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt_files" ADD CONSTRAINT "inventory_receipt_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_files" ADD CONSTRAINT "payment_request_files_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_files" ADD CONSTRAINT "payment_request_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_receipt_files_receipt_file" ON "inventory_receipt_files" USING btree ("receipt_id","file_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_receipt_files_file_id" ON "inventory_receipt_files" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_request_files_request_file" ON "payment_request_files" USING btree ("payment_request_id","file_id");--> statement-breakpoint
CREATE INDEX "idx_payment_request_files_file_id" ON "payment_request_files" USING btree ("file_id");