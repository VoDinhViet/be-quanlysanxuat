ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "quality_inspection_results_aql_plan_id_qc_aql_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "quality_inspection_results_aql_rule_id_qc_aql_rules_id_fk";
--> statement-breakpoint
ALTER TABLE "qc_aql_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qc_aql_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "qc_aql_rules" CASCADE;--> statement-breakpoint
DROP TABLE "qc_aql_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP CONSTRAINT "chk_quality_inspections_sample_size_positive";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP CONSTRAINT "chk_quality_inspections_defect_qty_non_negative";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP CONSTRAINT "chk_quality_inspections_aql_level_positive";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "chk_quality_inspection_results_sample_size_positive";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "chk_quality_inspection_results_defect_qty_non_negative";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "chk_quality_inspection_results_aql_level_positive";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "chk_quality_inspection_results_ac_re_pair";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP CONSTRAINT "chk_quality_inspection_results_ac_re_order";--> statement-breakpoint
DROP INDEX "idx_quality_inspection_results_aql_rule_id";--> statement-breakpoint
DROP INDEX "idx_quality_inspection_results_aql_plan_id";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "inspection_level";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "aql_level";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "sample_size";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "defect_qty";--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP COLUMN "inspection_standard";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "inspection_level";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "aql_level";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "aql_plan_id";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "aql_rule_id";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "code_letter";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "sample_size";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "acceptance_number";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "rejection_number";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "defect_qty";--> statement-breakpoint
ALTER TABLE "quality_inspection_results" DROP COLUMN "inspection_standard";--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "chk_quality_inspections_oqc_no_iqc_fields" CHECK (inspection_type <> 'OQC' OR (
        reason IS NULL AND inspector_name IS NULL
        AND measuring_tools IS NULL AND qc_department_id IS NULL
        AND sort_ok_qty IS NULL AND sort_ng_qty IS NULL
      ));--> statement-breakpoint
DROP TYPE "public"."qc_inspection_level";