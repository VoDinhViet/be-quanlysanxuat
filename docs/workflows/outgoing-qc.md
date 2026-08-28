# OQC — kiểm chất lượng công đoạn đến nhập kho / giao hàng

Chặng nối `production` → `quality-oqc` → `inventory`: từ lúc production "Yêu cầu QC" cho cả Job khi
mọi công đoạn đã hoàn thành, tới lúc QC xác nhận (auto-suggest từ AQL, cho ghi đè), tới lúc kho được
phép nhập lô thành phẩm và DO được phép gửi duyệt. Mô hình QC:
`docs/domains/quality-oqc.md`. Vòng đời DO đầy đủ: `docs/workflows/outbound-delivery.md`.

## Trigger

- `POST /production-jobs/:jobId/qc` — "Yêu cầu QC" cho cả Job, không nhận body.
- `GET /oqc/aql-plan` — gợi ý `sampleSize`/`ac`/`re` trước khi QC nhập `defectQty`.
- `POST /oqc/:oqcId/confirm` — QC lưu kết quả, gọi lại được nhiều lần tới khi `COMPLETED`.
- `DELETE /oqc/:oqcId` — gỡ phiếu tạo nhầm, chỉ khi `NOT_INSPECTED`.
- `POST /inventory-receipts/:receiptId/confirm` (`receiptType=PRODUCTION`) — đọc lại QC coverage
  của Job trước khi cho `confirm`.
- `POST /outbound-orders/:outboundOrderId/send` — đọc QC coverage của Job liên quan, gate duy nhất
  trong vòng duyệt DO (`docs/workflows/outbound-delivery.md`).

## Actor

`oqc:create` cho `POST /production-jobs/:jobId/qc`. `oqc:delete` cho `DELETE /oqc/:oqcId` (khác
`:create` — permission tách theo hành động, không theo actor). `oqc:read` cho AQL-plan/list/detail.
`oqc:update` cho `confirm`. `inventory:update` cho `confirm`/`post` phiếu nhập. `outbound:update`
cho `send` DO.

## Preconditions

| Điều kiện | `POST .../qc` | `confirm` OQC | `confirm` phiếu nhập (PRODUCTION) | `send` DO |
| --- | --- | --- | --- | --- |
| Job tồn tại | `E082` | — | — | — |
| Job đang `IN_PROGRESS` hoặc `WAITING_QC` | `E175` | — | — | — |
| Job có node Cấp 0 hợp lệ (`itemType='FG'`, có công đoạn `type ≠ OUTSOURCE`) | `E213` | — | — | — |
| Mọi công đoạn `INHOUSE` của node Cấp 0 đã `completedDate` | `E214` | — | — | — |
| Node BOM (Cấp 0) còn `itemId` | `E199` | — | — | — |
| Σ SL đã xin QC của cả node + lô mới ≤ SL kế hoạch node | `E176` | — | — | — |
| Σ SL đã xin QC riêng công đoạn Cấp 0 phải bằng 0 | `E198` | — | — | — |
| Phiếu OQC tồn tại, đang lưu được (`status ≠ COMPLETED`) | — | `E174`/`E177` | — | — |
| Có `result` hoặc `resultAuto` để dùng | — | `E200` | — | — |
| `productionJobId` có trên phiếu nhập | — | — | `E179` | — |
| Mọi dòng phiếu nhập cùng `itemId = job.itemId` | — | — | `E107` | — |
| Job có ≥1 dòng QC chưa `SCRAP`, không còn dòng nào chưa `COMPLETED` | — | — | `E196` | `E205` |
| Có node Cấp 0 thì phải có ≥1 dòng OQC `COMPLETED` chưa `SCRAP` | — | — | `E209` | — |
| Σ SL nhập (cộng dồn) ≤ `production_jobs.quantity` | — | — | `E197` | — |

## Flow

### Trigger từ production (`OqcService.createOqcForJob`)

1. Một câu `SELECT` — `productionJobs` LEFT JOIN `productionJobBomItems` (lọc `itemType='FG'`)
   LEFT JOIN `productionJobOperations` (lọc `type ≠ OUTSOURCE`), sắp `sortOrder DESC LIMIT 1`. Hai
   `LEFT JOIN` để phân biệt "Job không tồn tại" khỏi "Job tồn tại nhưng thiếu node/công đoạn".
