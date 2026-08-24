# OQC — kiểm chất lượng công đoạn đến nhập kho / giao hàng

Chặng nối `production` → `quality` → `inventory`: từ lúc production "Yêu cầu QC" cho **cả Job** khi
mọi công đoạn đã hoàn thành, tới lúc QC xác nhận PASS (auto-suggest từ AQL, cho ghi đè), tới lúc kho
được phép nhập lô thành phẩm và DO được phép xác nhận giao. Mô hình `production_job_operations` ở
`docs/domains/production.md`, mô hình QC (bảng gộp `qc_requests`, `kind = OUTGOING` cho OQC — mỗi
lần `confirm` sinh thêm 1 dòng `qc_inspections` (lần kiểm), `qc_requests` là mirror hiện hành, xem
`docs/decisions/qc-request-attempt-split.md`) ở `docs/domains/quality.md`, 2 gate cross-domain ở
`docs/domains/inventory.md`; đây là trình tự đầy đủ nối các domain đó. OQC lưu theo **công đoạn**
(không phải Job) — xem `docs/decisions/oqc-per-operation.md` cho bối cảnh/lý do; IQC/OQC gộp một
bảng — xem `docs/decisions/qc-single-table.md`. Trigger tạo OQC ở **cấp Job** (không phải cấp công
đoạn) — route tự resolve công đoạn Cấp 0 (lắp ráp/thành phẩm) của Job để gắn dòng OQC vào, xem
"Trigger" bên dưới.

## Trigger

- `POST /production-jobs/:jobId/qc` — production "Yêu cầu QC" cho cả Job, **không nhận body**: 1 cú
  bấm. Chỉ chạy được khi mọi công đoạn của Job đã `completedDate` và Job có node Cấp 0 — server tự
  resolve công đoạn Cấp 0, tự suy `quantity` (= `completedQuantity` của công đoạn đó) và
  `inspectionDate` (= thời điểm bấm).
- `GET /oqc/aql-plan` — FE gọi để gợi ý `sampleSize`/`ac`/`re` trước khi QC nhập `defectQty`.
- `POST /oqc/:oqcId/confirm` — QC lưu kết quả kiểm, gọi lại được nhiều lần trên cùng phiếu tới khi
  `PASS` hoặc `disposition ∈ {ACCEPT, SCRAP}` (hai giá trị này bắt buộc kèm `dispositionNote`).
- `DELETE /oqc/:oqcId` — gỡ phiếu tạo nhầm, chỉ khi còn `NOT_INSPECTED`.
- `POST /inventory-receipts/:receiptId/confirm` với `receiptType = PRODUCTION` — kho xác nhận nhập
  lô thành phẩm, đọc lại trạng thái OQC của Job.
- `POST /outbound-orders/:outboundOrderId/send` — Sales gửi duyệt DO (`DRAFT`/`REJECTED` →
  `PENDING_APPROVAL`), đọc trạng thái OQC của (các) Job liên quan — gate duy nhất trong cả vòng
  duyệt.
- `POST /outbound-orders/:outboundOrderId/approve` — Giám đốc duyệt DO (`PENDING_APPROVAL →
  PENDING_DELIVERY`), không gate OQC lại.
- `POST /outbound-orders/:outboundOrderId/reject` — Giám đốc từ chối DO (`PENDING_APPROVAL →
  REJECTED`), không gate OQC.
- `POST /outbound-orders/:outboundOrderId/deliver` — Sales/kho xác nhận đã giao thật
  (`PENDING_DELIVERY → DELIVERED`), tự sinh + post phiếu xuất SALES, đóng đơn hàng nếu giao đủ.

## Actor

