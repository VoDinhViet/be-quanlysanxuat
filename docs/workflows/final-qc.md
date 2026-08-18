# OQC — kiểm chất lượng công đoạn đến nhập kho / giao hàng

Chặng nối `production` → `quality` → `inventory`: từ lúc production "Yêu cầu QC" cho một lô của một
**công đoạn** đang chạy trong một Job, tới lúc QC xác nhận PASS (auto-suggest từ AQL, cho ghi đè),
tới lúc kho được phép nhập lô thành phẩm và DO được phép xác nhận giao. Mô hình
`production_job_operations` ở `docs/domains/production.md`, mô hình `oqc_inspections` ở
`docs/domains/quality.md`, 2 gate cross-domain ở `docs/domains/inventory.md`; đây là trình tự đầy đủ
nối các domain đó. OQC đổi từ gắn theo Job sang gắn theo công đoạn — xem
`docs/decisions/oqc-per-operation.md` cho bối cảnh/lý do.

## Trigger

- `GET /oqc/inspectable-operations` — popup "chọn công đoạn cần QC" (production), liệt kê công đoạn
  của Job `IN_PROGRESS` kèm `completedQuantity`/`inspectedQuantity`/`remainingQuantity`.
- `POST /oqc` — production "Yêu cầu QC" cho một lô đã hoàn thành (partial hoặc full) của một công
  đoạn cụ thể.
- `GET /oqc/aql-plan` — FE gọi để gợi ý `sampleSize`/`ac`/`re` trước khi QC nhập `defectQty`.
- `POST /oqc/:oqcId/confirm` — QC lưu kết quả kiểm, gọi lại được nhiều lần trên cùng phiếu tới khi
  `PASS` hoặc `disposition ∈ {ACCEPT, SCRAP}`.
- `DELETE /oqc/:oqcId` — gỡ phiếu tạo nhầm, chỉ khi còn `NOT_INSPECTED`.
- `POST /inventory-receipts/:receiptId/confirm` với `receiptType = PRODUCTION` — kho xác nhận nhập
  lô thành phẩm, đọc lại trạng thái OQC của Job.
- `POST /outbound-orders/:outboundOrderId/confirm` — Sales xác nhận DO (`DRAFT → PENDING_DELIVERY`),
  đọc lại trạng thái OQC của (các) Job liên quan.

## Actor

`oqc:create` cho bước tạo + xoá (production — cùng vai trò "yêu cầu QC" và "gỡ yêu cầu sai", khác
`oqc:delete` không tồn tại, dùng chung `create`). `oqc:read` cho popup/AQL-plan/list/detail.
`oqc:update` cho `confirm` (QC — vai trò khác, tách actor tạo/xác nhận). `inventory:update` cho
`confirm`/`post` phiếu nhập. `outbound:update` cho `confirm` DO (Sales).

## Preconditions

| Điều kiện | `POST /oqc` | `confirm` OQC | `confirm` phiếu nhập (PRODUCTION) | `confirm` DO |
| --- | --- | --- | --- | --- |
| Công đoạn tồn tại | `E091` | — | — | — |
| Job chứa công đoạn đang `IN_PROGRESS` | `E175` | — | — | — |
| Node BOM chứa công đoạn còn `itemId` | `E199` | — | — | — |
| Σ SL đã xin QC của cả node (mọi công đoạn as-used) + lô mới ≤ SL kế hoạch node | `E176` | — | — | — |
| Σ SL đã xin QC của riêng công đoạn + lô mới ≤ `completedQuantity` | `E198` | — | — | — |
| Phiếu OQC tồn tại, đang lưu được (`status ≠ COMPLETED`) | — | `E174`/`E177` | — | — |
| Có `result` hoặc `resultAuto` để dùng | — | `E200` | — | — |
| `result` lệch `resultAuto` mà thiếu `resultNote` | — | `E201` | — | — |
| `result = PASS` mà vẫn gửi `disposition` | — | `E202` | — | — |
| `productionJobId` có trên phiếu nhập | — | — | `E179` | — |
| Mọi dòng phiếu nhập cùng `itemId = job.itemId` | — | — | `E107` | — |
| Job có ≥1 OQC và không còn OQC nào chưa `COMPLETED` | — | — | `E196` | `E205` |
| Σ SL nhập (cộng dồn) ≤ `production_jobs.quantity` | — | — | `E197` | — |
| Phiếu DO còn `DRAFT` | — | — | — | `E204` |

