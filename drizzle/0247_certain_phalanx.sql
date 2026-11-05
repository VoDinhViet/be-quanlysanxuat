-- Deploy chạy migration lúc app cũ còn sống: giới hạn thời gian chờ khoá để việc đổi `bom_items` không
-- làm tắc mọi câu đọc cây BOM. Khoá ngoại đặt trước `bom_items` để khoá `items` rồi mới tới `bom_items`,
-- cùng thứ tự với luồng sao chép sản phẩm, tránh deadlock.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE TYPE "public"."item_operation_log_action" AS ENUM('CREATED', 'COPIED', 'UPDATED', 'DELETED', 'DELETED_WITH_PART');--> statement-breakpoint
CREATE TYPE "public"."item_operation_step_level" AS ENUM('ROUTING', 'PART');--> statement-breakpoint
CREATE TABLE "item_operation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"action" "item_operation_log_action" NOT NULL,
	"step_level" "item_operation_step_level" NOT NULL,
	"step_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"bom_item_id" uuid,
	"content" text NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_operation_logs" ADD CONSTRAINT "item_operation_logs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_operation_logs" ADD CONSTRAINT "item_operation_logs_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_operation_logs" ADD CONSTRAINT "item_operation_logs_bom_item_id_bom_items_id_fk" FOREIGN KEY ("bom_item_id") REFERENCES "public"."bom_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_operation_logs" ADD CONSTRAINT "item_operation_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX "uq_bom_items_bom_item_no_parent";--> statement-breakpoint
DROP INDEX "uq_bom_items_bom_parent_item";--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "bom_items" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "bom_operations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "bom_operations" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
CREATE INDEX "idx_item_operation_logs_item_id" ON "item_operation_logs" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_item_operation_logs_step_id" ON "item_operation_logs" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "idx_item_operation_logs_operation_id" ON "item_operation_logs" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "idx_item_operation_logs_bom_item_id" ON "item_operation_logs" USING btree ("bom_item_id");--> statement-breakpoint
CREATE INDEX "idx_item_operation_logs_performed_by" ON "item_operation_logs" USING btree ("performed_by");--> statement-breakpoint
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_operations" ADD CONSTRAINT "bom_operations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_operations" ADD CONSTRAINT "routing_operations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bom_items_bom_item_no_parent" ON "bom_items" USING btree ("bom_id","item_id") WHERE parent_id IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bom_items_bom_parent_item" ON "bom_items" USING btree ("bom_id","parent_id","item_id") WHERE parent_id IS NOT NULL AND deleted_at IS NULL;