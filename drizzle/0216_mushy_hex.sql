ALTER TABLE "purchase_orders" ADD COLUMN "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "closure_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_closed_by" ON "purchase_orders" USING btree ("closed_by");