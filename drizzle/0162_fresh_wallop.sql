ALTER TABLE "outbound_orders" ADD COLUMN "delivery_address" varchar(500);--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "receiver_name" varchar(255);--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "receiver_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "outbound_orders" ADD COLUMN "vehicle" varchar(255);