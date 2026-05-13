ALTER TABLE "courses" DROP CONSTRAINT "courses_teacher_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "teacher_id";