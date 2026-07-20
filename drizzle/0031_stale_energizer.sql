ALTER TABLE "files" ADD COLUMN "linked_at" timestamp;--> statement-breakpoint
--> hand-added: every pre-existing file must count as already linked. `FilesCleanupService` deletes
--> rows where `linked_at IS NULL` and older than the grace period, so without this backfill the
--> first sweep after deploy would wipe every file uploaded before this migration — bytes included.
--> The table is empty in this environment, making it a no-op here, but it is required for any
--> environment that already holds data.
UPDATE "files" SET "linked_at" = "created_at" WHERE "linked_at" IS NULL;