## Flow

### Trigger từ production (`OqcService.getInspectableOperations`/`createOqc`)

1. `GET /oqc/inspectable-operations` — copy khuôn `OutsourcingOrdersService.getOutsourceableOperations`,
   khác: không lọc `type = OUTSOURCE`, mốc hiển thị là `completedQuantity` so `inspectedQuantity`
   (không phải SL gửi gia công).
2. `POST /oqc` — `ensureOperationExists` (load công đoạn + `productionJob`/`bomItem` qua relational
   query) → không thấy → `E091`. `job.status ≠ IN_PROGRESS` → `E175`. `bomItem.itemId = null` →
   `E199`.
3. `ensureLotSizeWithinPlannedNode` — Σ `quantity` mọi OQC (trừ `disposition = SCRAP`) của **mọi
   công đoạn as-used cùng node** (join qua `productionJobOperationId → productionJobBomItemId`),
   cộng lô mới, so với SL kế hoạch node (`resolvePlannedQuantities`) — vượt → `E176`.
4. `ensureWithinCompletedQuantity` — Σ `quantity` mọi OQC (trừ `SCRAP`) của **riêng công đoạn này**,
   cộng lô mới, so với `operation.completedQuantity` — vượt → `E198`.
5. Sinh mã `OQC-{năm}-{đếm trong năm + 1, pad 5}` nếu client không gửi `code`; check unique nếu có
   gửi.
6. 1 câu `INSERT`, không transaction (1 write) — `productionJobId`/`operationCode`/`operationName`/
   `partCode`/`partName`/`itemId` server tự set từ công đoạn + node BOM, `status: NOT_INSPECTED`.

### Xác nhận (`OqcService.confirmOqc`) — auto-suggest + rework/disposition

1. Load phiếu — không thấy → `E174`; `status = COMPLETED` → `E177` (khoá cứng — khác IQC, nơi chỉ
   `WAITING_RETURN` khoá).
2. `resolveAqlPlan(inspection.quantity, reqDto.inspectionLevel, reqDto.aqlLevel)` → nếu có, suy
   `resultAuto = resolveAqlResult(plan, reqDto.defectQty)` (`defectQty ≤ ac` → `PASS`).
3. `result = reqDto.result ?? resultAuto` — cả hai vắng → `E200`. `result` khác `resultAuto` mà
   thiếu `resultNote` → `E201`.
4. `result = PASS` mà vẫn gửi `disposition` → `E202`.
5. `resolveOqcStatus(result, disposition)`: `PASS → COMPLETED`; `FAIL` + không `disposition` →
   `PENDING`; `FAIL` + `ACCEPT`/`SCRAP` → `COMPLETED`; `FAIL` + `REWORK` → `REWORK` (phiếu **vẫn
   mở**).
6. 1 câu `UPDATE`, ghi đè toàn bộ (field vắng mặt = xoá). `confirmedBy`/`confirmedAt` chỉ ghi lần
   lưu đầu tiên; `resolvedBy`/`resolvedAt` chỉ ghi khi `disposition` mới xuất hiện lần đầu.
7. `PENDING`/`REWORK` → QC sửa mẫu/kết quả rồi gọi lại bước này trên **chính phiếu đó**, lặp tới
   khi `COMPLETED`. Không nhánh nào ghi ngược `production_job_operations.completedQuantity`.

