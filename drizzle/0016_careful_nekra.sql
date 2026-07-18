CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."payment_term" AS ENUM('IMMEDIATE', 'NET_15', 'NET_30', 'NET_60');--> statement-breakpoint
CREATE TYPE "public"."supplier_status" AS ENUM('ACTIVE', 'PAUSED', 'STOPPED');--> statement-breakpoint
CREATE TYPE "public"."supplier_type" AS ENUM('INDIVIDUAL', 'COMPANY', 'HOUSEHOLD');--> statement-breakpoint
CREATE TABLE "supplier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "supplier_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mimetype" varchar(100),
	"size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"supplier_group_id" uuid NOT NULL,
	"type" "supplier_type" NOT NULL,
	"tax_code" varchar(50) NOT NULL,
	"phone_number" varchar(30) NOT NULL,
	"email" varchar(255),
	"representative_name" varchar(255),
	"representative_phone" varchar(30),
	"address" varchar(500) NOT NULL,
	"note" varchar(1000),
	"logo_url" varchar(500),
	"country" varchar(100),
	"bank_name" varchar(255),
	"bank_account_number" varchar(50),
	"bank_account_holder" varchar(255),
	"bank_branch" varchar(255),
	"default_payment_method" "payment_method",
	"default_payment_term" "payment_term",
	"credit_limit" bigint,
	"credit_limit_start_date" timestamp,
	"rating" integer,
	"status" "supplier_status" DEFAULT 'ACTIVE' NOT NULL,
	"internal_note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code"),
	CONSTRAINT "suppliers_tax_code_unique" UNIQUE("tax_code")
);
--> statement-breakpoint
ALTER TABLE "supplier_attachments" ADD CONSTRAINT "supplier_attachments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_supplier_group_id_supplier_groups_id_fk" FOREIGN KEY ("supplier_group_id") REFERENCES "public"."supplier_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;