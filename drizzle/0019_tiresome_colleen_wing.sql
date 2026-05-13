ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_teacher_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "school_level_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "grade_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "major_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_school_level_id_school_levels_id_fk" FOREIGN KEY ("school_level_id") REFERENCES "public"."school_levels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_major_id_majors_id_fk" FOREIGN KEY ("major_id") REFERENCES "public"."majors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "short_description";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "intro_video_url";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "teacher_id";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "level";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "price";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "estimated_duration_minutes";--> statement-breakpoint
DROP TABLE IF EXISTS "course_enrollments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "lesson_progress" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."enrollment_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."lesson_progress_status";