`oqc:create` cho `POST /production-jobs/:jobId/qc` + `DELETE /oqc/:oqcId` (production — cùng vai trò
"yêu cầu QC" và "gỡ yêu cầu sai"; permission đặt tên theo `oqc` dù route tạo nay mount ở
`production-jobs`, vì đã seed sẵn cho đúng role production). `oqc:read` cho AQL-plan/list/detail.
`oqc:update` cho `confirm` (QC — vai trò khác, tách actor tạo/xác nhận). `inventory:update` cho
`confirm`/`post` phiếu nhập. `outbound:update` cho `send`/`deliver` DO (Sales/Kho); `outbound:approve`
cho `approve`/`reject` DO (Giám đốc).

## Preconditions

| Điều kiện | `POST .../qc` | `confirm` OQC | `confirm` phiếu nhập (PRODUCTION) | `send` DO |
| --- | --- | --- | --- | --- |
| Job tồn tại | `E082` | — | — | — |
| Job đang `IN_PROGRESS` | `E175` | — | — | — |
| Job có node Cấp 0 hợp lệ (`itemType='FG'`, có công đoạn `type ≠ OUTSOURCE`) | `E213` | — | — | — |
| Công đoạn Cấp 0 đã `completedDate` (tương đương "mọi công đoạn của Job đã xong", nhờ `E210`) | `E214` | — | — | — |
| Node BOM (Cấp 0) còn `itemId` | `E199` | — | — | — |
| Σ SL đã xin QC của cả node (mọi công đoạn as-used) + lô mới ≤ SL kế hoạch node | `E176` | — | — | — |
| Σ SL đã xin QC của riêng công đoạn Cấp 0 phải bằng 0 (lô luôn là toàn bộ, không phần) | `E198` | — | — | — |
| Phiếu OQC tồn tại, đang lưu được (`status ≠ COMPLETED`) | — | `E174`/`E177` | — | — |
| Có `result` hoặc `resultAuto` để dùng | — | `E200` | — | — |
| `productionJobId` có trên phiếu nhập | — | — | `E179` | — |
| Mọi dòng phiếu nhập cùng `itemId = job.itemId` | — | — | `E107` | — |
| Job có ≥1 dòng QC chưa `SCRAP`, không còn dòng nào chưa `COMPLETED` | — | — | `E196` | `E205` |
| Có node Cấp 0 (`itemType = FG`) thì phải có ≥1 dòng OQC `COMPLETED` chưa `SCRAP` | — | — | `E209` | — |
| Σ SL nhập (cộng dồn) ≤ `production_jobs.quantity` | — | — | `E197` | — |
| Phiếu DO còn `DRAFT`/`REJECTED` | — | — | — | `E239` |

`approve`/`reject` không có cột riêng ở trên — điều kiện duy nhất của cả hai là phiếu đang
`PENDING_APPROVAL` (`E240`), không gate OQC.

## Flow

### Trigger từ production (`OqcService.createOqcForJob`)

`POST /production-jobs/:jobId/qc` — **không nhận body**, 1 cú bấm. Toàn bộ gói trong một hàm:

1. Một câu `SELECT` duy nhất — `productionJobs` LEFT JOIN `productionJobBomItems` (lọc
   `itemType='FG'`) LEFT JOIN `productionJobOperations` (lọc `type ≠ OUTSOURCE`), sắp `sortOrder
   DESC LIMIT 1`. Hai `LEFT JOIN` (không phải `INNER`) để phân biệt đúng "Job không tồn tại" (0
   dòng) khỏi "Job tồn tại nhưng thiếu node/công đoạn hợp lệ" (1 dòng, cột join = null).
2. Không có dòng nào → `E082`. `jobStatus ≠ IN_PROGRESS` → `E175`. `operationId = null` (không có
   node Cấp 0 hợp lệ) → `E213`. `completedDate = null` → `E214` — nhờ `E210` đã đảm bảo công đoạn
   Cấp 0 không thể `completedDate` trừ khi mọi công đoạn khác của Job xong trước, kiểm đúng công
   đoạn này tương đương kiểm cả Job. `itemId = null` (node mất snapshot) → `E199`.
