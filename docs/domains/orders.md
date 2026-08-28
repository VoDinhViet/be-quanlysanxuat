# Orders (Đơn hàng bán)

## Purpose

Chứng từ ghi nhận khách đặt gì, giá bao nhiêu, giao khi nào — cửa vào duy nhất của luồng sản xuất.
Một đơn được duyệt là tín hiệu để hệ thống dựng kế hoạch sản xuất.

## Core concepts

**Không snapshot người liên hệ.** `orders` không giữ contact riêng — liên hệ luôn đọc qua
`clientId` → danh bạ hiện tại của khách hàng, không đóng băng lúc lập đơn.

**Item cũng không snapshot** — dòng đơn chỉ giữ `itemId` + SL/đơn giá/chiết khấu; tên/ảnh/ĐVT đọc
qua quan hệ. **Không có ràng buộc nào ép `itemId` phải là FG** (không service-check, không DB
CHECK) — khác `inventory-issues.ensureItemsValid` có kiểm thật cho dòng phiếu xuất liên kết
`orderItemId`. An toàn vì item chỉ xoá mềm, dòng đơn cũ luôn còn item để join.

**Mọi số tiền do server tính trong Postgres**, cùng transaction với lần ghi — client chỉ gửi đầu
vào (SL, đơn giá, %chiết khấu, VAT, phí ship); gửi `lineTotal`/`total`/... bị `ValidationPipe` lặng
lẽ loại bỏ.

**Dòng đã huỷ không tính vào tổng.**

## Entities

| Entity | Vai trò |
| --- | --- |
| `orders` | Header: khách, NVKD phụ trách, ngày đặt/giao, tiền tệ+tỷ giá, trạng thái, lý do từ chối |
| `order_items` | Dòng sản phẩm; `sortOrder` client tự quản |
| `order_files` | Đính kèm qua registry `files` |
| `order_payments` | Sổ cái thanh toán, append-only; `paymentStatus` tính lúc đọc |

`clientId` tạm thời optional khi tạo — `OrderResDto.client` có thể `null`.

## Lifecycle

```
Tạo đơn → DRAFT (nháp, sửa thoải mái)
   │ PATCH status=PENDING_CONFIRMATION
   ▼
PENDING_CONFIRMATION (chờ xác nhận)
   │ POST .../approve                      │ POST .../reject (bắt buộc reason)
   ▼                                        ▼
AWAITING_PRODUCTION                      REJECTED (kèm rejectionReason)
   │ POST /production-orders/:id/approve     │ PATCH status=PENDING_CONFIRMATION (gửi lại ngay)
   │   ← thuộc domain Production              │ PATCH field khác, KHÔNG kèm status (sửa lại từ đầu)
   ▼                                        ▼
IN_PROGRESS → COMPLETED / CANCELLED       DRAFT
```

`COMPLETED` đạt được tự động, không chỉ qua `PATCH` tay — `deliver` một DO
(`docs/workflows/outbound-delivery.md`) sau khi trừ tồn kiểm lại mọi dòng `order_items NORMAL`, đã
`issuedQty ≥ quantity` hết thì tự đóng `COMPLETED`. Hai đường (tay/tự động) không loại trừ nhau.

**Chốt cứng: `AWAITING_PRODUCTION`/`REJECTED` chỉ đạt qua `POST /orders/:orderId/approve`/`reject`**
— request tạo/sửa không set thẳng được (`E075`).

**Sửa một đơn `REJECTED` không gửi `status` tự động đưa về `DRAFT`** — giữ nguyên
`rejectedBy`/`rejectedAt`/`rejectionReason` làm lịch sử. Gửi `status` rõ ràng thì tôn trọng giá trị đó.

Mọi chuyển trạng thái khác đều lỏng — **trừ** `CANCELLED` bị chặn (`E236`) nếu LSX của đơn đã
`APPROVED` (cùng lý do `E080`). LSX còn `PENDING` thì huỷ được, `updateOrder` tự xoá luôn LSX đó
(cascade) để không mồ côi.

Rời `AWAITING_PRODUCTION` chỉ có đúng một đường, không nằm trong domain này — duyệt LSX bên
Production.

## Business rules

