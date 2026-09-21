ALTER TABLE "iqc_inspections" ALTER COLUMN "inspection_date" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "inspection_standard" varchar(100);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "inspector_name" varchar(100);--> statement-breakpoint
ALTER TABLE "iqc_inspections" ADD COLUMN "measuring_tools" varchar(255);