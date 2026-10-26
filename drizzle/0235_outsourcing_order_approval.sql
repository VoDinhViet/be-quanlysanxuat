-- Không dùng `ALTER TYPE outsourcing_order_status ADD VALUE` vì Postgres cấm dùng giá trị enum mới
-- thêm trong CÙNG transaction (lỗi "unsafe use of new value") — mà `SET DEFAULT 'DRAFT'` bên dưới cần
-- dùng ngay. Tạo lại type với đủ 9 giá trị (cùng cách `0231`); phiếu cũ giữ nguyên trạng thái, phiếu
-- đang `SENT` vẫn là "đã xuất" nên không phải duyệt lại.
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
DROP TYPE "public"."outsourcing_order_status";--> statement-breakpoint
CREATE TYPE "public"."outsourcing_order_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'PARTIAL', 'WAITING_QC', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DATA TYPE "public"."outsourcing_order_status" USING "status"::"public"."outsourcing_order_status";--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD COLUMN "rejection_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outsourcing_orders" ADD CONSTRAINT "outsourcing_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;