# Lập / gửi duyệt / giao / huỷ phiếu giao hàng (DO)

Vòng đời đầy đủ của `outbound_orders` — trước đây rải trong `docs/domains/inventory.md` và
`docs/workflows/outgoing-qc.md` (chỉ có phần gate QC). File này là nguồn cho toàn bộ
`create`/`update`/`send`/`approve`/`reject`/`deliver`/`cancel`/`delete`. Mô hình dữ liệu:
`docs/domains/inventory.md`. Gate QC (`E205`) là một cạnh đọc từ `docs/domains/quality-oqc.md`,
xem `docs/workflows/outgoing-qc.md`.

## Trigger

| Route | Ý nghĩa |
| --- | --- |
| `POST /outbound-orders` | Lập phiếu, `DRAFT` — chốt chặn tồn ngay (`E194`) |
| `PATCH /outbound-orders/:id` | Sửa, chỉ `DRAFT`, replace-all dòng |
| `POST /outbound-orders/:id/send` | `DRAFT`/`REJECTED → PENDING_APPROVAL` — gate QC + kiểm lại `E194` |
| `POST /outbound-orders/:id/approve` | `PENDING_APPROVAL → PENDING_DELIVERY` — kiểm lại `E194`, không gate QC |
| `POST /outbound-orders/:id/reject` | `PENDING_APPROVAL → REJECTED`, lý do bắt buộc |
| `POST /outbound-orders/:id/deliver` | `PENDING_DELIVERY → DELIVERED` — trừ tồn thật |
| `POST /outbound-orders/:id/cancel` | `DRAFT`/`PENDING_APPROVAL`/`PENDING_DELIVERY → CANCELLED` |
| `DELETE /outbound-orders/:id` | Chỉ `DRAFT`, hard delete |

## Actor

`outbound:create`/`:update`/`:delete` (Sales/Kho) cho `create`/`update`/`send`/`deliver`/`cancel`/
`delete`. `outbound:approve` (Giám đốc) riêng cho `approve`/`reject`.

## Preconditions

| Điều kiện | `create` | `update` | `send` | `approve` | `deliver` | `cancel` | `delete` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phiếu tồn tại | — | `E195` | `E195` | `E195` | `E195` | `E195` | `E195` |
| Đúng trạng thái nguồn | — | `E259` (`DRAFT`) | `E239` (`DRAFT`/`REJECTED`) | `E240` (`PENDING_APPROVAL`) | `E237` (`PENDING_DELIVERY`) | `E257` | `E258` (`DRAFT`) |
| Σ SL cùng vật tư ≤ Tồn FG − Đã giữ DO khác | `E194` | `E194` | `E194` | `E194` | — | — | — |
| Job liên quan đã qua hết QC (`getJobQcCoverage`) | — | — | `E205` | — | — | — | — |

`clientId` bắt buộc, bất biến — không route nào sửa lại. `create`/`update` **không** resolve/
validate cấu trúc dòng phía server — client gửi thẳng `itemId`/`productionJobId` từ popup
`GET /outbound-orders/unfulfilled-order-items`.

Popup trên và dòng DO đã có (`GET /outbound-orders/:id`) đều trả kèm 5 cột tồn để UI hiện SL có thể
giao thay vì chỉ SL đặt: `orderedQuantity` (SL dòng PO), `issuedQuantity` (Σ đã xuất luỹ kế theo
`orderItemId`), `onHandQuantity` (Σ `inventory_balances` mọi kho theo `itemId`), `heldQuantity`
(cùng công thức `reserved`/`fgHeld` ở `docs/domains/inventory.md`), và
`availableQuantity = onHandQuantity − heldQuantity`. Mở popup từ trang Sửa một DO có sẵn: lọc
`clientId` (đúng khách hàng của phiếu) + `excludeOutboundOrderId` (loại chính phiếu khỏi
`heldQuantity` — nó không giữ chỗ so với chính nó). Các cột này chỉ để hiển thị — chốt chặn thật vẫn
là `ensureOutboundLinesIssuable`/`E194` ở bảng Preconditions trên.

## Flow

### `create`

Giữ chỗ FG bắt đầu **ngay ở bước này** (không phải `send`) — trong 1 transaction: sinh mã
`DO-{yyMMdd}-{3}` (đếm trong ngày) → `INSERT` header (`DRAFT`) + mọi dòng →
`ensureOutboundLinesIssuable` (khoá `inventory_balances FOR UPDATE`, so Σ SL cùng vật tư với
Tồn FG − Đã giữ DO khác) → `E194` nếu vượt. Đây là chốt chặn thật duy nhất lúc tạo — hai DO nháp
cùng vượt tồn một vật tư đều bị chặn ngay, không đợi tới `send`.

