# Purchasing (Mua hàng)

## Purpose

Biến một đề xuất mua hàng **đã duyệt** (`docs/domains/purchase-requests.md`) thành hàng thật trong
kho: báo giá NCC (RFQ) → duyệt chọn NCC thắng thầu → đơn mua (hoặc lập PO tay thẳng) → nhận hàng qua
phiếu nhập (`docs/domains/inventory.md`). Đảo ngược một phần `docs/decisions/purchasing-scope-limits.md`.

**Sổ cái mua hàng** (`GET /purchase-ledger`) — màn tổng hợp, 1 dòng/1 dòng đề xuất, không có bảng
riêng, mọi số tính lúc đọc từ 4 bảng gốc. Không trả tồn kho (`onHand`/`bomDemand`/`available`/
`fromStock`) hay `remainingQuantity` — cả hai chưa có ở tầng này (chỉ có ở
`docs/domains/inventory.md` khối "Bốn số khác"/`purchase-requests` detail). Cảnh báo hiển thị
("Chưa tạo PO", ...) không do BE tính — BE chỉ trả số thô, FE tự so ngày lúc render.

## Core concepts

**Bốn chứng từ:**
```
purchase_requests / purchase_request_items       — đề xuất đã duyệt (nguồn nhu cầu, đọc-only ở đây)
purchase_quotations / purchase_quotation_items    — báo giá (RFQ), mỗi dòng là MỘT vật tư
purchase_quotation_item_allocations               — phân bổ SL báo giá về từng dòng ĐXMH nguồn
purchase_quotation_item_suppliers                 — giá một NCC báo cho một dòng vật tư
purchase_orders / purchase_order_items            — đơn mua, một NCC — lập tay HOẶC tự sinh từ RFQ
```
Không có FK header-to-header giữa RFQ/PO và `purchase_requests` — chỉ nối ở mức dòng. Ở RFQ qua
`purchase_quotation_item_allocations`; ở PO là FK trực tiếp `purchase_order_items.purchaseRequestItemId`.

**Một dòng RFQ (`purchase_quotation_items`) là một vật tư, gộp nhiều dòng ĐXMH nguồn cùng `itemId`**
(kể cả từ nhiều phiếu khác nhau) — `mergeItemsByItemId` tự gộp trước khi ghi. Bản thân dòng vật tư
**không giữ SL** — SL là `SUM(purchase_quotation_item_allocations.quantity)`, tính lúc đọc (tránh
nhân theo số NCC báo giá). Giá/leadtime nằm ở `purchase_quotation_item_suppliers` (1 dòng/NCC/vật
tư). Duyệt RFQ fan-out theo **phân bổ** (không theo dòng vật tư) — N phân bổ sinh N dòng
`purchase_order_items`, vẫn giữ bất biến "PO item trace về đúng 1 dòng ĐXMH".

**Thắng thầu là bất biến DB ở tầng vật tư**: `selectedAt` có giá trị = NCC thắng; unique index từng
phần (`WHERE selected_at IS NOT NULL`) chặn >1 NCC thắng cùng dòng vật tư. `approve` chỉ chạy khi
mọi vật tư đã có đúng 1 NCC thắng (`E132`) — không duyệt từng phần.

**`purchase_orders` chỉ 3 trạng thái lưu cột** (`DRAFT`/`ORDERED`/`CANCELLED`) — "Đang nhận"/"Hoàn
tất" luôn derived, so `orderedQuantity` (Σ dòng chưa hủy) với `receivedQuantity` (Σ phiếu nhập
`POSTED` nối `purchaseOrderItemId`). `GET /purchase-orders?hasRemainingReceipt=true` lọc
`status=ORDERED and (orderedQuantity=0 or receivedQuantity<orderedQuantity)`.

**Bốn trạng thái sổ cái, derived, dừng ở nhánh khớp đầu tiên** (`PurchaseLedgerStatus` — đúng 4 giá
trị đã ship, **không có `CANCELLED`**):

| # | Giá trị | Điều kiện |
| --- | --- | --- |
| 1 | `COMPLETED` | `orderedQuantity > 0` và `receivedQuantity ≥ orderedQuantity` |
| 2 | `ORDERED` | `orderedQuantity > 0` (còn lại) |
| 3 | `QUOTING` | `orderedQuantity = 0` và `quotedQuantity > 0` |
| 4 | `WAITING_TO_PURCHASE` | còn lại |

