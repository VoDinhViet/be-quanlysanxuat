ALTER TYPE "public"."inventory_receipt_type" ADD VALUE 'OTHER';--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD COLUMN "reason" varchar(500);