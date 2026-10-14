ALTER TABLE "inventory_receipt_items" ADD COLUMN "quotation_quantity" numeric(18, 3);--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_suppliers" ADD COLUMN "quotation_unit" varchar(50);--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_suppliers" ADD COLUMN "quotation_quantity" numeric(18, 3);--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "quotation_unit" varchar(50);--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD COLUMN "quotation_quantity" numeric(18, 3);--> statement-breakpoint
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "chk_inventory_receipt_items_quotation_quantity" CHECK (quotation_quantity IS NULL OR quotation_quantity > 0);--> statement-breakpoint
ALTER TABLE "purchase_quotation_item_suppliers" ADD CONSTRAINT "chk_purchase_quotation_item_suppliers_quotation_unit" CHECK ((quotation_unit IS NULL AND quotation_quantity IS NULL) OR (quotation_unit IS NOT NULL AND quotation_quantity > 0));--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "chk_purchase_order_items_quotation_unit" CHECK ((quotation_unit IS NULL AND quotation_quantity IS NULL) OR (quotation_unit IS NOT NULL AND quotation_quantity > 0));