3. Hai câu tính SL đã xin QC chạy song song (`Promise.all`): Σ `quantity` mọi OQC (trừ
   `disposition = SCRAP`) của **mọi công đoạn as-used cùng node** (join qua
   `productionJobOperationId → productionJobBomItemId`) so `plannedQuantity` (đã đóng băng lúc
   duyệt LSX) của node — vượt → `E176`. Σ tương tự của **riêng công đoạn Cấp 0** phải bằng 0 — do lô
   kiểm luôn lấy trọn `completedQuantity` (không phải một phần), có dòng nào trước đó nghĩa là xin
   lại lần hai — chặn bằng `E198`.
4. Trong **một** transaction: cấp mã `OQC-{năm}-{số thứ tự trong năm, pad 5}` qua
   `document_sequences` (`docs/architecture.md`, mục "Bất biến xuyên module") + 1 câu `INSERT` —
   `quantity` = `completedQuantity` của công đoạn Cấp 0, `inspectionDate = new Date()` (thời điểm
   bấm), `note = null`, `productionJobId`/`productionJobOperationId`/`itemId` server tự set từ kết
   quả bước 1, `status: NOT_INSPECTED`. Không có cột snapshot nào khác để ghi —
   `operationCode`/`operationName`/`bomItem.code`/`bomItem.name` đọc lại qua relation lúc `GET`.

### Xác nhận (`OqcService.confirmOqc`) — auto-suggest + rework/disposition

1. Load phiếu — không thấy → `E174`; `status = COMPLETED` → `E177` (khoá cứng — khác IQC, nơi chỉ
   `WAITING_RETURN` khoá).
2. `resolveAqlPlan(inspection.quantity, reqDto.inspectionLevel, reqDto.aqlLevel)` → nếu có, suy
   `resultAuto = resolveAqlResult(plan, reqDto.defectQty)` (`defectQty ≤ ac` → `PASS`).
3. `result = reqDto.result ?? resultAuto` — cả hai vắng → `E200`. Ngoài đó, QC toàn quyền quyết định
   `result`/`disposition` — không còn validate chéo (`result` khác `resultAuto` không cần
   `resultNote`; `result = PASS` gửi kèm `disposition` không báo lỗi, server tự bỏ `disposition`/
   `dispositionNote` về `NULL`; `disposition ∈ {ACCEPT, SCRAP}` không bắt buộc `dispositionNote` —
   `E201`/`E202`/`E215` đã nghỉ hưu, `docs/domains/quality.md`).
4. `resolveOqcStatus(result, disposition)`: `PASS → COMPLETED`; `FAIL` + không `disposition` →
   `PENDING`; `FAIL` + `ACCEPT`/`SCRAP` → `COMPLETED`; `FAIL` + `REWORK` → `REWORK` (phiếu **vẫn
   mở**).
5. Trong 1 transaction: khoá `qc_requests` (`FOR UPDATE`), tính `attemptNo` kế tiếp, **insert 1 dòng
   `qc_inspections`** (attempt, field vắng mặt = không có giá trị ở attempt này) rồi cập nhật
   `qc_requests` làm mirror (`docs/decisions/qc-request-attempt-split.md`). `confirmedBy`/
   `confirmedAt` trên mirror chỉ ghi lần lưu đầu tiên; `resolvedBy`/`resolvedAt` chỉ ghi khi
   `disposition` mới xuất hiện lần đầu — lần kiểm trước đó vẫn còn nguyên trên `qc_inspections`.
6. `PENDING`/`REWORK` → QC sửa mẫu/kết quả rồi gọi lại bước này trên **chính phiếu đó**, lặp tới
   khi `COMPLETED`. Không nhánh nào ghi ngược `production_job_operations.completedQuantity`.
7. Bước này (2026-08-24): sau khi ghi mirror, nếu `status = COMPLETED` gọi lại `getJobQcCoverage` —
   `open = 0` thì `productionJobs.status: WAITING_QC → WAITING_DELIVERY` (ghi thẳng, không qua
   `ProductionJobsService` để tránh vòng import). Xem
   `docs/decisions/production-lifecycle-closing.md`.

