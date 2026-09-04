CREATE TYPE "public"."payment_request_log_action" AS ENUM('CREATED', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "payment_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_request_id" uuid NOT NULL,
	"action" "payment_request_log_action" NOT NULL,
	"content" varchar(1000) NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "cancellation_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "payment_request_logs" ADD CONSTRAINT "payment_request_logs_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_logs" ADD CONSTRAINT "payment_request_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_request_logs_payment_request_id" ON "payment_request_logs" USING btree ("payment_request_id");--> statement-breakpoint
CREATE INDEX "idx_payment_request_logs_performed_by" ON "payment_request_logs" USING btree ("performed_by");