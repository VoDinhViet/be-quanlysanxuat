CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "item_category_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_item_category_id_item_categories_id_fk" FOREIGN KEY ("item_category_id") REFERENCES "public"."item_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_items_item_category_id" ON "items" USING btree ("item_category_id");