# Quality — OQC (Outgoing/Final QC)

## Purpose

QC **công đoạn** (`type = INHOUSE`) bên trong một Job sản xuất, trước khi cho nhập kho thành phẩm.
Phân vai: IQC QC vật tư (hàng nhập NCC + công đoạn `OUTSOURCE`), OQC QC công đoạn nội bộ. Gắn theo
`production_job_operations`, không phải cả Job (`docs/decisions/oqc-per-operation.md`). Dùng chung
bảng `quality_inspections`/`quality_inspection_results` với IQC (`inspectionType = OQC`) — xem
`docs/domains/quality-iqc.md`, `docs/decisions/qc-data-model.md`,
`docs/decisions/quality-schema-rename.md` (bảng đổi tên đầy đủ; bảng này từng tên `qc_requests`/
`qc_inspections`, cột `kind` từng mang giá trị `INCOMING`/`OUTGOING`).

## Core concepts

**Một dòng = một lô kiểm của một công đoạn `INHOUSE`.** `productionJobOperationId`+`productionJobId`
bắt buộc khi `inspectionType = OQC` (`chk_quality_inspections_oqc_job`). `itemId` snapshot từ
`bomItem.itemId` của node BOM chứa công đoạn — mất `itemId` (node bị xoá) thì không tạo được OQC
(`E199`). `operationCode`/`operationName`/`bomItem.*` trên response không phải cột lưu, đọc qua
relation lúc `GET`.

**Node Cấp 0** (bước lắp ráp/đóng gói cuối) là một công đoạn `INHOUSE` bình thường — mỗi Job có thêm
đúng 1 node `itemType = 'FG'` (khi item FG có khai routing Cấp 0), đứng cuối cây, mang chính công
đoạn Cấp 0. OQC gắn vào công đoạn của node này y hệt mọi node WIP khác, không route/bảng riêng
(`docs/decisions/oqc-per-operation.md`, mục "QC cho Cấp 0"). Gate nhập kho TP (`E209`) đọc cờ
`isFinalAssembly` qua `itemType = 'FG'` của node này.

**`quantity` là lot size QC tự nhập** — trần chặn là `operation.completedQuantity` hiện tại (xưởng
tự báo qua `POST /production-execution/operations/:jobOperationId/reports`).

**Bốn enum, hai quy tắc suy `status`** (`OqcService.resolveOqcStatus`). `result`/`disposition` giữ
nguyên vocabulary cũ dù cột DB đổi tên (`result`→cột `decision`) — chỉ `status` đổi giá trị thật:
API trả thẳng `QualityInspectionStatus` từ DB, không còn dịch qua vocabulary cũ
(`NOT_INSPECTED`/`REWORK`) như trước 2026-08-29 (`docs/decisions/quality-schema-rename.md`, D5 cập
nhật). Business logic nội bộ (`resolveOqcStatus`) vẫn tính theo `OqcStatus` cũ rồi
`toInspectionStatus()` trước khi ghi DB (`src/api/iqc/quality-inspection-status.util.ts`) — chỉ
đường đọc/filter ra ngoài đổi:

```
result       PASS | FAIL                — nullable
resultAuto   PASS | FAIL                — server tự suy từ Ac/Re, chỉ để tham khảo
disposition  ACCEPT | REWORK | SCRAP    — chỉ có nghĩa khi result = FAIL (khác OqcStatus.REWORK cũ
                                           — status không còn giá trị này, chỉ disposition còn)
status       DRAFT | PENDING | IN_PROGRESS | COMPLETED   — cùng giá trị trên API lẫn DB
```

| result | disposition | → status |
| --- | --- | --- |
| NULL | — | `DRAFT` |
| PASS | (bỏ trống) | `COMPLETED` — **khoá cứng**, không `confirm` lại được (`E177`) |
| FAIL | (chưa gửi) | `PENDING` |
| FAIL | `ACCEPT` / `SCRAP` | `COMPLETED` |
| FAIL | `REWORK` | `IN_PROGRESS` — phiếu vẫn mở, `confirm` lại được tới khi PASS |

`IN_PROGRESS` không tự phân biệt "đang REWORK" với IQC's `IN_PROGRESS` (chờ trả NCC) — chỉ suy
được qua ngữ cảnh đang ở module `oqc`, xem `docs/domains/quality-iqc.md`.

`result` QC gửi lên thắng nếu có, vắng thì lấy `resultAuto`. Không nhánh nào ghi ngược
`production_job_operations.completedQuantity` — kể cả `SCRAP` (giải phóng quota bằng cách không
tính vào Σ đã xin QC, không phải trừ `completedQuantity`).

