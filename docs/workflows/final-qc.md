# OQC — kiểm chất lượng lô thành phẩm đến nhập kho

Chặng nối `production` → `quality` → `inventory`: từ lúc production yêu cầu QC cho một lô thành
phẩm của một Job đang chạy, tới lúc QC xác nhận PASS, tới lúc kho được phép nhập lô đó vào tồn.
Mô hình `production_jobs` ở `docs/domains/production.md`, mô hình `oqc_inspections` ở
`docs/domains/quality.md`, gate nhập kho ở `docs/domains/inventory.md`; đây là trình tự đầy đủ nối
ba domain đó.

## Trigger

- `POST /oqc` — production "yêu cầu QC" cho một lô đã sản xuất xong (partial hoặc full) của một
  Job đang `IN_PROGRESS`.
- `POST /oqc/:oqcId/confirm` — QC lưu kết quả kiểm (PASS/FAIL), gọi lại được nhiều lần trên cùng
  phiếu tới khi PASS.
- `POST /inventory-receipts/:receiptId/confirm` với `receiptType = PRODUCTION` — kho xác nhận nhập
  lô thành phẩm, đọc lại tổng SL đã PASS OQC của Job.

## Actor

`oqc:create` cho bước tạo (production). `oqc:update` cho `confirm` (QC — vai trò khác, tách actor
tạo/xác nhận). `oqc:delete` cho xoá phiếu `NOT_INSPECTED`. `inventory:update` cho `confirm`/`post`
phiếu nhập — kho là bên xác nhận vật lý cuối cùng, không liên quan quyền OQC.

## Preconditions

| Điều kiện | `POST /oqc` | `confirm` OQC | `confirm` phiếu nhập (PRODUCTION) |
| --- | --- | --- | --- |
| Job tồn tại | `E082` | — | — |
| Job đang `IN_PROGRESS` | `E175` | — | — |
| Tổng lot size (kể cả phiếu mới) không vượt `job.quantity` | `E176` | — | — |
| Phiếu OQC tồn tại, đang lưu được (`status ≠ COMPLETED`) | — | `E174`/`E177` | — |
| `productionJobId` có trên phiếu nhập | — | — | `E179` |
| Mọi dòng phiếu nhập cùng `itemId = job.itemId` | — | — | `E107` |
| Tổng SL các dòng (cộng dồn mọi phiếu PRODUCTION khác của Job) không vượt tổng OQC `COMPLETED` | — | — | `E180` |

## Flow

### Tạo (`OqcService.createOqc`)

1. Load Job (`{id, itemId, quantity, status}`) — không thấy → `E082`; `status ≠ IN_PROGRESS` →
   `E175`.
2. Tính tổng `quantity` mọi OQC **chưa xoá** (mọi `status`, kể cả `NOT_INSPECTED`/`PENDING` đang
   giữ chỗ) của cùng `productionJobId`, cộng lô mới — vượt `job.quantity` → `E176`.
3. Sinh mã `OQC-{năm}-{đếm trong năm + 1, pad 5}` nếu client không gửi `code`; check unique nếu có
   gửi.
4. 1 câu `INSERT`, không transaction (1 write) — `itemId: job.itemId`, `status: NOT_INSPECTED`.

### Xác nhận (`OqcService.confirmOqc`)

1. Load phiếu — không thấy → `E174`; `status = COMPLETED` → `E177` (khoá cứng, không confirm lại
   được — khác IQC, nơi chỉ `WAITING_RETURN` khoá).
2. `resolveOqcStatus(reqDto.result)`: `PASS → COMPLETED`, `FAIL → PENDING`.
3. 1 câu `UPDATE`, ghi đè toàn bộ (field vắng mặt = xoá, cùng ngữ nghĩa `confirmIqc`).
   `confirmedBy`/`confirmedAt` chỉ ghi ở lần lưu đầu tiên (`isFirstConfirm ? userId/new Date() :
   undefined`).
4. `FAIL` → QC sửa mẫu/kết quả rồi gọi lại bước này trên **chính phiếu đó**, lặp tới khi `PASS`.
   Không có `disposition`/NCR tách nhánh (khác IQC — quyết định hoãn tường minh).

### Nhập kho thành phẩm (`InventoryReceiptsService.confirmInventoryReceipt`, nhánh `PRODUCTION`)

1. Sau `ensureReceiptQuantitiesWithinOrdered` (nhánh PO, không áp dụng ở đây vì phiếu PRODUCTION
   không gắn PO), kiểm `receipt.receiptType = PRODUCTION`:
   - Mọi `lineItems[].itemId` phải bằng `job.itemId` (load Job trong cùng `tx` qua
     `receipt.productionJobId`) — lệch thì `E107`.
   - `passedQty = getPassedOqcQuantityByJobId(tx, receipt.productionJobId)` — tổng `quantity` các
     dòng `oqc_inspections` `COMPLETED` của Job.
   - `receivedSoFar` = tổng `quantity` mọi `inventory_receipt_items` thuộc phiếu `PRODUCTION` khác
     cùng `productionJobId`, `status ∈ {PENDING_IQC, PENDING_RECEIPT, POSTED}`, loại trừ chính
     phiếu này.
   - `receivedSoFar + thisReceiptQty > passedQty` → `E180`.