- `orders:approve` tách khỏi `orders:update` — duyệt/từ chối là quyền Giám đốc trở lên.
- Duyệt/từ chối chỉ hợp lệ từ `PENDING_CONFIRMATION` (`E074`); từ chối bắt buộc lý do.
- Duyệt đơn đồng thời sinh sẵn hồ sơ LSX, cùng transaction với đổi trạng thái.
- Sửa được ở mọi trạng thái trừ `COMPLETED`/`CANCELLED` (`E065`) và `PENDING_CONFIRMATION` (`E090`)
  — riêng đổi `items` bị chặn thêm (`E080`) nếu LSX đã duyệt. Không có route xoá đơn — huỷ dùng
  `PATCH status = CANCELLED` (`docs/decisions/orders-no-delete.md`).
- Huỷ đơn cũng chặn (`E236`) nếu LSX đã `APPROVED` — cùng guard hình dạng với `E080`.
- `items` trên `PATCH` là replace-all. `code` (`SOxxxx`) tự sinh, bất biến.
- Mọi route `/orders*` cần bearer token, kể cả đọc.
- `order_payments` append-only — sai thì `POST` thêm 1 dòng `amount` âm để đảo. Ghi được ở mọi
  trạng thái đơn. `paymentStatus` tính lúc đọc, không tự đổi `orders.status` khi đã `PAID`.

## Invariants

- Không đường nào ngoài `approveOrder` đưa đơn tới `AWAITING_PRODUCTION`.
- Tổng tiền trong DB luôn là kết quả server tính.
- Đơn ở trạng thái kết thúc (`COMPLETED`/`CANCELLED`) hoặc `PENDING_CONFIRMATION` là bất biến.
- `orders.assignedUserId` trỏ `users.id` — `docs/domains/identity-access.md`.

Không phải invariant dù dễ tưởng:

- Lịch sử duyệt/từ chối chỉ giữ lần gần nhất — không có bảng audit.
- `exchangeRate` chỉ dùng khi tính `GET /orders/stats`, không quy đổi ở chỗ khác.

## Cross-domain dependencies

- **→ Production**: duyệt đơn seed `production_orders`+`production_order_items` — ranh giới quan
  trọng nhất hệ thống.
- **← Production**: duyệt LSX đẩy đơn `AWAITING_PRODUCTION → IN_PROGRESS`, khoá sửa `items`/huỷ đơn
  (`E080`/`E236`). Huỷ đơn khi LSX còn `PENDING` xoá luôn LSX đó.
- **← Inventory**: đơn đã duyệt là nguồn `orderDemand` — chảy vào `bomDemand` FG
  (`GET /inventory-products`) và `reserved` của `getStockLevels` (2 đường tiêu thụ khác nhau, xem
  `docs/domains/inventory.md`). Đơn chưa duyệt không tạo nhu cầu này.
- **→ Inventory**: `GET /orders/:orderId/items` đọc thẳng `inventory_transactions` tính
  `issuedQty`/`remainingQty`, không qua DI.
- **→ Clients**: `clientId`, liên hệ đọc qua quan hệ.
- **→ Identity**: `assignedUserId` → `users.id`.
- **→ Product Structure**: `itemId` mỗi dòng.
- **→ Suppliers**: chỉ mượn `PaymentTerm` enum, không phụ thuộc dữ liệu NCC.

## Common mistakes

1. Không set được `status = AWAITING_PRODUCTION`/`REJECTED` bằng `PATCH` — `E075`.
2. Gửi `total`/`subtotal` từ client không có tác dụng — bị loại bỏ lặng lẽ.
3. `PATCH items` là replace-all, không phải partial.
4. `GET /orders/:id` không trả kèm `items` — đọc riêng qua `GET /orders/:id/items`.
5. `GET /orders/stats`: `expiredTrendCount` vẫn là xấp xỉ; `completedValue` phản ánh đúng "đã giao
   đủ thật" (không còn là proxy) — `docs/decisions/production-lifecycle-closing.md`.
6. Không có route xoá đơn hàng — huỷ dùng `PATCH status = CANCELLED`.
7. Không sửa được đơn đang chờ duyệt (`PENDING_CONFIRMATION`, `E090`).
8. `REJECTED` không có route riêng "mở lại" — `PATCH` không kèm `status` tự đưa về `DRAFT`.
9. Huỷ đơn (`CANCELLED`) không còn tự do tuyệt đối — `E236` chặn nếu LSX đã `APPROVED`.

## Related docs

- `docs/workflows/order-approval.md`, `docs/workflows/outbound-delivery.md`.
- `docs/domains/production.md`, `docs/domains/inventory.md`.
- `docs/decisions/orders-no-delete.md`, `docs/decisions/production-lifecycle-closing.md`.
