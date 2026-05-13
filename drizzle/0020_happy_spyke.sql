ALTER TABLE "lessons" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "video_url";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "theory_url";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "lesson_type";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "simulation_type";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "simulation_file_url";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "quiz_code";--> statement-breakpoint
DROP TYPE "public"."lesson_type";--> statement-breakpoint
DROP TYPE "public"."simulation_type";