2. Qua được gate thì tiếp tục như mọi phiếu nhập khác: `DRAFT → PENDING_RECEIPT`/`PENDING_IQC` tuỳ
   `requiresIqc` (`docs/workflows/receipt-confirmation.md`), rồi `post` sinh bút toán `PRODUCTION_IN`
   như thường — `post` **không** kiểm lại gate OQC lần hai vì `confirm` phiếu nhập luôn chạy trong
   transaction có lock, không có cửa sổ race giữa `confirm` và `post`.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `oqc_inspections` | `POST /oqc` | *(chưa có)* | 1 dòng `NOT_INSPECTED` |
| `oqc_inspections.status` | `confirm` (PASS) | `NOT_INSPECTED`/`PENDING` | `COMPLETED` |
| `oqc_inspections.status` | `confirm` (FAIL) | `NOT_INSPECTED`/`PENDING` | `PENDING` |
| `inventory_receipts.status` | `confirm` phiếu nhập (qua gate) | `DRAFT` | `PENDING_RECEIPT`/`PENDING_IQC` |
| `inventory_balances`/`inventory_transactions` | `post` phiếu nhập | — | cập nhật (`PRODUCTION_IN`, xem `docs/workflows/stock-movement.md`) |

## Side effects

- `POST /oqc`: không side effect khác — 1 dòng mới, không đụng Job/kho.
- `confirm` OQC: không side effect khác — chỉ đổi `status`/kết quả của chính dòng đó, không ghi
  ngược vào `production_jobs`.
- `confirm` phiếu nhập (nhánh PRODUCTION): không sinh/sửa gì trên `oqc_inspections` — gate chỉ
  **đọc**, một chiều.

## Transaction boundary

`createOqc`/`confirmOqc` đều 1 write, không mở transaction (Postgres tự atomic cho một câu lệnh).
`confirmInventoryReceipt` đã tự mở transaction sẵn (khuôn `docs/workflows/receipt-confirmation.md`)
— gate OQC chỉ thêm 2 kiểm tra bên trong, không thêm transaction mới,
`getPassedOqcQuantityByJobId` là plain function nhận `tx` (chữ ký `Database | DbTransaction`, cùng
khuôn `getReturnedQuantityByReceiptItemId`), không tự mở transaction, không qua DI —
`InventoryReceiptsModule` không import `OqcModule`.

## Failure cases

`E082` (Job không tồn tại), `E175` (Job không `IN_PROGRESS` lúc tạo OQC), `E176` (tổng lot size
vượt SL kế hoạch Job), `E174` (phiếu OQC không tồn tại), `E177` (confirm lại khi đã `COMPLETED`),
`E178` (xoá phiếu OQC không còn `NOT_INSPECTED`), `E179` (phiếu nhập `PRODUCTION` thiếu
`productionJobId`), `E107` (dòng phiếu nhập không khớp `itemId` của Job), `E180` (SL nhập vượt
tổng OQC PASS còn lại của Job).

## Business rules

- Vì sao `COMPLETED` khoá `confirm` cứng (khác IQC) → `docs/domains/quality.md`, mục OQC.
- Vì sao gate chỉ cần ở `inventory_receipts` (nhập kho TP), không cần ở `inventory_issues` (xuất
  kho sản xuất) hay một luồng giao hàng → `docs/domains/inventory.md`, "Gate nhập kho thành phẩm".
- "PO" hiển thị trên màn OQC là `orders.code`, tính lúc đọc qua join
  `production_jobs → production_orders → orders`, không lưu cột → `docs/domains/quality.md`.

## Related domains

`production` (nguồn Job, đọc-một-chiều) → `quality` (chủ luồng OQC) → `inventory` (đọc kết quả để
gate). Không có chiều ngược nào — Production không biết OQC tồn tại, OQC không biết
`inventory_receipts` tồn tại.

Bước trước: Job `start` (`PENDING → IN_PROGRESS`,
`docs/workflows/production-job-execution.md`). Bước sau: `post` phiếu nhập TP (sinh bút toán
`PRODUCTION_IN`, `docs/workflows/stock-movement.md`).

Code: `OqcService.createOqc`/`confirmOqc`, `src/api/oqc/oqc.query.ts#getPassedOqcQuantityByJobId`,
`InventoryReceiptsService.confirmInventoryReceipt` (nhánh `PRODUCTION`).
