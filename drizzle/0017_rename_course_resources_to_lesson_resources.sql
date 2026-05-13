DO $$
BEGIN
  IF to_regclass('public.lesson_resources') IS NULL
    AND to_regclass('public.course_resources') IS NOT NULL THEN
    ALTER TABLE "course_resources" RENAME TO "lesson_resources";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.lesson_resources')
      AND conname = 'course_resources_pkey'
  ) THEN
    ALTER TABLE "lesson_resources" RENAME CONSTRAINT "course_resources_pkey" TO "lesson_resources_pkey";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lesson_resources" DROP CONSTRAINT IF EXISTS "course_resources_lesson_id_lessons_id_fk";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.lesson_resources')
      AND conname = 'lesson_resources_lesson_id_lessons_id_fk'
  ) THEN
    ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
