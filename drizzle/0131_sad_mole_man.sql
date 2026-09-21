CREATE TABLE "qc_aql_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aql_plan_id" uuid NOT NULL,
	"code_letter" varchar(2) NOT NULL,
	"lot_size_min" integer NOT NULL,
	"lot_size_max" integer,
	"sample_size" integer NOT NULL,
	"acceptance_number" integer NOT NULL,
	"rejection_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_qc_aql_rules_lot_size_min_positive" CHECK (lot_size_min >= 1),
	CONSTRAINT "chk_qc_aql_rules_lot_size_range" CHECK (lot_size_max IS NULL OR lot_size_max >= lot_size_min),
	CONSTRAINT "chk_qc_aql_rules_sample_size_positive" CHECK (sample_size > 0),
	CONSTRAINT "chk_qc_aql_rules_ac_non_negative" CHECK (acceptance_number >= 0),
	CONSTRAINT "chk_qc_aql_rules_re_gt_ac" CHECK (rejection_number > acceptance_number)
);
--> statement-breakpoint
CREATE TABLE "qc_aql_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"standard" varchar(100) NOT NULL,
	"inspection_level" "qc_inspection_level" NOT NULL,
	"aql_level" numeric(4, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"note" varchar(500),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qc_aql_plans_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_qc_aql_plans_aql_level_positive" CHECK (aql_level > 0)
);
--> statement-breakpoint
ALTER TABLE "qc_aql_rules" ADD CONSTRAINT "qc_aql_rules_aql_plan_id_qc_aql_plans_id_fk" FOREIGN KEY ("aql_plan_id") REFERENCES "public"."qc_aql_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_aql_plans" ADD CONSTRAINT "qc_aql_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_aql_plans" ADD CONSTRAINT "qc_aql_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_qc_aql_rules_plan_lot_min" ON "qc_aql_rules" USING btree ("aql_plan_id","lot_size_min");--> statement-breakpoint
CREATE INDEX "idx_qc_aql_rules_plan_id_lot_max" ON "qc_aql_rules" USING btree ("aql_plan_id","lot_size_max");--> statement-breakpoint
CREATE INDEX "idx_qc_aql_plans_is_active" ON "qc_aql_plans" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_qc_aql_plans_level_aql_active" ON "qc_aql_plans" USING btree ("inspection_level","aql_level") WHERE is_active;