ALTER TYPE "public"."production_order_status" ADD VALUE 'COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."production_order_log_action" ADD VALUE 'COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."production_job_status" ADD VALUE 'WAITING_QC';--> statement-breakpoint
ALTER TYPE "public"."production_job_status" ADD VALUE 'WAITING_DELIVERY';--> statement-breakpoint
ALTER TYPE "public"."production_job_status" ADD VALUE 'COMPLETED';