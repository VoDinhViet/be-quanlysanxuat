DROP TABLE "order_items";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_client_id_clients_id_fk";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_staff_id_users_id_fk";--> statement-breakpoint
DROP INDEX "idx_orders_client_id";--> statement-breakpoint
DROP INDEX "idx_orders_staff_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "client_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "staff_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "order_date";--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "delivery_date" TO "due_date";
