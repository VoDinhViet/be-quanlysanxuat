ALTER TABLE "purchase_requests" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "rejection_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;