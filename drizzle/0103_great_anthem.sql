ALTER TABLE "iqc_inspections" ADD COLUMN "resolved_by" uuid;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD CONSTRAINT "iqc_inspections_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;