### Nhập kho thành phẩm (`InventoryReceiptsService.confirmInventoryReceipt`, nhánh `PRODUCTION`)

1. Sau `ensureReceiptQuantitiesWithinOrdered` (nhánh PO, không áp dụng ở đây vì phiếu PRODUCTION
   không gắn PO), kiểm `receipt.receiptType = PRODUCTION`:
   - `productionJobId` không có → `E179`. Mọi `lineItems[].itemId` phải bằng `job.itemId` — lệch
     thì `E107`.
   - `clearance = getJobOqcClearance(tx, receipt.productionJobId)` — Job có ≥1 OQC và không còn OQC
     nào chưa `COMPLETED` — thiếu → `E196`.
   - `receivedSoFar` = tổng `quantity` mọi `inventory_receipt_items` thuộc phiếu `PRODUCTION` khác
     cùng `productionJobId`, `status ∈ {PENDING_IQC, PENDING_RECEIPT, POSTED}`, loại trừ chính
     phiếu này.
   - `receivedSoFar + thisReceiptQty > job.quantity` → `E197`.
2. Qua được gate thì tiếp tục như mọi phiếu nhập khác: `DRAFT → PENDING_RECEIPT`/`PENDING_IQC` tuỳ
   `requiresIqc` (`docs/workflows/receipt-confirmation.md`), rồi `post` sinh bút toán `PRODUCTION_IN`
   như thường — `post` **không** kiểm lại gate OQC lần hai.

### Xác nhận giao hàng (`OutboundOrdersService.confirmOutboundOrder`)

1. `lockOutboundOrder` (`FOR UPDATE`) — `status ≠ DRAFT` → `E204`.
2. Gom `productionJobId` distinct từ các dòng DO (bỏ qua dòng `null`) — mỗi Job gọi
   `getJobOqcClearance` (tái dùng nguyên hàm ở gate nhập kho TP) — Job nào chưa qua hết OQC → `E205`.
3. `UPDATE status = PENDING_DELIVERY`. **Không** trừ tồn, **không** sinh `inventory_issues`, **không**
   `DELIVERED` — đó là phase giao hàng 2, chưa thiết kế.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `oqc_inspections` | `POST /oqc` | *(chưa có)* | 1 dòng `NOT_INSPECTED` |
| `oqc_inspections.status` | `confirm` (PASS) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `COMPLETED` |
| `oqc_inspections.status` | `confirm` (FAIL, không disposition) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `PENDING` |
| `oqc_inspections.status` | `confirm` (FAIL + REWORK) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `REWORK` |
| `oqc_inspections.status` | `confirm` (FAIL + ACCEPT/SCRAP) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `COMPLETED` |
| `inventory_receipts.status` | `confirm` phiếu nhập (qua gate) | `DRAFT` | `PENDING_RECEIPT`/`PENDING_IQC` |
| `inventory_balances`/`inventory_transactions` | `post` phiếu nhập | — | cập nhật (`PRODUCTION_IN`, xem `docs/workflows/stock-movement.md`) |
| `outbound_orders.status` | `confirm` DO (qua gate) | `DRAFT` | `PENDING_DELIVERY` |

## Side effects

- `POST /oqc`: không side effect khác — 1 dòng mới, không đụng công đoạn/Job/kho.
- `confirm` OQC: không side effect khác — chỉ đổi `status`/kết quả của chính dòng đó, không ghi
  ngược vào `production_job_operations` ở bất kỳ nhánh nào (kể cả `SCRAP`).
- `confirm` phiếu nhập (nhánh PRODUCTION): không sinh/sửa gì trên `oqc_inspections` — gate chỉ
  **đọc**, một chiều.
- `confirm` DO: không sinh/sửa gì trên `oqc_inspections`/tồn kho — chỉ đổi `status` của chính DO.

## Transaction boundary

