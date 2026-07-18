CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"logo_url" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"bank_name" varchar(255),
	"bank_account_number" varchar(50),
	"bank_account_holder" varchar(255),
	"bank_branch" varchar(255),
	"default_payment_method" "payment_method",
	"default_payment_term" "payment_term",
	"credit_limit" bigint,
	"credit_limit_start_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payment_info_supplier_id_unique" UNIQUE("supplier_id")
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "country_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_payment_info" ADD CONSTRAINT "supplier_payment_info_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_attachments_supplier_id" ON "supplier_attachments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_supplier_group_id" ON "suppliers" USING btree ("supplier_group_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_country_id" ON "suppliers" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "idx_suppliers_status" ON "suppliers" USING btree ("status") WHERE deleted_at IS NULL;