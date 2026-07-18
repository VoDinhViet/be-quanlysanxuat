CREATE TABLE "supplier_representatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone_number" varchar(30),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_representatives" ADD CONSTRAINT "supplier_representatives_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_supplier_representatives_supplier_id" ON "supplier_representatives" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "suppliers" DROP COLUMN "representative_name";--> statement-breakpoint
ALTER TABLE "suppliers" DROP COLUMN "representative_phone";