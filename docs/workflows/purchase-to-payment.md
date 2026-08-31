# Đặt mua → nhận hàng → thanh toán

Chuỗi đầu-cuối chạm 4 module (`purchase-orders` → `inventory-receipts` → `purchasing`/
`payment-requests`), trước đây rải trong `docs/domains/purchasing.md` mà không có trình tự riêng.
Khái niệm PO/YCTT: `docs/domains/purchasing.md`. Nhánh RFQ trước PO: `docs/workflows/rfq-approval.md`.
Nhánh nhập kho: `docs/workflows/receipt-confirmation.md`, `docs/workflows/stock-movement.md`.

## Trigger

- `POST /purchase-orders` (lập tay) **hoặc** `approveQuotation` tự sinh PO `DRAFT` (từ RFQ).
- `PATCH /purchase-orders/:id`/`.../items/:id` — sửa PO còn `DRAFT`.
- `POST /purchase-orders/:id/confirm` — `DRAFT → ORDERED`.
- `POST /inventory-receipts` gắn `purchaseOrderId` → `confirm` → `post`.
- `POST /payment-requests/:id/mark-paid`/`.../cancel`.

## Actor

`purchasing:create`/`:update` cho PO tay/sửa. `purchasing:update` cho `confirm` PO.
`inventory:create`/`:update` cho phiếu nhập. `purchasing:approve` cho `mark-paid`/`cancel` YCTT.

## Flow

1. **Đặt mua** — `POST /purchase-orders` (chọn dòng ĐXMH `APPROVED` cho 1 NCC, `E249`/`E125`/`E019`)
   hoặc PO `DRAFT` tự sinh từ `approveQuotation` (`docs/workflows/rfq-approval.md`).
2. **Sửa PO Draft** — `PATCH` header/dòng, chỉ khi `DRAFT` (`E122`).
3. **Xác nhận đặt hàng** — `POST /purchase-orders/:id/confirm`: `DRAFT → ORDERED`, chặn thiếu
   `expectedDate`/`paymentTerm`/giá dòng (`E134`/`E156`/`E135`).
4. **Nhận hàng** — `POST /inventory-receipts` gắn `purchaseOrderId` (validate PO `ORDERED`, dòng
   thuộc đúng PO, SL cộng dồn ≤ SL đặt — `E121`/`E145`/`E123`/`E127`/`E154`) → `confirm` (`DRAFT →
   PENDING_RECEIPT`/`PENDING_IQC`) → `post` (ghi tồn thật).
5. **Tự sinh YCTT** — trong cùng transaction `post` (`docs/workflows/stock-movement.md`),
   `PaymentRequestsService.createIfOrderCompleted(tx, purchaseOrderId)` kiểm `receivedQuantity` vừa
   chạm `orderedQuantity` (đọc từ mọi phiếu `POSTED` nối `purchaseOrderId`, không riêng phiếu đang
   `post`) — nếu đúng, `INSERT payment_requests` (`PENDING`), `requestValue` snapshot Σ giá trị PO,
   `dueDate = orderDate + paymentTerm`. Idempotent — PO nhận qua nhiều phiếu không tạo trùng.
6. **Thanh toán** — `POST /payment-requests/:id/mark-paid` (`PENDING → PAID`) hoặc `.../cancel`
   (`PENDING → CANCELLED`) — cả hai là điểm cuối, không rollback.

## State changes

| Entity | Trigger | Trước | Sau |
| --- | --- | --- | --- |
| `purchase_orders.status` | `confirm` | `DRAFT` | `ORDERED` |
| `inventory_receipts.status` | `confirm`/`post` | `DRAFT` | `PENDING_RECEIPT`/`PENDING_IQC` → `POSTED` |
| `inventory_balances`/`inventory_transactions` | `post` | — | cập nhật |
| `payment_requests` | `post` (đủ hàng lần đầu) | *(chưa có)* | 1 dòng `PENDING` |
| `payment_requests.status` | `mark-paid`/`cancel` | `PENDING` | `PAID`/`CANCELLED` |

## Transaction boundary

Mỗi bước tự mở transaction riêng — không có transaction nào bắc cầu cả 4 bước. Cạnh bắc cầu module
duy nhất nằm ở bước 5: `postInventoryReceipt` gọi `PaymentRequestsService.createIfOrderCompleted`
**trong cùng transaction** với việc ghi bút toán (`InventoryReceiptsModule` import
`PaymentRequestsModule`) — "đã trừ/cộng tồn" và "đã sinh YCTT nếu đủ hàng" là một đơn vị nguyên tử.

## Failure cases

`E249` (trùng dòng ĐXMH khi lập PO tay), `E125` (dòng không `APPROVED`/đã huỷ), `E019` (NCC không
tồn tại), `E122` (sửa/huỷ PO không còn `DRAFT`), `E134`/`E156`/`E135` (`confirm` PO thiếu điều
kiện), `E124` (huỷ PO đã có phiếu nhập `POSTED`), `E121`/`E145`/`E123`/`E127`/`E154` (validate PO
lúc lập/sửa/`confirm` phiếu nhập), `E098`/`E153`/`E106` (vòng đời phiếu nhập, xem
`docs/workflows/receipt-confirmation.md`), `E158` (`mark-paid`/`cancel` YCTT không còn `PENDING`).

Giới hạn đã biết: PO `confirm` trước khi có gate `E156` (thiếu `paymentTerm`) thì
`createIfOrderCompleted` bỏ qua vĩnh viễn, không có route tạo bù YCTT tay cho các PO cũ này.

## Business rules

- Vì sao PO chỉ 3 trạng thái lưu cột, tiến độ nhận luôn derived → `docs/domains/purchasing.md`.
- Vì sao YCTT không có route tạo tay, `dueDate` tính thế nào → `docs/domains/purchasing.md`, mục
  "Yêu cầu thanh toán".

## Related domains

`purchasing` → `inventory` (đọc/ghi PO qua phiếu nhập) → `purchasing` (YCTT, khép vòng). Bước
trước (RFQ, tuỳ chọn): `docs/workflows/rfq-approval.md`. Bước nhập kho chi tiết:
`docs/workflows/receipt-confirmation.md`.

Code: `PurchaseOrdersService` (toàn bộ), `InventoryReceiptsService.postInventoryReceipt`,
`PaymentRequestsService.createIfOrderCompleted`/`markPaymentRequestPaid`/`cancelPaymentRequest`.
