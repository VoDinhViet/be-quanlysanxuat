CREATE TYPE "public"."payment_request_status" AS ENUM('PENDING', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"request_value" numeric(18, 2) NOT NULL,
	"due_date" date NOT NULL,
	"status" "payment_request_status" DEFAULT 'PENDING' NOT NULL,
	"paid_by" uuid,
	"paid_at" timestamp,
	"cancelled_by" uuid,
	"cancelled_at" timestamp,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_requests_code_unique" UNIQUE("code"),
	CONSTRAINT "payment_requests_purchase_order_id_unique" UNIQUE("purchase_order_id")
);
--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_requests_status" ON "payment_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_requests_created_by" ON "payment_requests" USING btree ("created_by");