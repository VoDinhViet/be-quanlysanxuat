ALTER TABLE "qc_requests" DROP CONSTRAINT "chk_qc_requests_incoming_supplier";--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "qc_requests" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "qc_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_receipts_client_id" ON "inventory_receipts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_qc_requests_client_id" ON "qc_requests" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "chk_inventory_receipts_supplier_client_exclusive" CHECK (NOT (supplier_id IS NOT NULL AND client_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "chk_qc_requests_outgoing_no_client" CHECK (kind <> 'OUTGOING' OR client_id IS NULL);--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "chk_qc_requests_supplier_client_exclusive" CHECK (NOT (supplier_id IS NOT NULL AND client_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "qc_requests" ADD CONSTRAINT "chk_qc_requests_incoming_supplier" CHECK (kind <> 'INCOMING' OR supplier_id IS NOT NULL OR client_id IS NOT NULL);