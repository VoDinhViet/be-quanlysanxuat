ALTER TABLE "purchase_orders" ADD COLUMN "advance_payment_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "advance_payment_note" varchar(255);--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "advance_payment_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "chk_purchase_orders_advance_payment_amount" CHECK (advance_payment_amount >= 0);