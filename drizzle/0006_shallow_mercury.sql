ALTER TABLE "products" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_revisions_product_revision_no_unique_idx" ON "product_revisions" USING btree ("product_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "products_code_unique_idx" ON "products" USING btree ("code");