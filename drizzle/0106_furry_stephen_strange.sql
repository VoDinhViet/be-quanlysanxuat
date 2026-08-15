ALTER TYPE "public"."inventory_document_status" ADD VALUE 'PENDING_IQC' BEFORE 'POSTED';--> statement-breakpoint
ALTER TYPE "public"."inventory_document_status" ADD VALUE 'PENDING_RECEIPT' BEFORE 'POSTED';--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD COLUMN "requires_iqc" boolean DEFAULT false NOT NULL;