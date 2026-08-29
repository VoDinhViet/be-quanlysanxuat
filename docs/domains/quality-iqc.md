# Quality — IQC (Incoming Quality Control)

## Purpose

QC hàng nhập từ NCC: đạt hay không, xử lý thế nào nếu không đạt. `iqc` và `oqc`
(`docs/domains/quality-oqc.md`) tách biệt ở tầng API nhưng cùng đọc/ghi **một bảng**
`quality_inspections`/`quality_inspection_results`, phân biệt bằng cột `inspectionType`
(`IQC`/`OQC`) — `docs/decisions/qc-data-model.md` giải thích vì sao gộp và vì sao tách case
row/attempt, `docs/decisions/quality-schema-rename.md` là bảng đổi tên đầy đủ (bảng này từng tên
`qc_requests`/`qc_inspections`, cột `kind` từng mang giá trị `INCOMING`/`OUTGOING`).

## Core concepts

**Không có header/items** — `supplierId`/`itemId`/`quantity` IQC tự giữ (denormalized), không suy
từ dòng nhập kho; `originType`/`originId`/`purchaseOrderId` chỉ để trace, không bắt buộc.

**`quality_inspections` là mirror của attempt mới nhất trong `quality_inspection_results`.** Mỗi lần
`POST /iqc/:iqcId/confirm` insert **một dòng attempt mới** (không `UPDATE` đè), rồi copy kết quả lên
`quality_inspections` cùng transaction — giữ lại toàn bộ lịch sử các lần sửa/REWORK. `attemptCount`
đếm số attempt; các cột chỉ tồn tại ở tầng attempt (`ac`/`re`/`codeLetter` — snapshot AQL lúc kiểm)
đọc từ attempt mới nhất khi `GET`.

**Ba đường tạo** (đều ra dòng `inspectionType = IQC`, `status = DRAFT`):
1. `POST /iqc` tay.
2. `POST /inventory-receipts/:id/confirm` với `requiresIqc = true` — 1 dòng/dòng phiếu nhập, trong
   transaction của `confirmInventoryReceipt`. `originType = INVENTORY_RECEIPT`, `originId` = id
   phiếu nhập.
3. `POST /outsourcing-receipts` với `requiresIqc = true` — N dòng (1/dòng OS-IN), trong transaction
   `create` (OS-IN không có nháp, `docs/decisions/outsourcing-no-draft.md`), **không gate** việc tạo
   phiếu. Mỗi dòng `originType = OUTSOURCING_RECEIPT_ITEM`, `originId` = id dòng OS-IN, neo thêm
   `productionJobId`/`productionJobOperationId` (denormalize từ công đoạn `OUTSOURCE` nguồn) — neo
   mà `getJobQcCoverage` dùng để gộp với OQC.

**`originType`/`originId` (polymorphic)** thay 3 cột chứng từ nguồn cũ (`inventoryReceiptId`/
`outsourcingReceiptId`/`outsourcingReceiptItemId`) — `INVENTORY_RECEIPT`/`OUTSOURCING_RECEIPT_ITEM`/
`MANUAL` (không chứng từ, IQC tạo tay hoặc phiếu nhập `ADJUSTMENT`). `outsourcingReceiptId` không
còn cột riêng — suy qua join `outsourcing_receipt_items` khi cần (vd `getIqc` hiển thị
`outsourcingReceipt`). Không gộp `purchaseOrderId`/`supplierId`/`clientId`/`productionJobId`/
`productionJobOperationId` — 5 cột đó vẫn là FK thật, lý do đầy đủ:
`docs/decisions/quality-schema-rename.md`.

**Ba enum, một quy tắc suy `status`** (`IqcService.resolveIqcStatus`, dùng chung cho `create` lẫn
`confirm`; `chk_quality_inspections_disposition_requires_fail` ở DB là chốt chặn cuối, không phải
nơi tính). `result`/`disposition` giữ nguyên vocabulary cũ dù cột DB đổi tên (`result`→cột
`decision`) — chỉ `status` đổi giá trị thật: API trả thẳng `QualityInspectionStatus` từ DB, không
còn dịch qua vocabulary cũ (`NOT_INSPECTED`/`WAITING_RETURN`) như trước 2026-08-29
(`docs/decisions/quality-schema-rename.md`, D5 cập nhật). Business logic nội bộ
(`resolveIqcStatus`) vẫn tính theo `IqcStatus` cũ rồi `toInspectionStatus()` trước khi ghi DB
(`src/api/iqc/quality-inspection-status.util.ts`) — chỉ đường đọc/filter ra ngoài đổi:

