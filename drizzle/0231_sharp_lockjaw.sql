-- Không dùng `ALTER TYPE payment_request_status ADD VALUE` vì Postgres cấm dùng giá trị enum mới thêm
-- trong CÙNG transaction (lỗi "unsafe use of new value") — mà `SET DEFAULT 'DRAFT'` bên dưới cần dùng
-- ngay. Tạo lại type với đủ 5 giá trị (cùng cách `0066`); dữ liệu cũ giữ nguyên, YCTT đang PENDING
-- vẫn là "đã đề nghị, chờ thanh toán".
ALTER TABLE "payment_requests" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
DROP TYPE "public"."payment_request_status";--> statement-breakpoint
CREATE TYPE "public"."payment_request_status" AS ENUM('DRAFT', 'PENDING', 'REJECTED', 'PAID', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "status" SET DATA TYPE "public"."payment_request_status" USING "status"::"public"."payment_request_status";--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TYPE "public"."payment_request_log_action" ADD VALUE 'SENT';--> statement-breakpoint
ALTER TYPE "public"."payment_request_log_action" ADD VALUE 'REJECTED';--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "sent_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "rejection_reason" varchar(1000);--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_requests_sent_by" ON "payment_requests" USING btree ("sent_by");--> statement-breakpoint
CREATE INDEX "idx_payment_requests_rejected_by" ON "payment_requests" USING btree ("rejected_by");
