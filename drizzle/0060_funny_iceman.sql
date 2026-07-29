ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::text;--> statement-breakpoint
-- Hand-added (not drizzle-kit generated): 'CONFIRMED' is being removed from order_status. The
-- closest equivalent in the new lifecycle is PENDING_CONFIRMATION — those orders were already
-- placed/sent, just not yet run through the new explicit approval gate. Without this backfill the
-- USING cast below fails outright for any row still holding the old value.
UPDATE "orders" SET "status" = 'PENDING_CONFIRMATION' WHERE "status" = 'CONFIRMED';--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'PENDING_CONFIRMATION', 'AWAITING_PRODUCTION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejection_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_approved_by_credentials_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rejected_by_credentials_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;