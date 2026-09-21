ALTER TABLE "quality_inspections" DROP CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP CONSTRAINT "quality_inspections_qc_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "quality_inspection_results_qc_department_id_departments_id_fk";
--> statement-breakpoint
DROP INDEX "idx_quality_inspections_qc_department_id";--> statement-breakpoint
DROP INDEX "idx_quality_inspection_results_qc_department_id";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "qc_department_id";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "qc_department_id";--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields" CHECK (inspection_type <> 'OQC' OR (
        reason IS NULL AND sort_ok_qty IS NULL AND sort_ng_qty IS NULL
      ));