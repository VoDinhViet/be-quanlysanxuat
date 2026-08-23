ALTER TABLE "qc_requests" DROP CONSTRAINT "chk_qc_requests_incoming_no_result_auto";--> statement-breakpoint
ALTER TABLE "qc_requests" DROP COLUMN "result_auto";--> statement-breakpoint
ALTER TABLE "qc_inspections" DROP COLUMN "result_auto";