`quotedQuantity` tính cả dòng chưa NCC nào báo giá (khác "đã báo giá" nghĩa hẹp). `orderedQuantity`
chỉ đếm PO đã `ORDERED` (PO `DRAFT` chưa tính). Ba số response thật sự trả
(`PurchaseLedgerItemResDto`): `quantity` (SL đề xuất) / `quotedQuantity` / `orderedQuantity`.
`receivedQuantity` chỉ dùng nội bộ tính `status`, không nằm trong response.

## Entities

| Entity | Vai trò |
| --- | --- |
| `purchase_quotations` | RFQ — header, `DRAFT`/`PENDING_APPROVAL`/`APPROVED`/`CANCELLED` |
| `purchase_quotation_items` | Dòng vật tư — chỉ `itemId`, không giữ SL |
| `purchase_quotation_item_allocations` | Phân bổ SL về từng dòng ĐXMH nguồn |
| `purchase_quotation_item_suppliers` | Giá 1 NCC cho 1 dòng vật tư, `selectedAt` nếu thắng thầu |
| `purchase_orders` | PO — header, `DRAFT`/`ORDERED`/`CANCELLED`; `quotationId` tuỳ chọn (null nếu lập tay) |
| `purchase_order_items` | Dòng PO — `quotationItemSupplierId` tuỳ chọn (null nếu lập tay) |
| `payment_requests` | YCTT — 1 dòng = 1 PO (`purchaseOrderId` unique); tự sinh khi PO `COMPLETED` |

## Lifecycle

```
RFQ:  DRAFT ──send (E131/E130/E120)────> PENDING_APPROVAL
      PENDING_APPROVAL ──approve (mọi vật tư đã chọn thắng thầu, E132)──> APPROVED
      PENDING_APPROVAL ──reject──> CANCELLED (điểm cuối)
      APPROVED ──recall (chưa PO nào ORDERED, E133)──> DRAFT

PO:   (lập tay: E249 trùng dòng ĐXMH, E125 dòng không APPROVED/đã huỷ, E019 NCC)
      (hoặc tự sinh DRAFT từ approve RFQ)
      DRAFT ──confirm (đủ ngày giao+paymentTerm+mọi dòng có giá, E134/E156/E135)──> ORDERED
      DRAFT/ORDERED ──cancel (chưa có phiếu nhập POSTED nối tới, E124)──> CANCELLED
```

`approve` (1 transaction): set `selectedAt`/`selectedBy` dòng thắng → header `APPROVED` → gom theo
`supplierId` → `createDraftOrdersFromQuotation` sinh PO Draft (`expectedDate` = ngày duyệt +
`leadTimeDays` lớn nhất trong nhóm). `recall` làm ngược: xoá PO Draft đã sinh, bỏ `selectedAt`.
Chưa có route đưa `PENDING_APPROVAL` về `DRAFT` để sửa rồi gửi lại.

PO Draft sửa qua `PATCH /purchase-orders/:id`/`.../items/:id` chỉ khi `DRAFT` (`E122`).
`POST /purchase-orders` (lập tay, không qua RFQ) chọn thẳng dòng ĐXMH `APPROVED` cho 1 NCC —
`quotationItemSupplierId` luôn null (không có báo giá đứng sau).

### Yêu cầu thanh toán

```
(PO đạt COMPLETED, tự sinh) ──> PENDING
PENDING ──mark-paid (purchasing:approve)──> PAID
PENDING ──cancel (purchasing:approve)─────> CANCELLED
```
Không có route tạo tay — `createIfOrderCompleted(tx, purchaseOrderId)` gọi từ
`postInventoryReceipt` cùng transaction, idempotent (chỉ tạo đúng 1 lần khi `receivedQuantity` vừa
chạm `orderedQuantity`). `requestValue` snapshot Σ giá trị PO lúc tạo; `dueDate = orderDate +
paymentTerm`. PO `confirm` trước khi có gate `E156` (không `paymentTerm`) thì bỏ qua, không tạo bù
— giới hạn đã biết.

## Business rules

