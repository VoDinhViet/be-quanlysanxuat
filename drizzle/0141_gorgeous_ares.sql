ALTER TABLE "qc_aql_plans" DROP CONSTRAINT "qc_aql_plans_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "qc_aql_plans" DROP COLUMN "approved_by";--> statement-breakpoint
ALTER TABLE "qc_aql_plans" DROP COLUMN "approved_at";