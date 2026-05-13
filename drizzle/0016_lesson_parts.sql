DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'lesson_part_type'
  ) THEN
    CREATE TYPE "public"."lesson_part_type" AS ENUM('PDF', 'DOCX');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_parts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lesson_id" uuid NOT NULL,
  "title" text NOT NULL,
  "part_type" "lesson_part_type" NOT NULL,
  "file_url" text NOT NULL,
  "position" integer NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.lesson_parts')
      AND conname = 'lesson_parts_lesson_id_lessons_id_fk'
  ) THEN
    ALTER TABLE "lesson_parts" ADD CONSTRAINT "lesson_parts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
