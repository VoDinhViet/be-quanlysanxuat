CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"year" integer DEFAULT 0 NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_document_sequences_type_year" UNIQUE("document_type","year"),
	CONSTRAINT "chk_document_sequences_current_value_non_negative" CHECK (current_value >= 0)
);
--> statement-breakpoint
-- Backfill: đóng băng số lớn nhất hiện có cho từng (document_type, year) trước khi service chuyển
-- sang đọc qua document_sequences — không backfill thì phiếu tiếp theo sẽ trùng mã đầu tiên đã có.
-- Bảng nguồn rỗng/không có mã khớp định dạng thì không chèn dòng nào, lượt gọi thật đầu tiên tự
-- bootstrap từ 1 qua nhánh INSERT của ON CONFLICT trong generateDocumentSequence(s).
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'ITEM_RM', 0, max(substring("code" from '^VT([0-9]+)$')::int)
FROM "items" WHERE "code" ~ '^VT[0-9]+$'
HAVING count(*) > 0;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'ITEM_FG_WIP', 0, max(substring("code" from '^SP([0-9]+)$')::int)
FROM "items" WHERE "code" ~ '^SP[0-9]+$'
HAVING count(*) > 0;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'PURCHASE_REQUEST', 0, max(substring("code" from '^PR-([0-9]+)$')::int)
FROM "purchase_requests" WHERE "code" ~ '^PR-[0-9]+$'
HAVING count(*) > 0;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'PURCHASE_QUOTATION', 0, max(substring("code" from '^RFQ-([0-9]+)$')::int)
FROM "purchase_quotations" WHERE "code" ~ '^RFQ-[0-9]+$'
HAVING count(*) > 0;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'PURCHASE_ORDER', 0, max(substring("code" from '^PO-([0-9]+)$')::int)
FROM "purchase_orders" WHERE "code" ~ '^PO-[0-9]+$'
HAVING count(*) > 0;
-- Cố ý KHÔNG có khối WAREHOUSE: tiền tố mã kho tự sinh đổi từ `KHO` sang `WH` (chuẩn tiếng Anh)
-- cùng đợt này — `KHO0001` không cùng namespace với `WH0001` nên không backfill từ dữ liệu cũ;
-- đếm bắt đầu lại từ 1, không đụng mã đã có (trước migration này không mã nào khớp `^WH[0-9]+$`).
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'OQC', substring("code" from '^OQC-([0-9]+)-')::int,
       max(substring("code" from '^OQC-[0-9]+-([0-9]+)$')::int)
FROM "oqc_inspections" WHERE "code" ~ '^OQC-[0-9]+-[0-9]+$'
GROUP BY substring("code" from '^OQC-([0-9]+)-')::int;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'IQC', substring("code" from '^IQC-([0-9]+)-')::int,
       max(substring("code" from '^IQC-[0-9]+-([0-9]+)$')::int)
FROM "iqc_inspections" WHERE "code" ~ '^IQC-[0-9]+-[0-9]+$'
GROUP BY substring("code" from '^IQC-([0-9]+)-')::int;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'INVENTORY_RECEIPT', substring("code" from '^PNK-([0-9]+)-')::int,
       max(substring("code" from '^PNK-[0-9]+-([0-9]+)$')::int)
FROM "inventory_receipts" WHERE "code" ~ '^PNK-[0-9]+-[0-9]+$'
GROUP BY substring("code" from '^PNK-([0-9]+)-')::int;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'INVENTORY_ISSUE', substring("code" from '^PXK-([0-9]+)-')::int,
       max(substring("code" from '^PXK-[0-9]+-([0-9]+)$')::int)
FROM "inventory_issues" WHERE "code" ~ '^PXK-[0-9]+-[0-9]+$'
GROUP BY substring("code" from '^PXK-([0-9]+)-')::int;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'OUTSOURCING_ORDER', 0, max(substring("code" from '^OS-OUT-([0-9]+)$')::int)
FROM "outsourcing_orders" WHERE "code" ~ '^OS-OUT-[0-9]+$'
HAVING count(*) > 0;
--> statement-breakpoint
INSERT INTO "document_sequences" ("document_type", "year", "current_value")
SELECT 'OUTSOURCING_RECEIPT', 0, max(substring("code" from '^OS-IN-([0-9]+)$')::int)
FROM "outsourcing_receipts" WHERE "code" ~ '^OS-IN-[0-9]+$'
HAVING count(*) > 0;