`disposition = SCRAP` mang 2 vai trò tách biệt: bị loại khỏi Σ đã xin QC ở `createOqcForJob` (coi
như chưa từng xin), **và** bị loại khỏi `total`/`finalCompleted` ở `getJobQcCoverage` (một Job toàn
dòng SCRAP không tính là "đã QC xong") — cùng điều kiện loại trừ, khác lý do.

## Entities

Dùng chung `quality_inspections`/`quality_inspection_results`/`quality_inspection_evidences`/
`qc_aql_plans`/`qc_aql_rules` với IQC — xem `docs/domains/quality-iqc.md`, Entities. `OqcDisposition`
(`ACCEPT`/`REWORK`/`SCRAP`) là enum **riêng**, không dùng chung `IqcDisposition`.

## Lifecycle

Route tạo duy nhất: `POST /production-jobs/:jobId/qc` — **cấp Job, không nhận body**, luôn tạo
`status = DRAFT`. Thứ tự kiểm trong `createOqcForJob`:

1. Job tồn tại (`E082`).
2. Job đang `IN_PROGRESS` **hoặc `WAITING_QC`** (`E175`) — đường chạy bình thường luôn tới ở
   `WAITING_QC` vì `POST .../reports` tự đẩy Job sang đó ngay khi công đoạn Cấp 0 xong.
3. Job có node BOM `itemType='FG'` với ≥1 công đoạn `type ≠ OUTSOURCE` — thiếu → `E213`.
4. **Mọi** công đoạn `INHOUSE` của node Cấp 0 (không riêng công đoạn `sortOrder` cao nhất) đã
   `completedDate` — một `COUNT` riêng, không tái dùng gate `E210`, vì node Cấp 0 có thể nhiều công
   đoạn nên `completedDate` của một dòng không đại diện được cả node; thiếu → `E214`.
5. Node còn `itemId` để snapshot — mất → `E199`.
6. Σ `quantity` đã xin QC của mọi công đoạn as-used cùng node + lô mới ≤ `plannedQuantity` → `E176`.
7. Σ `quantity` đã xin QC riêng công đoạn Cấp 0 phải = 0 (lô luôn lấy trọn `completedQuantity`,
   xin lần hai chắc chắn vượt trần) → `E198`.
8. Tạo — `quantity = completedQuantity` hiện tại, `requestedAt = new Date()`.

`confirm` (`POST /oqc/:oqcId/confirm`): chặn nếu đã `COMPLETED` (`E177`); mọi status khác confirm
lại được nhiều lần, mỗi lần 1 attempt mới. `inspectionLevel!`/`aqlLevel!`/`defectQty!` bắt buộc;
`result?` tuỳ chọn (fallback `resultAuto`, cả hai vắng → `E200`); **`sampleSize` không được server
tự điền từ plan AQL** — chỉ ghi khi client gửi. `disposition`/`dispositionNote` chỉ có ý nghĩa khi
FAIL, gửi kèm PASS không báo lỗi (tự ép `NULL`).

`DELETE /oqc/:oqcId` chỉ khi `DRAFT` (`E178`), hard delete. `IN_PROGRESS` (đang REWORK) không xoá
được, chỉ tiếp tục sửa qua `confirm`.

## Business rules

- QC toàn quyền quyết định `result`/`disposition` — AQL/Ac-Re/`resultAuto` chỉ gợi ý.
  `E201`/`E202`/`E215` (validate chéo PASS+disposition, `dispositionNote` bắt buộc) đã nghỉ hưu,
  không throw site. DB CHECK (`chk_quality_inspections_disposition_requires_fail`) vẫn là chốt chặn
  cuối cho ghi trực tiếp qua SQL.
- `code` (cột DB `inspectionNo`) bất biến, unique toàn bảng, tự sinh `OQC-{năm}-{5 số}` qua
  `document_sequences` — không route nào nhận `code` từ client (không có field trên request nào).
- Bằng chứng đính kèm — mirror IQC: `confirmOqc` nhận `qcEvidenceFileIds`/
  `dispositionEvidenceFileIds`, `quality_inspection_evidences.qualityInspectionResultId` trỏ
  attempt, insert-only.
- "PO" hiển thị trên màn OQC = `orders.code`, tính lúc đọc qua
  `production_jobs → production_orders → orders`, không lưu cột.

## Invariants

- `chk_quality_inspections_oqc_job`, `chk_quality_inspections_oqc_no_supplier`,
  `chk_quality_inspections_oqc_no_client`, `chk_quality_inspections_oqc_no_iqc_fields`,
  `uq_quality_inspections_id_type_quantity` — ràng buộc nhánh OQC không mang field của IQC.
- `uq_production_job_bom_items_final_assembly` — tối đa 1 node Cấp 0/Job.

