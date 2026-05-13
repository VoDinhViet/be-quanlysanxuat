CREATE TYPE "public"."category_type" AS ENUM('LEVEL', 'GRADE', 'MAJOR', 'SUBJECT');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"type" "category_type" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "grade_subjects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "grades" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "levels" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "major_subjects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "majors" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subjects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_level_id_levels_id_fk";
--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_grade_id_grades_id_fk";
--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_major_id_majors_id_fk";
--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_subject_id_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "grades" DROP CONSTRAINT IF EXISTS "grades_level_id_levels_id_fk";
--> statement-breakpoint
ALTER TABLE "majors" DROP CONSTRAINT IF EXISTS "majors_level_id_levels_id_fk";
--> statement-breakpoint
DROP TABLE "grade_subjects";--> statement-breakpoint
DROP TABLE "grades";--> statement-breakpoint
DROP TABLE "levels";--> statement-breakpoint
DROP TABLE "major_subjects";--> statement-breakpoint
DROP TABLE "majors";--> statement-breakpoint
DROP TABLE "subjects";--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_level_id_categories_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_grade_id_categories_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_major_id_categories_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_categories_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;