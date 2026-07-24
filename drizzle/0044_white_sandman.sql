CREATE TABLE "product_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_product_id" uuid;--> statement-breakpoint
ALTER TABLE "boms" ADD COLUMN "product_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "product_operations" ADD CONSTRAINT "product_operations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_operations" ADD CONSTRAINT "product_operations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_operations" ADD CONSTRAINT "product_operations_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_product_operations_product_id" ON "product_operations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_operations_operation_id" ON "product_operations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_product_operations_created_by" ON "product_operations" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_products_source_product_id" ON "products" USING btree ("source_product_id");--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_product_id_unique" UNIQUE("product_id");