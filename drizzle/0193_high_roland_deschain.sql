CREATE TABLE "routing_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"type" "operation_type" DEFAULT 'INHOUSE' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "routing_operations" ("id", "bom_id", "operation_id", "type", "sort_order", "note", "created_by", "created_at", "updated_at")
SELECT "id", "bom_id", "operation_id", "type", "sort_order", "note", "created_by", "created_at", "updated_at"
FROM "bom_operations" WHERE "bom_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "bom_operations" WHERE "bom_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "bom_operations" DROP CONSTRAINT "chk_bom_operations_anchor";--> statement-breakpoint
ALTER TABLE "bom_operations" DROP CONSTRAINT "bom_operations_bom_id_boms_id_fk";
--> statement-breakpoint
DROP INDEX "idx_bom_operations_bom_id";--> statement-breakpoint
ALTER TABLE "bom_operations" ALTER COLUMN "bom_item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD CONSTRAINT "routing_operations_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD CONSTRAINT "routing_operations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD CONSTRAINT "routing_operations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_routing_operations_bom_id" ON "routing_operations" USING btree ("bom_id");--> statement-breakpoint
CREATE INDEX "idx_routing_operations_operation_id" ON "routing_operations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_routing_operations_created_by" ON "routing_operations" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "bom_operations" DROP COLUMN "bom_id";