```
result       PASS | FAIL                    — nullable, chưa kiểm = NULL
disposition  CONCESSION | SORT | RETURN     — chỉ có nghĩa khi result = FAIL
status       DRAFT | PENDING | IN_PROGRESS | COMPLETED   — cùng giá trị trên API lẫn DB
```

| result | disposition | → status |
| --- | --- | --- |
| NULL | — | `DRAFT` |
| PASS | (bỏ trống) | `COMPLETED` |
| FAIL | (chưa gửi) | `PENDING` |
| FAIL | `CONCESSION` | `COMPLETED` |
| FAIL | `SORT` / `RETURN` | `IN_PROGRESS` + tự sinh `supplier_returns` DRAFT |

`IN_PROGRESS` không tự phân biệt "IQC chờ trả NCC" — chỉ suy được qua ngữ cảnh đang ở module `iqc`
(mọi dòng đọc qua `/iqc` luôn `inspectionType = IQC`); so sánh với OQC's `IN_PROGRESS` (đang REWORK)
ở `docs/domains/quality-oqc.md`.

## Entities

- `quality_inspections` — case row, dùng chung IQC/OQC, phân biệt bằng `inspectionType`.
- `quality_inspection_results` — 1 attempt/lần `confirm`, append-only, snapshot Ac/Re/`codeLetter`.
- `quality_inspection_evidences` — bằng chứng, discriminator `kind` (`QC_EVIDENCE`/
  `DISPOSITION_EVIDENCE`, enum `QualityEvidenceKind` — khác `inspectionType` của
  `quality_inspections`), `qualityInspectionResultId` trỏ **attempt**, insert-only.
- `qc_aql_plans`/`qc_aql_rules` — master data phương án lấy mẫu AQL (thay hardcode cũ), CRUD ở
  module `qc-aql`; `resolveAqlPlan()` (`src/api/iqc/iqc-aql.query.ts`) là điểm tra dùng chung với
  OQC. Seed một lần từ bảng giấy mẫu — sửa qua `PATCH /qc-aql/plans/:planId`, không cần deploy.

## Lifecycle

`DRAFT → {PENDING, COMPLETED, IN_PROGRESS}` qua `POST /iqc/:iqcId/confirm`, gọi lại được nhiều lần
(mỗi lần 1 attempt mới) **trừ khi đã `IN_PROGRESS`** (khoá cứng, `E159`). Từ `IN_PROGRESS`, chuyển
tiếp **duy nhất một lần** sang `COMPLETED` qua `completeIqcAfterSupplierReturn`
(`src/api/iqc/iqc.write.ts`, hàm thuần nhận `tx`, không qua `IqcService`) — gọi bởi
`SupplierReturnsService.postSupplierReturn` khi kho xác nhận đã xuất trả NCC. Gọi lại khi không còn
`IN_PROGRESS` → `E164`.

`confirm` chặn `IN_PROGRESS` ở 2 lớp: fail-fast trước tx (`ensureIqcSavable`, `E159`) rồi khoá lại
bằng `SELECT … FOR UPDATE` trong tx (`E159` lần nữa) — khoá thật là lớp trong, tránh 2 request confirm
song song cùng tính `attemptNo`.

`PATCH /iqc/:iqcId` chỉ sửa 4 field ngữ cảnh (`inspectionStandard`/`inspectorName`/
`measuringTools`/`inspectionDate`) — không đụng `result`/`disposition`/AQL, những field đó sửa lại
qua `confirm`. Hợp lệ ở mọi status **trừ** `DRAFT` (`E144`) — chủ yếu dùng khi đã `IN_PROGRESS`
(nơi `confirm` bị khoá nhưng vẫn cần sửa lỗi chính tả).

