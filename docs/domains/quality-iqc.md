# Quality — IQC (Incoming Quality Control)

## Purpose

QC hàng nhập từ NCC: đạt hay không, xử lý thế nào nếu không đạt. `iqc` và `oqc`
(`docs/domains/quality-oqc.md`) tách biệt ở tầng API nhưng cùng đọc/ghi **một bảng**
`qc_requests`/`qc_inspections`, phân biệt bằng cột `kind` (`INCOMING`/`OUTGOING`) —
`docs/decisions/qc-data-model.md` giải thích vì sao gộp và vì sao tách request/attempt.

## Core concepts

**Không có header/items** — `supplierId`/`itemId`/`quantity` IQC tự giữ (denormalized), không suy
từ dòng nhập kho; `inventoryReceiptId`/`purchaseOrderId`/`outsourcingReceiptId` chỉ để trace, không
bắt buộc.

**`qc_requests` là mirror của attempt mới nhất trong `qc_inspections`.** Mỗi lần
`POST /iqc/:iqcId/confirm` insert **một dòng attempt mới** (không `UPDATE` đè), rồi copy kết quả lên
`qc_requests` cùng transaction — giữ lại toàn bộ lịch sử các lần sửa/REWORK.
`attemptCount` đếm số attempt; các cột chỉ tồn tại ở tầng attempt (`ac`/`re`/`codeLetter` — snapshot
AQL lúc kiểm) đọc từ attempt mới nhất khi `GET`.

**Ba đường tạo** (đều ra dòng `kind = INCOMING`, `NOT_INSPECTED`):
1. `POST /iqc` tay.
2. `POST /inventory-receipts/:id/confirm` với `requiresIqc = true` — 1 dòng/dòng phiếu nhập, trong
   transaction của `confirmInventoryReceipt`.
3. `POST /outsourcing-receipts` với `requiresIqc = true` — N dòng (1/dòng OS-IN), trong transaction
   `create` (OS-IN không có nháp, `docs/decisions/outsourcing-no-draft.md`), **không gate** việc tạo
   phiếu. Mỗi dòng neo `outsourcingReceiptItemId` + `productionJobId`/`productionJobOperationId`
   (denormalize từ công đoạn `OUTSOURCE` nguồn) — neo mà `getJobQcCoverage` dùng để gộp với OQC.

**Ba enum, một quy tắc suy `status`** (`IqcService.resolveIqcStatus`, dùng chung cho `create` lẫn
`confirm`; `chk_qc_requests_disposition_requires_fail` ở DB là chốt chặn cuối, không phải nơi tính):

```
result       PASS | FAIL                    — nullable, chưa kiểm = NULL
disposition  CONCESSION | SORT | RETURN     — chỉ có nghĩa khi result = FAIL
status       NOT_INSPECTED | PENDING | WAITING_RETURN | COMPLETED
```

| result | disposition | → status |
| --- | --- | --- |
| NULL | — | `NOT_INSPECTED` |
| PASS | (bỏ trống) | `COMPLETED` |
| FAIL | (chưa gửi) | `PENDING` |
| FAIL | `CONCESSION` | `COMPLETED` |
| FAIL | `SORT` / `RETURN` | `WAITING_RETURN` + tự sinh `supplier_returns` DRAFT |

## Entities

- `qc_requests` — header, dùng chung IQC/OQC, phân biệt bằng `kind`.
- `qc_inspections` — 1 attempt/lần `confirm`, append-only, snapshot Ac/Re/`codeLetter`.
- `qc_files` — bằng chứng, discriminator `kind` (`QC_EVIDENCE`/`DISPOSITION_EVIDENCE`, enum
  `QcFileKind` — khác `kind` của `qc_requests`), `inspectionId` trỏ **attempt**, insert-only.
- `qc_aql_plans`/`qc_aql_rules` — master data phương án lấy mẫu AQL (thay hardcode cũ), CRUD ở
  module `qc-aql`; `resolveAqlPlan()` (`src/api/iqc/iqc-aql.query.ts`) là điểm tra dùng chung với
  OQC. Seed một lần từ bảng giấy mẫu — sửa qua `PATCH /qc-aql/plans/:planId`, không cần deploy.

## Lifecycle

