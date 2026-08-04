CREATE TYPE "public"."purchase_request_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"needed_date" date NOT NULL,
	"department_id" uuid NOT NULL,
	"production_order_id" uuid,
	"status" "purchase_request_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_request_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	CONSTRAINT "chk_purchase_request_items_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_department_id" ON "purchase_requests" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_production_order_id" ON "purchase_requests" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_created_by" ON "purchase_requests" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_status" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_needed_date" ON "purchase_requests" USING btree ("needed_date");--> statement-breakpoint
CREATE INDEX "idx_purchase_request_items_purchase_request_id" ON "purchase_request_items" USING btree ("purchase_request_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_request_items_material_id" ON "purchase_request_items" USING btree ("material_id");