`createOqc`/`confirmOqc` đều 1 write, không mở transaction (Postgres tự atomic cho một câu lệnh).
`confirmInventoryReceipt` đã tự mở transaction sẵn (khuôn `docs/workflows/receipt-confirmation.md`)
— gate OQC chỉ thêm kiểm tra bên trong, không thêm transaction mới. `confirmOutboundOrder` tự mở
transaction (`lockOutboundOrder` + gate + `UPDATE`). Cả `getJobOqcClearance` lẫn các hàm đọc SL khác
ở `src/api/oqc/oqc.query.ts` đều là plain function nhận `Database | DbTransaction`, không tự mở
transaction, không qua DI — `InventoryReceiptsModule`/`OutboundOrdersModule`/`ProductionJobsModule`
đều không import `OqcModule`.

## Failure cases

`E091` (công đoạn không tồn tại), `E175` (Job không `IN_PROGRESS` lúc tạo OQC), `E199` (node BOM
mất `itemId`), `E176` (Σ SL cả node vượt kế hoạch), `E198` (Σ SL công đoạn vượt `completedQuantity`),
`E174` (phiếu OQC không tồn tại), `E177` (confirm lại khi đã `COMPLETED`), `E200` (không có
`result`/`resultAuto` để dùng), `E201` (ghi đè `resultAuto` thiếu lý do), `E202` (PASS mà vẫn gửi
`disposition`), `E178` (xoá phiếu OQC không còn `NOT_INSPECTED`), `E179` (phiếu nhập `PRODUCTION`
thiếu `productionJobId`), `E107` (dòng phiếu nhập không khớp `itemId` của Job), `E196` (Job chưa qua
hết OQC), `E197` (SL nhập vượt kế hoạch Job), `E204` (DO không còn `DRAFT`), `E205` (còn Job chưa
qua hết OQC lúc xác nhận DO).

## Business rules

- Vì sao `COMPLETED` khoá `confirm` cứng (khác IQC) → `docs/domains/quality.md`, mục OQC.
- Vì sao OQC gắn theo công đoạn thay vì Job → `docs/decisions/oqc-per-operation.md`.
- Vì sao thêm gate ở cả `inventory-issues` (IQC) lẫn `outbound-orders` (OQC), đảo quyết định cũ
  "không cần gate" → `docs/decisions/qc-gates-on-stock-moves.md`.
- "PO" hiển thị trên màn OQC là `orders.code`, tính lúc đọc qua join
  `production_jobs → production_orders → orders`, không lưu cột → `docs/domains/quality.md`.
- Bảng AQL (`SAMPLING_PLAN`) cần QC ký duyệt đối chiếu bảng giấy chính thức trước go-live →
  `docs/domains/quality.md`, mục "AQL auto-suggest".

## Related domains

`production` (nguồn công đoạn, đọc-một-chiều; nhận lại tóm tắt OQC hiển thị ở `GET .../bom`) →
`quality` (chủ luồng OQC) → `inventory` (đọc kết quả để gate cả nhập kho TP lẫn giao hàng). Production
vẫn không import `OqcModule` — chiều đọc-ngược chỉ qua plain function.

Bước trước: xưởng nhập `completedQuantity` cho công đoạn qua
`PATCH /production-jobs/:jobId/operations/:operationId`
(`docs/workflows/production-job-execution.md`). Bước sau: `post` phiếu nhập TP (sinh bút toán
`PRODUCTION_IN`, `docs/workflows/stock-movement.md`) hoặc DO tiếp tục sang phase giao hàng 2 (chưa
thiết kế).

Code: `OqcService` (`createOqc`/`confirmOqc`/`getInspectableOperations`/`getAqlPlan`/`deleteOqc`),
`src/api/oqc/oqc.query.ts`, `src/api/iqc/iqc-aql.constant.ts#resolveAqlPlan,resolveAqlResult`,
`InventoryReceiptsService.confirmInventoryReceipt` (nhánh `PRODUCTION`),
`OutboundOrdersService.confirmOutboundOrder`.
