ALTER TABLE "users" ADD COLUMN "code" varchar(50);--> statement-breakpoint
UPDATE "users"
SET "code" = 'US' || lpad(row_number::text, 4, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at) AS row_number
  FROM "users"
) AS temp
WHERE "users"."id" = temp.id;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_code_unique" UNIQUE("code");