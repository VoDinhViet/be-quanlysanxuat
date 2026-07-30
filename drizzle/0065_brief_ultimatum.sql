CREATE TYPE "public"."production_order_log_action" AS ENUM('CREATED', 'QUANTITY_UPDATED', 'APPROVED');--> statement-breakpoint
CREATE TABLE "production_order_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid NOT NULL,
	"action" "production_order_log_action" NOT NULL,
	"content" varchar(1000) NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_order_logs" ADD CONSTRAINT "production_order_logs_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_logs" ADD CONSTRAINT "production_order_logs_performed_by_credentials_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_production_order_logs_production_order_id" ON "production_order_logs" USING btree ("production_order_id");