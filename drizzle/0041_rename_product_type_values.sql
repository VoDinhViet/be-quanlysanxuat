ALTER TYPE "public"."product_type" RENAME VALUE 'FG' TO 'FINISHED_GOOD';--> statement-breakpoint
ALTER TYPE "public"."product_type" RENAME VALUE 'WIP' TO 'WORK_IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "type" SET DEFAULT 'FINISHED_GOOD';
