ALTER TABLE "orders" RENAME COLUMN "staff_id" TO "assigned_user_id";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_staff_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "idx_orders_staff_id";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orders_assigned_user_id" ON "orders" USING btree ("assigned_user_id");--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "contact_name";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "contact_phone";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "contact_email";