### Nhập kho thành phẩm (`InventoryReceiptsService.confirmInventoryReceipt`, nhánh `PRODUCTION`)

1. Sau `ensureReceiptQuantitiesWithinOrdered` (nhánh PO, không áp dụng ở đây vì phiếu PRODUCTION
   không gắn PO), kiểm `inventoryReceipt.receiptType = PRODUCTION`:
   - `productionJobId` không có → `E179`. Mọi dòng phiếu phải có `itemId` bằng `job.itemId` — lệch
     thì `E107`.
   - `coverage = getJobQcCoverage(tx, inventoryReceipt.productionJobId)` (đọc bảng gộp `qc_requests`,
     phủ cả OQC công đoạn `INHOUSE` lẫn IQC công đoạn `OUTSOURCE`, `docs/decisions/
     qc-single-table.md`) — Job có ≥1 dòng QC **chưa `SCRAP`** và không còn dòng nào chưa `COMPLETED`
     — thiếu → `E196`. Có node Cấp 0 mà chưa có dòng OQC `COMPLETED` **chưa `SCRAP`** nào → `E209`.
     Một dòng SCRAP không được tính là "đã QC xong" ở cả hai điều kiện — hàng đã loại bỏ không được
     lọt gate chỉ vì phiếu QC của nó khoá ở `COMPLETED` (`docs/domains/quality.md`, mục OQC).
   - `receivedSoFar` = tổng `quantity` mọi `inventory_receipt_items` thuộc phiếu `PRODUCTION` khác
     cùng `productionJobId`, `status ∈ {PENDING_IQC, PENDING_RECEIPT, POSTED}`, loại trừ chính
     phiếu này.
   - `receivedSoFar + thisReceiptQty > job.quantity` → `E197`.
2. Qua được gate thì tiếp tục như mọi phiếu nhập khác: `DRAFT → PENDING_RECEIPT`/`PENDING_IQC` tuỳ
   `requiresIqc` (`docs/workflows/receipt-confirmation.md`), rồi `post` sinh bút toán `PRODUCTION_IN`
   như thường — `post` **không** kiểm lại gate OQC lần hai.
3. `post` (2026-08-24): sau bút toán, tính lại tổng đã nhận (`getConfirmedProductionQuantityByJobId`,
   không loại trừ phiếu nào — phiếu đang post đã tính vào tổng) — `>= job.quantity` thì
   `productionJobs.status: WAITING_DELIVERY → COMPLETED` (+ `completedBy`/`completedAt`). Mọi Job
   cùng LSX đều `COMPLETED` → `productionOrders.status → COMPLETED`, ghi 1 dòng
   `production_order_logs` (`action = COMPLETED`). Xem
   `docs/decisions/production-lifecycle-closing.md`.

### Gửi duyệt (`OutboundOrdersService.sendOutboundOrder`)

1. `getOutboundOrderForUpdate` (`FOR UPDATE`) — `status ∉ {DRAFT, REJECTED}` → `E239`.
2. `ensureAllJobsQcCompleted`: gom `productionJobId` distinct từ các dòng DO (bỏ qua dòng `null`) —
   mỗi Job gọi `getJobQcCoverage` (tái dùng nguyên hàm ở gate nhập kho TP, cùng cách loại `SCRAP`
   khỏi `total`) — Job nào chưa qua hết QC → `E205`.
3. `UPDATE status = PENDING_APPROVAL`, ghi `sentBy`/`sentAt`.

### Duyệt (`OutboundOrdersService.approveOutboundOrder`)