`DELETE /iqc/:iqcId` chỉ khi `DRAFT` (`E206`).

## Business rules

- `code` (cột DB `inspectionNo`) bất biến, unique toàn bảng `quality_inspections` (không riêng theo
  `inspectionType`), luôn tự sinh `IQC-{năm}-{5 số}` qua `document_sequences` — không route nào
  nhận `code` từ client.
- QC tự chọn `result`/`disposition` hoàn toàn; AQL (`inspectionLevel`/`aqlLevel` → `ac`/`re` snapshot
  qua `resolveAqlPlan()`) chỉ là gợi ý hiển thị, tra hụt không chặn `confirm`. `E139` (disposition
  yêu cầu FAIL) chỉ còn validate ở `POST /iqc` tạo tay; `confirm` không chặn nữa, tự ép
  `disposition`/`sortOkQty`/`sortNgQty`/`dispositionNote` về `NULL` khi PASS trước khi ghi.
- `disposition = SORT` bắt buộc `sortOkQty`+`sortNgQty` (thiếu → `E162`) cộng đúng `quantity`
  (`E160`); gửi 2 field này khi khác `SORT` → `E161`.
- `confirmedBy`/`confirmedAt` (cột DB `inspectedBy`/`startedAt`) chỉ ghi ở lần lưu đầu tiên;
  `resolvedBy`/`resolvedAt` (cột DB `approvedBy`/`approvedAt`) chỉ ghi khi `disposition` mới xuất
  hiện lần đầu — sửa lại kết quả ở lần sau không ghi đè hai mốc này.
- Nếu `disposition` ra `SORT`/`RETURN` mà không suy được kho trả (thử
  `inventoryReceipt.warehouseId` → `purchaseOrder.receiptWarehouseId`; dòng từ OS-IN
  (`originType = OUTSOURCING_RECEIPT_ITEM`) luôn hợp lệ trả `null` vì `outsourcing_receipts` không
  có cột kho, không tính là lỗi) → `E163`.
- Dòng không có `supplierId` (sinh từ phiếu nhập `RETURN` gắn `clientId`) không chọn được
  `disposition = SORT`/`RETURN` → `E254` — chưa có luồng trả hàng cho khách hàng, chỉ xử lý được
  bằng `CONCESSION`.
- `E140`–`E143` (namespace `iqc_inspection.error.code_*`) không còn throw site — mã dự phòng.

## Invariants

- Không có FK mức dòng tới `purchase_order_items`/`inventory_receipt_items` (không có số thứ tự
  dòng ổn định) — chỉ trace mức chứng từ. `originId` khi `originType = OUTSOURCING_RECEIPT_ITEM`
  trace được tới mức dòng.
- `itemId` không ràng buộc `type = RM` ở DB/service.
- CHECK `sample_size > 0`/`defect_qty >= 0`/`aql_level > 0` khi có giá trị;
  `chk_quality_inspections_disposition_requires_fail`; `chk_quality_inspections_sort_qty_pair`/
  `_sort_qty_requires_sort`/`_sort_qty_total`; `chk_quality_inspections_origin_id_pair`
  (`originType = MANUAL` ⟺ `originId IS NULL`).
- `chk_quality_inspections_supplier_client_exclusive` — `supplierId`/`clientId` loại trừ lẫn nhau
  khi cả hai có giá trị, nhưng **cả hai đều có thể `null`** (phiếu nhập `ADJUSTMENT`). Nơi thật sự
  cần `supplierId` khác null (tự sinh phiếu trả NCC) tự chặn riêng bằng `E254`.

## Cross-domain dependencies

- **← Inventory**: `inventory-receipts confirm` (`requiresIqc`) và `outsourcing-receipts create`
  (`requiresIqc`) là 2 đường tạo tự động — xem Core concepts.
