CREATE TYPE "public"."ncr_origin_type" AS ENUM('OQC', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."ncr_status" AS ENUM('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'PENDING_QC', 'CLOSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."ncr_type" AS ENUM('INTERNAL', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."ncr_log_action" AS ENUM('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PRODUCTION_ORDER_CREATED', 'OQC_REQUESTED', 'PENDING_QC', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."ncr_cost_kind" AS ENUM('MATERIAL', 'LABOR', 'OUTSOURCING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."production_order_ncr_action" AS ENUM('REWORK', 'REMAKE');--> statement-breakpoint
CREATE TYPE "public"."production_order_source_type" AS ENUM('ORDER', 'NCR');--> statement-breakpoint
CREATE TABLE "ncrs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"type" "ncr_type" NOT NULL,
	"origin_type" "ncr_origin_type" NOT NULL,
	"status" "ncr_status" DEFAULT 'OPEN' NOT NULL,
	"quality_inspection_id" uuid,
	"production_job_id" uuid,
	"parent_ncr_id" uuid,
	"item_id" uuid NOT NULL,
	"client_id" uuid,
	"order_id" uuid,
	"department_id" uuid,
	"ng_qty" numeric(18, 3) DEFAULT 0 NOT NULL,
	"rework_qty" numeric(18, 3) DEFAULT 0 NOT NULL,
	"remake_qty" numeric(18, 3) DEFAULT 0 NOT NULL,
	"rework_operation_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"defect_description" varchar(1000),
	"root_cause" text,
	"corrective_action" text,
	"preventive_action" text,
	"rejection_reason" varchar(1000),
	"submitted_by" uuid,
	"submitted_at" timestamp,
	"approved_by" uuid,
	"approved_at" timestamp,
	"closed_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ncrs_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_ncrs_quantities" CHECK (ng_qty >= 0 AND rework_qty >= 0 AND remake_qty >= 0 AND rework_qty + remake_qty <= ng_qty),
	CONSTRAINT "chk_ncrs_customer_client" CHECK (type <> 'CUSTOMER' OR client_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "ncr_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ncr_id" uuid NOT NULL,
	"action" "ncr_log_action" NOT NULL,
	"content" varchar(1000) NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ncr_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ncr_id" uuid NOT NULL,
	"kind" "ncr_cost_kind" NOT NULL,
	"description" varchar(500) NOT NULL,
	"item_id" uuid,
	"quantity" numeric(18, 3) DEFAULT 1 NOT NULL,
	"unit_price" numeric(18, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"is_suggested" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_ncr_cost_lines_non_negative" CHECK (quantity >= 0 AND unit_price >= 0 AND amount >= 0)
);
--> statement-breakpoint
ALTER TABLE "production_orders" DROP CONSTRAINT "production_orders_order_id_unique";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields";--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD COLUMN "ncr_id" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "source_type" "production_order_source_type" DEFAULT 'ORDER' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "ncr_id" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "ncr_action" "production_order_ncr_action";--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_quality_inspection_id_quality_inspections_id_fk" FOREIGN KEY ("quality_inspection_id") REFERENCES "public"."quality_inspections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_production_job_id_production_jobs_id_fk" FOREIGN KEY ("production_job_id") REFERENCES "public"."production_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_parent_ncr_id_ncrs_id_fk" FOREIGN KEY ("parent_ncr_id") REFERENCES "public"."ncrs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncrs" ADD CONSTRAINT "ncrs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncr_logs" ADD CONSTRAINT "ncr_logs_ncr_id_ncrs_id_fk" FOREIGN KEY ("ncr_id") REFERENCES "public"."ncrs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncr_logs" ADD CONSTRAINT "ncr_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncr_cost_lines" ADD CONSTRAINT "ncr_cost_lines_ncr_id_ncrs_id_fk" FOREIGN KEY ("ncr_id") REFERENCES "public"."ncrs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncr_cost_lines" ADD CONSTRAINT "ncr_cost_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ncrs_status" ON "ncrs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ncrs_type" ON "ncrs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_ncrs_quality_inspection_id" ON "ncrs" USING btree ("quality_inspection_id");--> statement-breakpoint
CREATE INDEX "idx_ncrs_production_job_id" ON "ncrs" USING btree ("production_job_id");--> statement-breakpoint
CREATE INDEX "idx_ncrs_item_id" ON "ncrs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_ncrs_client_id" ON "ncrs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_ncrs_order_id" ON "ncrs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_ncrs_department_id" ON "ncrs" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_ncrs_parent_ncr_id" ON "ncrs" USING btree ("parent_ncr_id");--> statement-breakpoint
CREATE INDEX "idx_ncrs_created_at" ON "ncrs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ncr_logs_ncr_id" ON "ncr_logs" USING btree ("ncr_id");--> statement-breakpoint
CREATE INDEX "idx_ncr_logs_performed_by" ON "ncr_logs" USING btree ("performed_by");--> statement-breakpoint
CREATE INDEX "idx_ncr_cost_lines_ncr_id" ON "ncr_cost_lines" USING btree ("ncr_id");--> statement-breakpoint
CREATE INDEX "idx_ncr_cost_lines_item_id" ON "ncr_cost_lines" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_ncr_id_ncrs_id_fk" FOREIGN KEY ("ncr_id") REFERENCES "public"."ncrs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_ncr_id_ncrs_id_fk" FOREIGN KEY ("ncr_id") REFERENCES "public"."ncrs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quality_inspections_ncr_id" ON "quality_inspections" USING btree ("ncr_id");--> statement-breakpoint
CREATE INDEX "idx_production_orders_order_id" ON "production_orders" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_production_orders_order_id_source_order" ON "production_orders" USING btree ("order_id") WHERE source_type = 'ORDER';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_production_orders_ncr_action" ON "production_orders" USING btree ("ncr_id","ncr_action") WHERE ncr_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields" CHECK (inspection_type <> 'OQC' OR reason IS NULL);--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "chk_production_orders_source_ncr" CHECK ((source_type = 'NCR') = (ncr_id IS NOT NULL AND ncr_action IS NOT NULL));