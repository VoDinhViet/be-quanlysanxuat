ALTER TABLE "qc_attachments" DROP CONSTRAINT "qc_attachments_file_id_files_id_fk";
--> statement-breakpoint
ALTER TABLE "qc_attachments" ADD CONSTRAINT "qc_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;