1. `getOutboundOrderForUpdate` (`FOR UPDATE`) — `status ≠ PENDING_APPROVAL` → `E240`.
2. `UPDATE status = PENDING_DELIVERY`, ghi `approvedBy`/`approvedAt`. Không gate OQC lại (đã chặn ở
   `send`). Chưa trừ tồn, chưa sinh `inventory_issues` — bước đó ở `deliver` bên dưới.

### Từ chối (`OutboundOrdersService.rejectOutboundOrder`)

1. `getOutboundOrderForUpdate` (`FOR UPDATE`) — `status ≠ PENDING_APPROVAL` → `E240`.
2. `UPDATE status = REJECTED`, ghi `rejectedBy`/`rejectedAt`/`rejectionReason`. Không gate QC — chỉ
   đổi trạng thái. `send` lại được từ `REJECTED`.

### Giao thật (`OutboundOrdersService.postOutboundOrder`, 2026-08-24)

1. `getOutboundOrderForUpdate` (`FOR UPDATE`) — `status ≠ PENDING_DELIVERY` → `E237`.
2. Tự tìm kho `type = FG` — khác đúng 1 kho → `E238` (thực tế hiện chỉ có `KHO-TP`).
3. Trong **một** transaction: sinh mã `PXK-{năm}-{số thứ tự, pad 5}`, `INSERT` 1 `inventory_issues`
   (`issueType = SALES`, `status = POSTED` thẳng) + `inventory_issue_items` map 1:1 từ dòng DO (gắn
   đúng `orderItemId`), gọi `InventoryPostingService.postDocument` trừ tồn, `UPDATE outboundOrders
   SET status = DELIVERED`.
4. Với mỗi đơn hàng bị đụng (theo `orderItemId` các dòng vừa xử lý): mọi dòng `order_items`
   `NORMAL` đã `issuedQty ≥ quantity` (tính lại trong cùng transaction) → `orders.status:
   IN_PROGRESS → COMPLETED`. Xem `docs/decisions/production-lifecycle-closing.md`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `qc_requests` (`kind = OUTGOING`) | `POST /production-jobs/:jobId/qc` | *(chưa có)* | 1 dòng `NOT_INSPECTED` |
| `qc_requests.status` | `confirm` (PASS) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `COMPLETED` |
| `qc_requests.status` | `confirm` (FAIL, không disposition) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `PENDING` |
| `qc_requests.status` | `confirm` (FAIL + REWORK) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `REWORK` |
| `qc_requests.status` | `confirm` (FAIL + ACCEPT/SCRAP) | `NOT_INSPECTED`/`PENDING`/`REWORK` | `COMPLETED` |
| `qc_inspections` | `confirm` (mọi kết quả) | — | +1 dòng attempt mới, `attemptNo` kế tiếp — không xoá/sửa attempt trước |
| `inventory_receipts.status` | `confirm` phiếu nhập (qua gate) | `DRAFT` | `PENDING_RECEIPT`/`PENDING_IQC` |
| `inventory_balances`/`inventory_transactions` | `post` phiếu nhập | — | cập nhật (`PRODUCTION_IN`, xem `docs/workflows/stock-movement.md`) |
| `production_jobs.status` | `confirm` OQC (PASS/ACCEPT/SCRAP, coverage hết `open`) | `WAITING_QC` | `WAITING_DELIVERY` |
| `production_jobs.status` | `post` phiếu nhập TP (đủ `job.quantity`) | `WAITING_DELIVERY` | `COMPLETED` |
| `production_orders.status` | `post` phiếu nhập TP (mọi Job cùng LSX `COMPLETED`) | `APPROVED` | `COMPLETED` |
| `outbound_orders.status` | `send` DO (qua gate) | `DRAFT`/`REJECTED` | `PENDING_APPROVAL` |
| `outbound_orders.status` | `approve` DO (qua gate) | `PENDING_APPROVAL` | `PENDING_DELIVERY` |
| `outbound_orders.status` | `reject` DO | `PENDING_APPROVAL` | `REJECTED` |
| `outbound_orders.status` | `deliver` DO | `PENDING_DELIVERY` | `DELIVERED` |
| `inventory_balances`/`inventory_transactions` | `deliver` DO | — | cập nhật (`ISSUE`, phiếu SALES tự sinh) |
| `orders.status` | `deliver` DO (mọi dòng `NORMAL` đã giao đủ) | `IN_PROGRESS` | `COMPLETED` |

