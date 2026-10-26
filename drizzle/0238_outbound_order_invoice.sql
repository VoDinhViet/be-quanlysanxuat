CREATE TYPE "public"."outbound_order_invoice_status" AS ENUM('NOT_ISSUED', 'ISSUED');--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "invoice_status" "outbound_order_invoice_status" DEFAULT 'NOT_ISSUED' NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "invoice_no" varchar(100);--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "invoice_date" date;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "invoiced_by" uuid;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "invoiced_at" timestamp;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_invoiced_by_users_id_fk" FOREIGN KEY ("invoiced_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_invoiced_by" ON "outbound_orders" USING btree ("invoiced_by");