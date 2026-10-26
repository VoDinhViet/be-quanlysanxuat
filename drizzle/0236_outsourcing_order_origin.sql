CREATE TYPE "public"."outsourcing_order_origin" AS ENUM('FROM_JOB', 'MANUAL');--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "origin" "outsourcing_order_origin" DEFAULT 'FROM_JOB' NOT NULL;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "outsourcing_order_items" ADD CONSTRAINT "outsourcing_order_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outsourcing_order_items_unit_id" ON "outsourcing_order_items" USING btree ("unit_id");