## Cross-domain dependencies

- **← Production**: `productionJobOperationId` trỏ công đoạn `INHOUSE` của Job — đọc một chiều lúc
  tạo. Production không đọc gì từ Quality để hiển thị.
- **→ Production (ghi)**: `confirmOqc`, `confirmIqc`, và `completeIqcAfterSupplierReturn` đều gọi
  `closeJobIfQcCovered` (`src/api/oqc/oqc.query.ts`) — khi `getJobQcCoverage` báo `total > 0 &&
  open === 0`, chuyển `production_jobs.status` từ `IN_PROGRESS`/`WAITING_QC` sang
  `WAITING_DELIVERY` (nhận cả `IN_PROGRESS` — Job có thể nhảy thẳng nếu QC hoàn tất trước khi mọi
  công đoạn khác báo xong).
- **→ Inventory (ghi)**: cùng lượt gọi trên, nếu UPDATE thật sự đổi trạng thái (`.returning()`
  non-empty — chỉ đúng một lần trong đời Job), `closeJobIfQcCovered` gọi tiếp
  `createProductionReceiptForJob` (`src/api/inventory-receipts/inventory-receipts.write.ts`,
  plain function nhận `tx`, không qua DI) tự sinh 1 `inventory_receipts` thẳng `PENDING_RECEIPT`
  (`receiptType = PRODUCTION`, không qua `DRAFT` — OQC vừa đóng coverage chính là gate chất lượng)
  + 1 dòng `itemId = job.itemId`/`quantity = job.quantity`. Bỏ qua im lặng nếu Job đã có phiếu
  `PRODUCTION` — xem `docs/domains/inventory.md`.
- **→ Inventory (Gate nhập kho TP)**: `inventory-receipts confirm` (`receiptType=PRODUCTION`) chặn
  nếu Job chưa có dòng QC nào hoặc còn dòng chưa `COMPLETED` (`E196`) — `getJobQcCoverage` gộp cả
  IQC (công đoạn `OUTSOURCE`) lẫn OQC (công đoạn `INHOUSE`) qua neo chung
  `productionJobOperationId`, không cần lọc `inspectionType`. Node Cấp 0 riêng phải có ≥1 dòng OQC
  `COMPLETED` (`E209`, tách khỏi `E196`). SL nhập vẫn chặn trần `production_jobs.quantity` (`E197`).
- **→ Inventory (Gate giao hàng)**: `POST /outbound-orders/:id/send` (`DRAFT`/`REJECTED →
  PENDING_APPROVAL`) chặn (`E205`) nếu còn Job nào (qua `outbound_order_items.productionJobId`)
  chưa qua hết QC — tái dùng `getJobQcCoverage`. Xem `docs/workflows/outgoing-qc.md`.

## Common mistakes

1. OQC có lọc `type = OUTSOURCE` — `createOqcForJob` chỉ chọn công đoạn Cấp 0 khác `OUTSOURCE`
   ngay trong `SELECT`; nhánh đó QC bằng IQC. `E211` đã khai tử.
2. `POST /oqc`/`GET /oqc/inspectable-operations` đã bỏ — tạo chỉ qua
   `POST /production-jobs/:jobId/qc`.
3. `getOqcSummaryByJobOperationIds` đã xoá — Production không còn đọc tóm tắt OQC theo công đoạn.
4. `getJobOqcClearance` đổi tên thành `getJobQcCoverage`.
5. Đi tìm bảng `qc_requests`/`qc_inspections` — đổi tên thành `quality_inspections`/
   `quality_inspection_results` (`docs/decisions/quality-schema-rename.md`).
6. Đi tìm `status = NOT_INSPECTED`/`REWORK` trên response API — từ 2026-08-29, `status` trả thẳng
   vocabulary DB (`DRAFT`/`IN_PROGRESS`), không còn dịch ngược (`docs/decisions/quality-schema-rename.md`,
   D5 cập nhật). `REWORK` vẫn còn ở `OqcDisposition` — chỉ status không còn dùng nó.

## Related docs

- `docs/domains/quality-iqc.md` — bảng dùng chung, `qc-data-model`.
- `docs/decisions/quality-schema-rename.md` — bảng đổi tên cột/bảng đầy đủ, lớp dịch `status`.
- `docs/decisions/oqc-per-operation.md` — vì sao gắn công đoạn, node Cấp 0.
- `docs/decisions/qc-aql-master-data.md`.
- `docs/domains/production.md` — máy trạng thái Job, node Cấp 0.
- `docs/workflows/outgoing-qc.md` — luồng đầy đủ: "Yêu cầu QC" → confirm → 2 gate.
- `docs/decisions/qc-gates-on-stock-moves.md`.