## Side effects

- `POST /production-jobs/:jobId/qc`: không side effect khác — 1 dòng mới, không đụng công đoạn/Job/kho.
- `confirm` OQC: không side effect khác — chỉ đổi `status`/kết quả của chính dòng đó, không ghi
  ngược vào `production_job_operations` ở bất kỳ nhánh nào (kể cả `SCRAP`).
- `confirm` phiếu nhập (nhánh PRODUCTION): không sinh/sửa gì trên `qc_requests` — gate chỉ
  **đọc**, một chiều.
- `send`/`approve`/`reject` DO: không sinh/sửa gì trên `qc_requests`/tồn kho — chỉ đổi `status`
  (+ audit trail) của chính DO.

## Transaction boundary

`createOqcForJob` mở transaction chỉ để gói cấp mã + `INSERT` (`document_sequences`); `confirmOqc`
nay cũng mở transaction — khoá `qc_requests` (`FOR UPDATE`) để cấp `attemptNo` tuần tự, insert
attempt (`qc_inspections`), rồi cập nhật mirror trên `qc_requests`, tất cả trong 1 transaction
(`docs/decisions/qc-request-attempt-split.md`).
`confirmInventoryReceipt` đã tự mở transaction sẵn (khuôn `docs/workflows/receipt-confirmation.md`)
— gate QC chỉ thêm kiểm tra bên trong, không thêm transaction mới. `sendOutboundOrder`/
`approveOutboundOrder`/`rejectOutboundOrder` đều tự mở transaction riêng (`getOutboundOrderForUpdate`
+ gate QC ở hai hàm đầu + `UPDATE`). `getJobQcCoverage` lẫn các hàm đọc SL khác ở
`src/api/oqc/oqc.query.ts` đều là plain function nhận `Database | DbTransaction`, không tự mở
transaction, không qua DI — `InventoryReceiptsModule`/`OutboundOrdersModule` đều không import
`OqcModule`/`IqcModule` (chiều đọc). Riêng `ProductionJobsModule` **có** import `OqcModule` — ngoại
lệ duy nhất, có chủ đích, chỉ để `ProductionJobsService.requestJobQc` gọi thẳng
`OqcService.createOqcForJob` qua DI (chiều ghi, không phải đọc).

## Failure cases

`E082` (Job không tồn tại), `E175` (Job không `IN_PROGRESS` lúc tạo OQC), `E213` (Job không có node
Cấp 0 hợp lệ), `E214` (công đoạn Cấp 0 chưa `completedDate`), `E199` (node BOM mất `itemId`), `E176`
(Σ SL cả node vượt kế hoạch), `E198` (đã có dòng QC trước đó cho công đoạn Cấp 0 — xin lại lần hai),
`E174` (phiếu OQC không tồn tại), `E177` (confirm lại khi đã `COMPLETED`), `E200` (không có
`result`/`resultAuto` để dùng — `E201`/`E202`/`E215` từng chặn ghi đè/PASS+disposition/thiếu lý do
đã nghỉ hưu, QC toàn quyền quyết định, `docs/domains/quality.md`), `E178` (xoá phiếu
OQC không còn `NOT_INSPECTED`), `E179` (phiếu nhập `PRODUCTION`
thiếu `productionJobId`), `E107` (dòng phiếu nhập không khớp `itemId` của Job), `E196` (Job chưa qua
hết QC), `E209` (node Cấp 0 chưa qua QC), `E197` (SL nhập vượt kế hoạch Job), `E239` (DO không còn
`DRAFT`/`REJECTED` lúc `send`), `E240` (DO không còn `PENDING_APPROVAL` lúc `approve`/`reject`),
`E205` (còn Job chưa qua hết QC lúc `send` DO — gate duy nhất, `approve` không kiểm lại). `E211`
(từng chặn công đoạn `OUTSOURCE`
ở tầng service) nay khai tử — điều kiện đó nằm ngay trong câu `SELECT` của `createOqcForJob` (không
match join thì rơi vào `E213`), không còn chỗ nào ném ra mã đó nữa. `E212` (Job có công đoạn
`OUTSOURCE` chưa có IQC) chưa từng phát hành, nay khai tử — tập con của `E196` sau khi
`getJobQcCoverage` gộp cả hai nhánh, xem `docs/decisions/qc-single-table.md`.

