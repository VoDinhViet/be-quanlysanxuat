ALTER TABLE "quality_inspections" DROP CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "inspector_name";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "measuring_tools";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "inspector_name";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "measuring_tools";--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields" CHECK (inspection_type <> 'OQC' OR (
        reason IS NULL AND qc_department_id IS NULL
        AND sort_ok_qty IS NULL AND sort_ng_qty IS NULL
      ));