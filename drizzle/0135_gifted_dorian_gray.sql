ALTER TABLE "files" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_scopes" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;