### `update` (`PATCH`, chỉ `DRAFT`)

Replace-all dòng (xoá + chèn lại, khuôn `InventoryRequisitionsService.replaceRequisitionItems`) rồi
kiểm lại `E194` — SL dòng có thể đổi.

### `send`

`getOutboundOrderForUpdate` (`FOR UPDATE`) → gate QC: gom `productionJobId` distinct từ các dòng
(bỏ dòng `null`), mỗi Job gọi `getJobQcCoverage` — Job nào chưa qua hết QC (kể cả IQC công đoạn
`OUTSOURCE`) → `E205` → kiểm lại `E194` (có đường rò: một `POST /inventory-issues` tay khác rút
tồn FG giữa các bước) → `UPDATE status = PENDING_APPROVAL`, ghi `sentBy`/`sentAt`.

### `approve` / `reject`

`getOutboundOrderForUpdate` → kiểm `PENDING_APPROVAL` (`E240`) → `approve` kiểm lại `E194` lần nữa,
**không** gate QC lại (đã chặn ở `send`), chưa trừ tồn → `PENDING_DELIVERY`. `reject` chỉ đổi
trạng thái + ghi lý do → `REJECTED` (gửi lại được qua `send`).

### `deliver`

`getOutboundOrderForUpdate` → trong **một** transaction: sinh mã `PXK-{năm}-{5}` → `INSERT
inventory_issues` (`issueType=SALES`, `POSTED` thẳng) + `inventory_issue_items` map 1:1 dòng DO
(gắn `orderItemId`) → `postDocument` trừ tồn → `outbound_orders.status = DELIVERED` → với mỗi đơn
hàng bị đụng: mọi dòng `order_items NORMAL` đã `issuedQty ≥ quantity` → `orders.status: IN_PROGRESS
→ COMPLETED` (`docs/decisions/production-lifecycle-closing.md`).

### `cancel` / `delete`

`cancel` chỉ đổi `status`, không đụng tồn (3 trạng thái cho phép huỷ đều chưa `deliver`) — giữ chỗ
FG tự hết vì không còn khớp `HOLDING_STATUSES`. `delete` (`DRAFT`-only) hard-delete, dòng xoá theo
cascade.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `outbound_orders` | `create` | *(chưa có)* | `DRAFT` |
| `outbound_orders.status` | `send` | `DRAFT`/`REJECTED` | `PENDING_APPROVAL` |
| `outbound_orders.status` | `approve` | `PENDING_APPROVAL` | `PENDING_DELIVERY` |
| `outbound_orders.status` | `reject` | `PENDING_APPROVAL` | `REJECTED` |
| `outbound_orders.status` | `deliver` | `PENDING_DELIVERY` | `DELIVERED` |
| `outbound_orders.status` | `cancel` | `DRAFT`/`PENDING_APPROVAL`/`PENDING_DELIVERY` | `CANCELLED` |
| `inventory_issues`/`inventory_balances`/`inventory_transactions` | `deliver` | — | +1 phiếu `SALES POSTED`, tồn giảm |
| `orders.status` | `deliver` (đơn giao đủ) | `IN_PROGRESS` | `COMPLETED` |

## Side effects

`create`/`update`/`send`/`approve`/`reject`/`cancel`/`delete` không đụng tồn kho — chỉ `deliver`
mới ghi `inventory_issues`/`inventory_balances`/`inventory_transactions` và có thể đóng `orders`.

## Transaction boundary

Mỗi route tự mở transaction riêng, khoá header bằng `getOutboundOrderForUpdate` (`FOR UPDATE`)
trước khi đọc/ghi. `deliver` là transaction nặng nhất — gộp cấp mã, insert phiếu xuất, `postDocument`,
update DO, và đóng `orders` liên quan, tất cả trong một transaction.

## Failure cases

`E195` (không tồn tại), `E194` (vượt tồn khả giao), `E205` (còn Job chưa qua hết QC), `E237`
(`deliver` sai trạng thái), `E239` (`send` sai trạng thái), `E240`
(`approve`/`reject` sai trạng thái), `E257` (`cancel` sai trạng thái), `E258` (`delete` không phải
`DRAFT`), `E259` (`update` không phải `DRAFT`).

## Related domains

`inventory` (chủ) → `quality-oqc` (đọc `getJobQcCoverage` ở `send`) → `orders` (ghi `COMPLETED` ở
`deliver`). Xem `docs/workflows/outgoing-qc.md` cho chi tiết gate QC,
`docs/workflows/stock-movement.md` cho cơ chế `postDocument` dùng chung.

Code: `OutboundOrdersService` (toàn bộ), `docs/domains/inventory.md`.
