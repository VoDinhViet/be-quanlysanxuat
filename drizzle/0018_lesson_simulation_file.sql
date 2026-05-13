DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = to_regclass('public.lessons')
      AND attname = 'simulation_value'
      AND NOT attisdropped
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = to_regclass('public.lessons')
      AND attname = 'simulation_file_url'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "lessons" RENAME COLUMN "simulation_value" TO "simulation_file_url";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'simulation_type_new'
  ) THEN
    CREATE TYPE "public"."simulation_type_new" AS ENUM('VIDEO', 'ZIP');
  END IF;
END $$;
--> statement-breakpoint
UPDATE "lessons"
SET
  "simulation_file_url" = COALESCE("simulation_file_url", '')
WHERE "simulation_file_url" IS NULL;
--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "simulation_type" TYPE "public"."simulation_type_new" USING (
  CASE
    WHEN "simulation_type"::text = 'CODE' THEN 'ZIP'
    WHEN "simulation_type" IS NULL THEN 'VIDEO'
    ELSE "simulation_type"::text
  END
)::"public"."simulation_type_new";
--> statement-breakpoint
ALTER TABLE IF EXISTS "lesson_parts" DROP COLUMN IF EXISTS "simulation_type";
--> statement-breakpoint
DROP TYPE "public"."simulation_type";
--> statement-breakpoint
ALTER TYPE "public"."simulation_type_new" RENAME TO "simulation_type";
--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "simulation_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "simulation_file_url" SET NOT NULL;
