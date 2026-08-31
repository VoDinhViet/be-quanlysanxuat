CREATE TYPE "public"."inventory_adjustment_reason" AS ENUM('STOCKTAKE', 'DAMAGED', 'LOST', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."inventory_adjustment_type" AS ENUM('INCREASE', 'DECREASE');--> statement-breakpoint
ALTER TYPE "public"."inventory_reference_type" ADD VALUE 'INVENTORY_ADJUSTMENT' BEFORE 'SUPPLIER_RETURN';--> statement-breakpoint
CREATE TABLE "item_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"conversion_factor" numeric(18, 6) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_item_units_item_unit" UNIQUE("item_id","unit_id"),
	CONSTRAINT "chk_item_units_conversion_factor_positive" CHECK (conversion_factor > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"adjustment_type" "inventory_adjustment_type" NOT NULL,
	"reason" "inventory_adjustment_reason" NOT NULL,
	"adjustment_date" date NOT NULL,
	"status" "inventory_document_status" DEFAULT 'DRAFT' NOT NULL,
	"note" varchar(1000),
	"posted_by" uuid,
	"posted_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_adjustments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_inventory_adjustment_items_adjustment_item" UNIQUE("adjustment_id","item_id"),
	CONSTRAINT "chk_inventory_adjustment_items_quantity_positive" CHECK (quantity > 0)
);
