CREATE TABLE "product_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"revision_no" varchar(50) NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_product_revisions_product_revision_no" UNIQUE("product_id","revision_no")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "current_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_product_revisions_product_id" ON "product_revisions" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_current_revision_id_product_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."product_revisions"("id") ON DELETE set null ON UPDATE no action;