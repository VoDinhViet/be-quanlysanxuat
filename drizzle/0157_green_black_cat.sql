ALTER TYPE "public"."upload_type" ADD VALUE 'SUPPLIER_RETURN_EVIDENCE';--> statement-breakpoint
CREATE TABLE "supplier_return_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_return_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD COLUMN "post_note" varchar(500);--> statement-breakpoint
ALTER TABLE "supplier_return_files" ADD CONSTRAINT "supplier_return_files_supplier_return_id_supplier_returns_id_fk" FOREIGN KEY ("supplier_return_id") REFERENCES "public"."supplier_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_files" ADD CONSTRAINT "supplier_return_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_return_files_supplier_return_id" ON "supplier_return_files" USING btree ("supplier_return_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_return_files_file_id" ON "supplier_return_files" USING btree ("file_id");