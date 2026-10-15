ALTER TYPE "public"."payment_request_log_action" ADD VALUE 'EXTRA_COST_UPDATED';--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "extra_cost" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "extra_cost_note" varchar(1000);