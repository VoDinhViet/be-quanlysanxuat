ALTER TYPE "public"."upload_type" ADD VALUE 'INVENTORY_ISSUE_EVIDENCE';--> statement-breakpoint
CREATE TABLE "inventory_issue_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_issues" ADD COLUMN "post_note" varchar(500);--> statement-breakpoint
ALTER TABLE "inventory_issue_files" ADD CONSTRAINT "inventory_issue_files_issue_id_inventory_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."inventory_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_files" ADD CONSTRAINT "inventory_issue_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_files_issue_id" ON "inventory_issue_files" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_issue_files_file_id" ON "inventory_issue_files" USING btree ("file_id");