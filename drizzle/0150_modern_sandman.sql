ALTER TYPE "public"."outbound_order_status" ADD VALUE 'REJECTED';--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "sent_by" uuid;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "rejection_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD CONSTRAINT "outbound_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_sent_by" ON "outbound_orders" USING btree ("sent_by");--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_approved_by" ON "outbound_orders" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_rejected_by" ON "outbound_orders" USING btree ("rejected_by");