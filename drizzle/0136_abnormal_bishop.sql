ALTER TABLE "production_jobs" DROP CONSTRAINT "chk_production_jobs_status_fields";--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "chk_files_size_non_negative" CHECK (size >= 0);--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "chk_inventory_balances_reserved_quantity_non_negative" CHECK (reserved_quantity >= 0);--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "chk_qc_requests_outgoing_no_incoming_fields" CHECK (kind <> 'OUTGOING' OR (
        reason IS NULL AND inspection_standard IS NULL AND inspector_name IS NULL
        AND measuring_tools IS NULL AND qc_department_id IS NULL
        AND sort_ok_qty IS NULL AND sort_ng_qty IS NULL
      ));--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "chk_qc_requests_incoming_no_result_auto" CHECK (kind <> 'INCOMING' OR result_auto IS NULL);--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "chk_production_jobs_status_fields" CHECK ((status = 'PENDING' AND started_at IS NULL)
          OR (status = 'IN_PROGRESS' AND started_at IS NOT NULL));--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "chk_payment_requests_request_value_non_negative" CHECK (request_value >= 0);