`NOT_INSPECTED → {PENDING, COMPLETED, WAITING_RETURN}` qua `POST /iqc/:iqcId/confirm`, gọi lại được
nhiều lần (mỗi lần 1 attempt mới) **trừ khi đã `WAITING_RETURN`** (khoá cứng, `E159`). Từ
`WAITING_RETURN`, chuyển tiếp **duy nhất một lần** sang `COMPLETED` qua
`completeIqcAfterSupplierReturn` (`src/api/iqc/iqc.write.ts`, hàm thuần nhận `tx`, không qua
`IqcService`) — gọi bởi `SupplierReturnsService.postSupplierReturn` khi kho xác nhận đã xuất trả
NCC. Gọi lại khi không còn `WAITING_RETURN` → `E164`.

`confirm` chặn `WAITING_RETURN` ở 2 lớp: fail-fast trước tx (`ensureIqcSavable`, `E159`) rồi khoá lại
bằng `SELECT … FOR UPDATE` trong tx (`E159` lần nữa) — khoá thật là lớp trong, tránh 2 request confirm
song song cùng tính `attemptNo`.

`PATCH /iqc/:iqcId` chỉ sửa 4 field ngữ cảnh (`inspectionStandard`/`inspectorName`/
`measuringTools`/`inspectionDate`) — không đụng `result`/`disposition`/AQL, những field đó sửa lại
qua `confirm`. Hợp lệ ở mọi status **trừ** `NOT_INSPECTED` (`E144`) — chủ yếu dùng khi đã
`WAITING_RETURN` (nơi `confirm` bị khoá nhưng vẫn cần sửa lỗi chính tả).

`DELETE /iqc/:iqcId` chỉ khi `NOT_INSPECTED` (`E206`).

## Business rules

- `code` bất biến, unique toàn bảng `qc_requests` (không riêng theo `kind`), luôn tự sinh
  `IQC-{năm}-{5 số}` qua `document_sequences` — không route nào nhận `code` từ client.
- QC tự chọn `result`/`disposition` hoàn toàn; AQL (`inspectionLevel`/`aqlLevel` → `ac`/`re` snapshot
  qua `resolveAqlPlan()`) chỉ là gợi ý hiển thị, tra hụt không chặn `confirm`. `E139` (disposition
  yêu cầu FAIL) chỉ còn validate ở `POST /iqc` tạo tay; `confirm` không chặn nữa, tự ép
  `disposition`/`sortOkQty`/`sortNgQty`/`dispositionNote` về `NULL` khi PASS trước khi ghi.
- `disposition = SORT` bắt buộc `sortOkQty`+`sortNgQty` (thiếu → `E162`) cộng đúng `quantity`
  (`E160`); gửi 2 field này khi khác `SORT` → `E161`.
- `confirmedBy`/`confirmedAt` chỉ ghi ở lần lưu đầu tiên; `resolvedBy`/`resolvedAt` chỉ ghi khi
  `disposition` mới xuất hiện lần đầu — sửa lại kết quả ở lần sau không ghi đè hai mốc này.
- Nếu `disposition` ra `SORT`/`RETURN` mà không suy được kho trả (thử
  `inventoryReceipt.warehouseId` → `purchaseOrder.receiptWarehouseId`; dòng từ OS-IN luôn hợp lệ trả
  `null` vì `outsourcing_receipts` không có cột kho, không tính là lỗi) → `E163`.
- Dòng không có `supplierId` (sinh từ phiếu nhập `RETURN` gắn `clientId`) không chọn được
  `disposition = SORT`/`RETURN` → `E254` — chưa có luồng trả hàng cho khách hàng, chỉ xử lý được
  bằng `CONCESSION`.
- `E140`–`E143` (namespace `iqc_inspection.error.code_*`) không còn throw site — mã dự phòng.

## Invariants

- Không có FK mức dòng tới `purchase_order_items`/`inventory_receipt_items` (không có số thứ tự
  dòng ổn định) — chỉ trace mức chứng từ. `outsourcingReceiptItemId` trace được tới mức dòng.
- `itemId` không ràng buộc `type = RM` ở DB/service.
- CHECK `sample_size > 0`/`defect_qty >= 0`/`aql_level > 0` khi có giá trị;
  `chk_qc_requests_disposition_requires_fail`; `chk_qc_requests_sort_qty_pair`/
  `_sort_qty_requires_sort`/`_sort_qty_total`.
