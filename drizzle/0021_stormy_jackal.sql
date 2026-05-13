ALTER TABLE "school_levels" RENAME TO "levels";--> statement-breakpoint
ALTER TABLE "courses" RENAME COLUMN "school_level_id" TO "level_id";--> statement-breakpoint
ALTER TABLE "grades" RENAME COLUMN "school_level_id" TO "level_id";--> statement-breakpoint
ALTER TABLE "majors" RENAME COLUMN "school_level_id" TO "level_id";--> statement-breakpoint
ALTER TABLE "levels" DROP CONSTRAINT "school_levels_code_unique";--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT "courses_school_level_id_school_levels_id_fk";
--> statement-breakpoint
ALTER TABLE "grades" DROP CONSTRAINT "grades_school_level_id_school_levels_id_fk";
--> statement-breakpoint
ALTER TABLE "majors" DROP CONSTRAINT "majors_school_level_id_school_levels_id_fk";
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "majors" ADD CONSTRAINT "majors_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_code_unique" UNIQUE("code");