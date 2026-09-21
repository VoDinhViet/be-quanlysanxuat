CREATE TYPE "public"."inventory_requisition_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."inventory_requisition_type" AS ENUM('PRODUCTION', 'OTHER');--> statement-breakpoint
CREATE TABLE "inventory_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"requisition_date" date NOT NULL,
	"type" "inventory_requisition_type" NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"department_id" uuid,
	"production_order_id" uuid,
	"production_job_id" uuid,
	"reason" varchar(500),
	"status" "inventory_requisition_status" DEFAULT 'DRAFT' NOT NULL,
	"note" varchar(1000),
	"inventory_issue_id" uuid,
	"created_by" uuid,
	"sent_by" uuid,
	"sent_at" timestamp,
	"approved_by" uuid,
	"approved_at" timestamp,
	"rejected_by" uuid,
	"rejected_at" timestamp,
	"rejection_reason" varchar(1000),
	"issued_by" uuid,
	"issued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_requisitions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_requisition_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_inventory_requisition_items_requisition_item" UNIQUE("requisition_id","item_id"),
	CONSTRAINT "chk_inventory_requisition_items_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_inventory_issue_id_inventory_issues_id_fk" FOREIGN KEY ("inventory_issue_id") REFERENCES "public"."inventory_issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisitions" ADD CONSTRAINT "inventory_requisitions_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisition_items" ADD CONSTRAINT "inventory_requisition_items_requisition_id_inventory_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."inventory_requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_requisition_items" ADD CONSTRAINT "inventory_requisition_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_warehouse_id" ON "inventory_requisitions" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_department_id" ON "inventory_requisitions" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_production_order_id" ON "inventory_requisitions" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_production_job_id" ON "inventory_requisitions" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_status" ON "inventory_requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_type" ON "inventory_requisitions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_requisition_date" ON "inventory_requisitions" USING btree ("requisition_date");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_inventory_issue_id" ON "inventory_requisitions" USING btree ("inventory_issue_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_created_by" ON "inventory_requisitions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_sent_by" ON "inventory_requisitions" USING btree ("sent_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_approved_by" ON "inventory_requisitions" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_rejected_by" ON "inventory_requisitions" USING btree ("rejected_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisitions_issued_by" ON "inventory_requisitions" USING btree ("issued_by");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisition_items_requisition_id" ON "inventory_requisition_items" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_requisition_items_item_id" ON "inventory_requisition_items" USING btree ("item_id");