- **→ Inventory**: `inventory-receipts post` chặn `E153` khi còn IQC nào của phiếu chưa `COMPLETED`.
  `inventory-issues post` (`issueType=PRODUCTION`) chặn `E203` nếu còn IQC chưa `COMPLETED` của cùng
  `(itemId, warehouseId)` — `hasPendingIqcForItems`, bỏ qua nếu phiếu IQC không suy được kho
  (`docs/decisions/qc-gates-on-stock-moves.md`).
- **↔ Inventory (Supplier Returns)**: `confirmIqc` tự sinh `supplier_returns DRAFT` khi vào
  `IN_PROGRESS` (`createFromIqcDisposition`, cùng tx); `postSupplierReturn` gọi ngược
  `completeIqcAfterSupplierReturn` khi kho xuất trả xong. `supplier_returns.qualityInspectionId`
  chỉ trỏ dòng `inspectionType = IQC`. Xem `docs/workflows/supplier-return.md`.
- **→ Production (ghi)**: `confirmIqc` và `completeIqcAfterSupplierReturn` cũng gọi
  `closeJobIfQcCovered` — cùng cạnh ghi mà OQC dùng để mở khoá Job, xem
  `docs/domains/quality-oqc.md`, Cross-domain dependencies.
- **→ Purchasing**: `purchaseOrderId` trace, không đọc ngược.
- **→ Partners**: `supplierId`/`clientId` trỏ `suppliers`/`clients` (loại trừ lẫn nhau, có thể cùng
  null — xem Invariants).
- **→ Product Structure**: `itemId` bắt buộc.
- **→ Identity/Access**: `qcDepartmentId` tuỳ chọn.
- **→ Files**: `quality_inspection_evidences.fileId`.

## Common mistakes

1. Tưởng `status` là view tính runtime — nó là cột lưu thật, mirror của attempt mới nhất.
2. Đi tìm `POST /iqc/:iqcId/resolve` — đã gộp vào `confirm`.
3. Đi tìm bảng dòng nhiều-vật-tư — không có, `quality_inspection_results` là **lần kiểm**, không
   phải dòng vật tư.
4. Tưởng `confirm` tự tính `result` từ Ac/Re — QC tự chọn hoàn toàn, AQL chỉ tham khảo.
5. Tưởng chỉ có 2 đường tạo — có 3 (xem Core concepts).
6. Tưởng `iqc_inspections`/`oqc_inspections` là 2 bảng riêng — đã gộp `quality_inspections`+
   `inspectionType`.
7. Tưởng `confirm` lại ghi đè mất lần kiểm trước — mỗi lần là 1 attempt mới, không mất lịch sử.
8. Tưởng `GET /iqc/:iqcId` trả danh sách attempt — trả case row hiện hành (mirror) + `ac`/`re`/
   `codeLetter` của attempt mới nhất; chưa có DTO trả mảng lịch sử.
9. Đi tìm cột `qc_requests.inventoryReceiptId`/`outsourcingReceiptId`/`outsourcingReceiptItemId` —
   đã gộp thành `originType`/`originId` polymorphic, xem Core concepts.
10. Đi tìm `status = NOT_INSPECTED`/`WAITING_RETURN` trên response API — từ 2026-08-29, `status` trả
    thẳng vocabulary DB (`DRAFT`/`IN_PROGRESS`), không còn dịch ngược
    (`docs/decisions/quality-schema-rename.md`, D5 cập nhật).

## Related docs

- `docs/decisions/qc-data-model.md` — vì sao gộp bảng theo `inspectionType`, vì sao tách case
  row/attempt.
- `docs/decisions/quality-schema-rename.md` — bảng đổi tên cột/bảng đầy đủ, lớp dịch `status`.
- `docs/decisions/qc-aql-master-data.md` — AQL là master data, nơi snapshot Ac/Re/`codeLetter`.
- `docs/domains/quality-oqc.md` — OQC, `getJobQcCoverage`/`closeJobIfQcCovered` hợp nhất 2 nhánh.
- `docs/domains/inventory.md` — `supplier_returns`, gate xuất kho sản xuất.
- `docs/workflows/supplier-return.md`, `docs/workflows/outsourcing-round-trip.md`.
- `docs/decisions/qc-gates-on-stock-moves.md` — vì sao có gate IQC/OQC trên luồng kho.
