ALTER TYPE "public"."production_order_log_action" ADD VALUE 'NOTE_UPDATED';--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "note" varchar(1000);