- `chk_qc_requests_supplier_client_exclusive` — `supplierId`/`clientId` loại trừ lẫn nhau khi cả hai
  có giá trị, nhưng **cả hai đều có thể `null`** (phiếu nhập `ADJUSTMENT`) —
  `chk_qc_requests_incoming_supplier` (từng đòi một trong hai non-null) đã bỏ hẳn. Nơi thật sự cần
  `supplierId` khác null (tự sinh phiếu trả NCC) tự chặn riêng bằng `E254`.

## Cross-domain dependencies

- **← Inventory**: `inventory-receipts confirm` (`requiresIqc`) và `outsourcing-receipts create`
  (`requiresIqc`) là 2 đường tạo tự động — xem Core concepts.
- **→ Inventory**: `inventory-receipts post` chặn `E153` khi còn IQC nào của phiếu chưa `COMPLETED`.
  `inventory-issues post` (`issueType=PRODUCTION`) chặn `E203` nếu còn IQC chưa `COMPLETED` của cùng
  `(itemId, warehouseId)` — `hasPendingIqcForItems`, bỏ qua nếu phiếu IQC không suy được kho
  (`docs/decisions/qc-gates-on-stock-moves.md`).
- **↔ Inventory (Supplier Returns)**: `confirmIqc` tự sinh `supplier_returns DRAFT` khi vào
  `WAITING_RETURN` (`createFromIqcDisposition`, cùng tx); `postSupplierReturn` gọi ngược
  `completeIqcAfterSupplierReturn` khi kho xuất trả xong. `supplier_returns.iqcId` chỉ trỏ dòng
  `kind = INCOMING`. Xem `docs/workflows/supplier-return.md`.
- **→ Production (ghi)**: `confirmIqc` và `completeIqcAfterSupplierReturn` cũng gọi
  `closeJobIfQcCovered` — cùng cạnh ghi mà OQC dùng để mở khoá Job, xem
  `docs/domains/quality-oqc.md`, Cross-domain dependencies.
- **→ Purchasing**: `purchaseOrderId` trace, không đọc ngược.
- **→ Partners**: `supplierId`/`clientId` trỏ `suppliers`/`clients` (loại trừ lẫn nhau, có thể cùng
  null — xem Invariants).
- **→ Product Structure**: `itemId` bắt buộc.
- **→ Identity/Access**: `qcDepartmentId` tuỳ chọn.
- **→ Files**: `qc_files.fileId`.

## Common mistakes

1. Tưởng `status` là view tính runtime — nó là cột lưu thật, mirror của attempt mới nhất.
2. Đi tìm `POST /iqc/:iqcId/resolve` — đã gộp vào `confirm`.
3. Đi tìm bảng dòng nhiều-vật-tư — không có, `qc_inspections` là **lần kiểm**, không phải dòng vật tư.
4. Tưởng `confirm` tự tính `result` từ Ac/Re — QC tự chọn hoàn toàn, AQL chỉ tham khảo.
5. Tưởng chỉ có 2 đường tạo — có 3 (xem Core concepts).
6. Tưởng `iqc_inspections`/`oqc_inspections` là 2 bảng riêng — đã gộp `qc_requests`+`kind`.
7. Tưởng `confirm` lại ghi đè mất lần kiểm trước — mỗi lần là 1 attempt mới, không mất lịch sử.
8. Tưởng `GET /iqc/:iqcId` trả danh sách attempt — trả request hiện hành (mirror) + `ac`/`re`/
   `codeLetter` của attempt mới nhất; chưa có DTO trả mảng lịch sử.

## Related docs

- `docs/decisions/qc-data-model.md` — vì sao gộp bảng theo `kind`, vì sao tách request/attempt.
- `docs/decisions/qc-aql-master-data.md` — AQL là master data, nơi snapshot Ac/Re/`codeLetter`.
- `docs/domains/quality-oqc.md` — OQC, `getJobQcCoverage`/`closeJobIfQcCovered` hợp nhất 2 nhánh.
- `docs/domains/inventory.md` — `supplier_returns`, gate xuất kho sản xuất.
- `docs/workflows/supplier-return.md`, `docs/workflows/outsourcing-round-trip.md`.
- `docs/decisions/qc-gates-on-stock-moves.md` — vì sao có gate IQC/OQC trên luồng kho.