2. Không có dòng → `E082`. `jobStatus ∉ {IN_PROGRESS, WAITING_QC}` → `E175`. `operationId=null` →
   `E213`.
3. **`completedDate` của công đoạn `sortOrder` cao nhất không đại diện được cho cả node** — node
   Cấp 0 có thể nhiều công đoạn (`copyFinalAssemblyRouting`). Readiness chạy một `COUNT` **riêng**:
   còn công đoạn `INHOUSE` nào của node Cấp 0 chưa `completedDate` → `E214`. `itemId=null`
   (node mất snapshot) → `E199`.
4. Hai câu tính SL đã xin QC song song: Σ `quantity` mọi OQC (trừ `SCRAP`) của mọi công đoạn
   as-used cùng node so `plannedQuantity` — vượt → `E176`. Σ tương tự riêng công đoạn Cấp 0 phải
   bằng 0 (lô luôn lấy trọn `completedQuantity`) → `E198`.
5. Trong 1 transaction: cấp mã `OQC-{năm}-{5}` qua `document_sequences` + `INSERT` — `quantity =
   completedQuantity` công đoạn Cấp 0, `inspectionDate = new Date()`, `status: NOT_INSPECTED`.

### Xác nhận (`OqcService.confirmOqc`)

1. Load phiếu — không thấy → `E174`; `status=COMPLETED` → `E177` (khoá cứng, khác IQC).
2. `resolveAqlPlan(quantity, inspectionLevel, aqlLevel)` → nếu có, suy `resultAuto`. **`sampleSize`
   không được server tự điền từ plan** — chỉ ghi khi client gửi.
3. `result = reqDto.result ?? resultAuto` — cả hai vắng → `E200`. QC toàn quyền quyết định
   `result`/`disposition`, không validate chéo (`E201`/`E202`/`E215` đã nghỉ hưu).
4. `resolveOqcStatus`: `PASS→COMPLETED`; `FAIL`+không disposition→`PENDING`; `FAIL`+`ACCEPT`/
   `SCRAP`→`COMPLETED`; `FAIL`+`REWORK`→`REWORK` (vẫn mở).
5. Trong 1 transaction: khoá `qc_requests` (`FOR UPDATE`), tính `attemptNo`, insert 1 dòng
   `qc_inspections` (attempt) rồi cập nhật `qc_requests` (mirror). `linkFiles` chạy **ngoài**
   transaction trước đó (stamp `linkedAt`, `E042`), `linkOqcEvidence` insert `qc_files` trong tx.
6. `PENDING`/`REWORK` → QC gọi lại chính phiếu tới khi `COMPLETED`. Không nhánh nào ghi ngược
   `completedQuantity`.
7. Sau khi ghi mirror, nếu vào `COMPLETED`, gọi `closeJobIfQcCovered` (`total>0 && open=0`) →
   `production_jobs.status: {IN_PROGRESS, WAITING_QC} → WAITING_DELIVERY` (ghi thẳng, không qua
   `ProductionJobsService`). Cùng hàm này được gọi từ `confirmIqc`/`completeIqcAfterSupplierReturn`
   — xem `docs/domains/quality-iqc.md`.

### Nhập kho thành phẩm (`InventoryReceiptsService.confirmInventoryReceipt`, nhánh `PRODUCTION`)

1. `productionJobId` không có → `E179`. Dòng phiếu lệch `itemId` → `E107`.
2. `getJobQcCoverage(tx, productionJobId)` — Job ≥1 dòng QC chưa `SCRAP`, không còn dòng nào chưa
   `COMPLETED` → thiếu thì `E196`. Có node Cấp 0 mà chưa OQC `COMPLETED` chưa `SCRAP` nào → `E209`.
