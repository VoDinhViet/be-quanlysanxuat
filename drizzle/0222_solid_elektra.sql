ALTER TABLE "purchase_orders" ADD COLUMN "vat_percent" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "other_cost" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "other_cost_note" varchar(255);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "chk_purchase_orders_vat_percent" CHECK (vat_percent >= 0 AND vat_percent <= 100);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "chk_purchase_orders_other_cost" CHECK (other_cost >= 0);