- Phân bổ/`purchase_order_items` chỉ nhận dòng ĐXMH `APPROVED` và chưa huỷ tay (`E125`).
- Một RFQ không được chứa 2 dòng ĐXMH trùng nhau trong toàn payload, kể cả khác dòng vật tư (`E128`).
  Một dòng phân bổ phải đúng `itemId` của dòng vật tư (`E149`); một dòng vật tư phải ≥1 phân bổ
  (`E150`). PO lập tay áp cùng bất biến trùng dòng, đổi mã: `E249`.
- Hai dòng payload cùng `itemId` được BE tự gộp (`mergeItemsByItemId`); một vật tư sau gộp không
  được 2 NCC trùng `supplierId` với giá/leadtime khác nhau (`E129`).
- `send` RFQ chặn: không có vật tư nào (`E131`); có vật tư chưa NCC nào (`E130`); có dòng NCC thiếu
  giá (`E120`). RFQ không hợp lệ transition khác → `E118`.
- `cancel` PO chặn nếu đã có phiếu nhập `POSTED` nối tới (`E124`), hoặc đã `CANCELLED` (`E122`).
- `confirm` PO chặn thiếu `expectedDate`/`paymentTerm`/giá dòng (`E134`/`E156`/`E135`).
- Mã (`RFQ-`/`PO-`) bất biến, unique toàn bảng, cấp qua `document_sequences`.

## Cross-domain dependencies

- **← Purchase Requests**: đọc dòng `APPROVED`, không ghi ngược.
- **← Partners**: `supplierId` bắt buộc (dòng RFQ hoặc header PO).
- **→ Inventory**: `inventory_receipts.purchaseOrderId`/`purchaseOrderItemId` là chỗ nối duy nhất —
  validate PO `ORDERED` + SL cộng dồn ≤ SL đặt (`E121`/`E145`/`E123`/`E127`/`E154`). Chiều ngược:
  `orderReceivedQuantitySubquery` đọc `inventory_receipt_items POSTED` tính tiến độ nhận;
  `postInventoryReceipt` gọi `createIfOrderCompleted` (Payment Requests) cùng transaction.
- **→ Product Structure**: dòng RFQ trỏ `items` bằng FK riêng; dòng PO trỏ gián tiếp qua
  `purchase_request_items.itemId`.

## Common mistakes

1. `purchase_orders.status` không có `RECEIVING`/`COMPLETED` — tiến độ nhận luôn derived.
2. Thêm NCC vào một vật tư RFQ không tạo dòng vật tư mới — chỉ thêm dòng
   `purchase_quotation_item_suppliers`; SL sống ở tầng phân bổ.
3. Gửi 2 dòng trùng `itemId` không lỗi — BE tự gộp trước khi ghi.
4. `quantity` (đề xuất, cố định) và `orderedQuantity` (có thể lớn/nhỏ hơn) không trừ trực tiếp cho
   nhau — `remainingQuantity` chưa tồn tại ở tầng này.
5. Huỷ PO không tự "mở lại" dòng đề xuất để đặt lại — dòng đề xuất vẫn còn, chỉ PO cũ chết.
6. `POST /purchase-orders` (lập tay) đã tồn tại — không phải chỉ sinh từ RFQ.
7. PO `DRAFT` (kể cả tự sinh từ RFQ) chưa tính vào `orderedQuantity` trên sổ cái.
8. RFQ bị `reject` là điểm cuối — không có đường lùi về `DRAFT`, phải tạo RFQ mới.
9. Nhận hàng vượt SL đặt của PO bị chặn ở tầng phiếu nhập (`E154`); mua dư qua PO
   (`orderedQuantity > quantity` đề xuất) vẫn hợp lệ — hai chuyện khác nhau.
10. `progress=ORDERED` nghĩa là chưa nhận gì (`receivedQuantity=0`) — muốn "còn hàng chưa nhập đủ"
    (cả `ORDERED` lẫn nhận dở) dùng `hasRemainingReceipt=true`.

## Related docs

- `docs/decisions/purchasing-scope-limits.md` — vì sao domain này tồn tại, giới hạn còn lại.
- `docs/domains/purchase-requests.md` — nguồn nhu cầu.
- `docs/workflows/rfq-approval.md`, `docs/workflows/purchase-to-payment.md`.
- `docs/domains/inventory.md` — nơi phiếu nhập tiêu thụ `purchase_order_items`.
- `docs/domains/partners.md` — nơi `suppliers` sống.