3. `receivedSoFar` (mọi phiếu `PRODUCTION` khác cùng Job, `confirm`'d) + SL phiếu này > `job.quantity`
   → `E197`.
4. Qua gate thì tiếp tục như mọi phiếu nhập khác (`docs/workflows/receipt-confirmation.md`); `post`
   **không** kiểm lại gate OQC.
5. `post`: tính lại tổng đã nhận, `≥ job.quantity` → `production_jobs.status: WAITING_DELIVERY →
   COMPLETED`; mọi Job cùng LSX `COMPLETED` → `production_orders.status → COMPLETED`
   (`docs/decisions/production-lifecycle-closing.md`).

### Gửi duyệt DO (`OutboundOrdersService.sendOutboundOrder`)

Gom `productionJobId` distinct từ dòng DO, mỗi Job gọi `getJobQcCoverage` — chưa qua hết QC → `E205`.
Chi tiết đầy đủ route `send`/`approve`/`reject`/`deliver`: `docs/workflows/outbound-delivery.md`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `qc_requests` (`kind=OUTGOING`) | `POST /production-jobs/:jobId/qc` | *(chưa có)* | 1 dòng `NOT_INSPECTED` |
| `qc_requests.status` | `confirm` (PASS/ACCEPT/SCRAP) | — | `COMPLETED` |
| `qc_requests.status` | `confirm` (FAIL, không disposition) | — | `PENDING` |
| `qc_requests.status` | `confirm` (FAIL+REWORK) | — | `REWORK` |
| `qc_inspections` | `confirm` (mọi kết quả) | — | +1 attempt mới |
| `production_jobs.status` | `confirm` OQC (coverage hết `open`) | `IN_PROGRESS`/`WAITING_QC` | `WAITING_DELIVERY` |
| `production_jobs.status` | `post` phiếu nhập TP (đủ SL) | `WAITING_DELIVERY` | `COMPLETED` |
| `production_orders.status` | `post` phiếu nhập TP (mọi Job xong) | `APPROVED` | `COMPLETED` |

## Side effects

`POST .../qc`: chỉ 1 dòng mới, không đụng công đoạn/Job/kho. `confirm` OQC: đổi status/kết quả +
`qc_files` (evidence), không ghi ngược `production_job_operations`. `confirm` phiếu nhập: gate chỉ
đọc, một chiều.

## Transaction boundary

`createOqcForJob`/`confirmOqc` mỗi cái mở 1 transaction riêng. `confirmInventoryReceipt` tự mở
transaction sẵn — gate QC chỉ thêm kiểm tra bên trong. `getJobQcCoverage`/`closeJobIfQcCovered`
là plain function nhận `Database | DbTransaction`, không qua DI —
`InventoryReceiptsModule`/`OutboundOrdersModule` không import `OqcModule`/`IqcModule`. Riêng
`ProductionJobsModule` **có** import `OqcModule` — ngoại lệ duy nhất, chỉ để `requestJobQc` gọi
thẳng `createOqcForJob`.

## Failure cases

`E082`, `E175` (Job không `IN_PROGRESS`/`WAITING_QC`), `E213`, `E214` (đếm lại mọi công đoạn Cấp 0),
`E199`, `E176`, `E198`, `E174`, `E177`, `E200`, `E178` (xoá phiếu không `NOT_INSPECTED`),
`E179`, `E107`, `E196`, `E209`, `E197`, `E205` (gate duy nhất ở `send` DO). `E201`/`E202`/`E211`/
`E212`/`E215` đã nghỉ hưu.

## Business rules

- Vì sao `COMPLETED` khoá `confirm` cứng (khác IQC) → `docs/domains/quality-oqc.md`.
- Vì sao OQC gắn theo công đoạn thay vì Job → `docs/decisions/oqc-per-operation.md`.
- Vì sao có gate ở cả `inventory-issues`/`inventory-receipts`/`outbound-orders` →
  `docs/decisions/qc-gates-on-stock-moves.md`.

## Related domains

`production` (nguồn công đoạn, có 1 cạnh ghi ngược qua `closeJobIfQcCovered`) → `quality-oqc` (chủ
luồng) → `inventory` (đọc để gate nhập kho TP + gửi duyệt DO). Bước trước: xưởng báo
`completedQuantity` (`docs/workflows/production-job-execution.md`). Bước sau: `post` phiếu nhập TP
(`docs/workflows/stock-movement.md`) hoặc DO tiếp tục qua `approve`/`deliver`
(`docs/workflows/outbound-delivery.md`).

Code: `OqcService`, `ProductionJobsService.requestJobQc`, `src/api/oqc/oqc.query.ts`
(`getJobQcCoverage`/`closeJobIfQcCovered`), `src/api/iqc/iqc-aql.query.ts#resolveAqlPlan`,
`InventoryReceiptsService.confirmInventoryReceipt` (nhánh `PRODUCTION`),
`OutboundOrdersService.sendOutboundOrder`.