## Business rules

- Vì sao `COMPLETED` khoá `confirm` cứng (khác IQC) → `docs/domains/quality.md`, mục OQC.
- Vì sao OQC gắn theo công đoạn thay vì Job → `docs/decisions/oqc-per-operation.md`.
- Vì sao thêm gate ở cả `inventory-issues` (IQC) lẫn `outbound-orders` (OQC), đảo quyết định cũ
  "không cần gate" → `docs/decisions/qc-gates-on-stock-moves.md`.
- Vì sao IQC/OQC gộp một bảng `qc_requests`, vì sao node Cấp 0 tái dùng
  `production_job_bom_items` thay vì bảng riêng → `docs/decisions/qc-single-table.md`,
  `docs/decisions/oqc-per-operation.md` mục "QC cho Cấp 0".
- "PO" hiển thị trên màn OQC là `orders.code`, tính lúc đọc qua join
  `production_jobs → production_orders → orders`, không lưu cột → `docs/domains/quality.md`.
- Bảng AQL (`SAMPLING_PLAN`) cần QC ký duyệt đối chiếu bảng giấy chính thức trước go-live →
  `docs/domains/quality.md`, mục "AQL auto-suggest".

## Related domains

`production` (nguồn công đoạn; nay có 1 cạnh ghi sang `quality` — xem dưới) → `quality` (chủ luồng
OQC) → `inventory` (đọc kết quả để gate cả nhập kho TP lẫn giao hàng). Chiều **đọc** vẫn một chiều
như cũ — Production không đọc ngược dữ liệu OQC để hiển thị. Chiều **ghi** thì khác:
`ProductionJobsModule` nay import `OqcModule`, `ProductionJobsController.requestJobQc` →
`ProductionJobsService.requestJobQc` → `OqcService.createOqcForJob` qua DI — ngoại lệ duy nhất, có
chủ đích, thay cho route `POST /oqc` cấp-công-đoạn độc lập đã bỏ.

Bước trước: xưởng nhập `completedQuantity` cho công đoạn qua
`PATCH /production-jobs/:jobId/operations/:operationId`
(`docs/workflows/production-job-execution.md`). Bước sau: `post` phiếu nhập TP (sinh bút toán
`PRODUCTION_IN`, `docs/workflows/stock-movement.md`) hoặc DO tiếp tục qua `approve` rồi `deliver`
(trừ tồn thật).

Code: `OqcService` (`createOqcForJob`/`confirmOqc`/`getAqlPlan`/`deleteOqc`),
`ProductionJobsService.requestJobQc` (`src/api/production-jobs/production-jobs.service.ts`),
`src/api/oqc/oqc.query.ts` (bao gồm `getJobQcCoverage`), `src/api/iqc/iqc-aql.query.ts#resolveAqlPlan`
(đọc DB, `docs/decisions/qc-aql-master-data.md`), `src/api/iqc/iqc-aql.constant.ts#resolveAqlResult`
(thuần), `InventoryReceiptsService.confirmInventoryReceipt` (nhánh `PRODUCTION`),
`OutboundOrdersService` (`sendOutboundOrder`/`approveOutboundOrder`/`rejectOutboundOrder`).
