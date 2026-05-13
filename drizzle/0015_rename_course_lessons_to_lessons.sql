DO $$
BEGIN
  IF to_regclass('public.lessons') IS NULL THEN
    IF to_regclass('public.course_lessons') IS NOT NULL THEN
      ALTER TABLE "course_lessons" RENAME TO "lessons";
    ELSIF to_regclass('public.course_modules') IS NOT NULL THEN
      ALTER TABLE "course_modules" RENAME TO "lessons";
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = to_regclass('public.lessons')
      AND attname = 'module_type'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "lessons" RENAME COLUMN "module_type" TO "lesson_type";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'module_type'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'lesson_type'
  ) THEN
    ALTER TYPE "public"."module_type" RENAME TO "lesson_type";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = to_regclass('public.lessons')
      AND a.attname = 'lesson_type'
      AND NOT a.attisdropped
      AND t.typname = 'module_type'
  ) AND EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'lesson_type'
  ) THEN
    ALTER TABLE "lessons" ALTER COLUMN "lesson_type" TYPE "public"."lesson_type" USING "lesson_type"::text::"public"."lesson_type";
    DROP TYPE IF EXISTS "public"."module_type";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = to_regclass('public.course_resources')
      AND attname = 'module_id'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "course_resources" RENAME COLUMN "module_id" TO "lesson_id";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "course_resources" DROP CONSTRAINT IF EXISTS "course_resources_lesson_id_course_lessons_id_fk";
--> statement-breakpoint
ALTER TABLE "course_resources" DROP CONSTRAINT IF EXISTS "course_resources_module_id_course_modules_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "lesson_progress" DROP CONSTRAINT IF EXISTS "lesson_progress_lesson_id_course_lessons_id_fk";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.lessons')
      AND conname = 'course_lessons_section_id_course_sections_id_fk'
  ) THEN
    ALTER TABLE "lessons" RENAME CONSTRAINT "course_lessons_section_id_course_sections_id_fk" TO "lessons_section_id_course_sections_id_fk";
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.lessons')
      AND conname = 'course_modules_section_id_course_sections_id_fk'
  ) THEN
    ALTER TABLE "lessons" RENAME CONSTRAINT "course_modules_section_id_course_sections_id_fk" TO "lessons_section_id_course_sections_id_fk";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.lessons')
      AND conname = 'course_lessons_pkey'
  ) THEN
    ALTER TABLE "lessons" RENAME CONSTRAINT "course_lessons_pkey" TO "lessons_pkey";
  ELSIF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.lessons')
      AND conname = 'course_modules_pkey'
  ) THEN
    ALTER TABLE "lessons" RENAME CONSTRAINT "course_modules_pkey" TO "lessons_pkey";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.course_resources')
      AND conname = 'course_resources_lesson_id_lessons_id_fk'
  ) THEN
    ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.lesson_progress') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = to_regclass('public.lesson_progress')
        AND conname = 'lesson_progress_lesson_id_lessons_id_fk'
    ) THEN
    ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
