ALTER TYPE "public"."delivery_method" RENAME TO "fulfillment_type";--> statement-breakpoint
ALTER TABLE "outbound_orders" RENAME COLUMN "delivery_date" TO "fulfillment_date";--> statement-breakpoint
ALTER TABLE "outbound_orders" RENAME COLUMN "delivery_method" TO "fulfillment_type";--> statement-breakpoint
DROP INDEX "idx_outbound_orders_delivery_date";--> statement-breakpoint
CREATE INDEX "idx_outbound_orders_fulfillment_date" ON "outbound_orders" USING btree ("fulfillment_date");