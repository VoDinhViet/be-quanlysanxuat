CREATE TABLE "operation_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_operation_assignments_operation_id_user_id" UNIQUE("operation_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "operation_assignments" ADD CONSTRAINT "operation_assignments_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_assignments" ADD CONSTRAINT "operation_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_operation_assignments_user_id" ON "operation_assignments" USING btree ("user_id");