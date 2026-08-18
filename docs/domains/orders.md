# Orders (Đơn hàng bán)

## Purpose

Chứng từ ghi nhận **khách đặt gì, giá bao nhiêu, giao khi nào** — và là cửa vào duy nhất của luồng sản xuất. Một đơn được duyệt chính là tín hiệu để hệ thống dựng kế hoạch sản xuất.

## Core concepts

**Không snapshot người liên hệ.** `orders` không giữ contact riêng — liên hệ của một đơn luôn đọc qua `clientId` → danh bạ hiện tại của khách hàng, không đóng băng tại thời điểm lập đơn.

**Item cũng cố ý *không* snapshot.** Dòng đơn chỉ giữ `itemId` (luôn FG, service-enforced) + số lượng/đơn giá/chiết khấu. Tên, ảnh, đơn vị luôn đọc qua quan hệ tại thời điểm đọc. An toàn vì item chỉ xoá mềm, nên dòng đơn cũ luôn còn item để join tới.

**Mọi số tiền do server tính, client không được gửi.** Client chỉ gửi đầu vào (số lượng, đơn giá, % chiết khấu, VAT, phí ship); toàn bộ `lineTotal`/`subtotal`/`discountAmount`/`vatAmount`/`total` được tính lại **trong Postgres**, trong cùng transaction với lần ghi. Gửi kèm các field đó sẽ bị `ValidationPipe` lặng lẽ loại bỏ. Lý do: tiền là thứ không được phép lệch giữa client và server.

**Dòng đã huỷ không tính vào tổng.** Đây là quyết định nghiệp vụ (khác với mock UI ban đầu vốn vẫn cộng) — giữ đúng nghĩa của chữ "Đã huỷ".

## Entities

| Entity | Vai trò |
| --- | --- |
| `orders` | Header: khách, NVKD phụ trách, ngày đặt/giao, tiền tệ + tỷ giá, khối tiền, trạng thái, lý do từ chối |
| `order_items` | Dòng sản phẩm; `sortOrder` do client tự quản khi kéo-thả |
| `order_attachments` | Tài liệu đính kèm qua registry `files` |

`clientId` hiện **tạm thời optional** khi tạo — không phải quyết định lâu dài; `OrderResDto.client` do đó có thể `null`.

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
   (qua PATCH)
```

**Chốt cứng duy nhất của cả vòng đời: `AWAITING_PRODUCTION`/`REJECTED` chỉ đạt được qua `POST /orders/:orderId/approve`/`reject`.** Request tạo/sửa không được set thẳng hai trạng thái đó (`E075`). Nếu không chặn, bất kỳ ai có `orders:update` — không riêng Giám đốc — đều bỏ qua được bước duyệt/từ chối.

**Sửa một đơn đang `REJECTED` mà không gửi `status` sẽ tự động đưa nó về `DRAFT`** — coi như làm lại từ đầu, giữ nguyên `rejectedBy`/`rejectedAt`/`rejectionReason` làm lịch sử (`OrdersService.updateOrder`). Gửi `status` rõ ràng (vd `CANCELLED`) thì tôn trọng giá trị đó, không tự chuyển.

Mọi chuyển trạng thái **khác** đều lỏng: không có state machine đầy đủ, huỷ được từ bất kỳ đâu chưa kết thúc.

**Rời `AWAITING_PRODUCTION` cũng chỉ có đúng một đường, và nó không nằm trong domain này** — duyệt LSX bên Production.

## Business rules

- `orders:approve` là permission **riêng**, tách khỏi `orders:update` — duyệt/từ chối là quyền Giám đốc trở lên.
- Duyệt/từ chối chỉ hợp lệ khi đơn đang `PENDING_CONFIRMATION` (`E074`). Từ chối **bắt buộc có lý do**, đưa đơn sang `REJECTED` (không phải `DRAFT`).
- **Duyệt đơn đồng thời sinh sẵn hồ sơ LSX** (header + các dòng quyết định sản xuất), trong cùng transaction với việc đổi trạng thái.
- Sửa được ở mọi trạng thái trừ `COMPLETED`/`CANCELLED` (`E065`) và `PENDING_CONFIRMATION` (`E090`, đang chờ duyệt — tránh đổi dữ liệu trong lúc Giám đốc đang xem để duyệt) — với một ngoại lệ: đổi `items` bị chặn (`E080`) nếu LSX của đơn **đã duyệt**. **Không có route xoá đơn** — huỷ đơn dùng `PATCH status = CANCELLED`, xem `docs/decisions/orders-no-delete.md`.
- `PATCH` một đơn `REJECTED` mà **không gửi `status`** tự động đưa nó về `DRAFT` — coi như sửa lại từ
  đầu, giữ nguyên `rejectedBy`/`rejectedAt`/`rejectionReason` làm lịch sử. Gửi `status` rõ ràng (kể
  cả `PENDING_CONFIRMATION` để gửi duyệt lại ngay, không cần sửa gì) thì tôn trọng giá trị đó, không
  tự chuyển. Không có route riêng để "mở lại" `REJECTED` — sửa/không sửa gì cũng qua cùng một `PATCH`.
  `status: AWAITING_PRODUCTION`/`REJECTED` vẫn bị chặn thẳng (`E075`).
- `items` trên `PATCH` là **replace-all**: gửi mảng mới (kể cả `[]`) thay hoàn toàn dòng cũ; bỏ trống field thì giữ nguyên.
- `code` (`SOxxxx`) tự sinh nếu không gửi, và **bất biến** sau khi tạo.
- **Mọi route `/orders*` đều cần bearer token, kể cả đọc** — khác phần lớn master data.

## Invariants

- Không đường nào ngoài `approveOrder` đưa đơn tới `AWAITING_PRODUCTION`.
- Tổng tiền trong DB luôn là kết quả server tính, chưa bao giờ là số client gửi.
- Một đơn ở trạng thái kết thúc (`COMPLETED`/`CANCELLED`) hoặc đang chờ duyệt (`PENDING_CONFIRMATION`) là bất biến — không sửa được.
- `orders.assignedUserId` trỏ `users.id`, cùng quy ước với mọi FK "ai thao tác" khác trong hệ thống
  — xem `docs/domains/identity-access.md`.

Không phải invariant dù dễ tưởng:

- **Lịch sử duyệt/từ chối chỉ giữ lần gần nhất.** Đơn bị từ chối hai lần thì lý do lần đầu bị ghi đè — không có bảng audit.
- **`exchangeRate` chỉ được dùng khi tính `GET /orders/stats`**, không dùng để quy đổi ở bất kỳ chỗ nào khác.

## Cross-domain dependencies

- **→ Production**: duyệt đơn seed `production_orders` + `production_order_items`. Đây là ranh giới quan trọng nhất của hệ thống.
- **← Production**: duyệt LSX đẩy đơn từ `AWAITING_PRODUCTION` sang `IN_PROGRESS`, và khoá việc sửa `items`.
- **← Inventory**: đơn đã duyệt (`AWAITING_PRODUCTION`/`IN_PROGRESS`) là thứ tạo ra `reserved` (hàng đã giữ chỗ) trong công thức tồn kho. Đơn chưa duyệt **không** giữ chỗ.
- **→ Clients**: `clientId`, liên hệ đọc qua quan hệ (xem "Core concepts").
- **→ Identity**: `assignedUserId` → `users.id`.
- **→ Product Structure**: `itemId` mỗi dòng (luôn FG).
- **→ Suppliers**: chỉ mượn lại enum `PaymentTerm` khai báo bên đó — không phụ thuộc dữ liệu nhà cung cấp.

## Common mistakes

1. **Tưởng có thể set `status = AWAITING_PRODUCTION`/`REJECTED` bằng `PATCH`.** Không — `E075`. Đây là chốt chặn cố ý của luồng duyệt/từ chối.
2. **Gửi `total`/`subtotal` từ client rồi thắc mắc sao không có tác dụng.** Bị `whitelist: true` loại bỏ lặng lẽ, không báo lỗi.
3. **Gửi thiếu dòng khi `PATCH items`.** Là replace-all, không phải partial — gửi thiếu là xoá.
4. **Tưởng `GET /orders/:id` trả kèm `items`.** Không — detail chỉ có header + `attachments`; dòng sản phẩm đọc riêng qua `GET /orders/:id/items` (khuôn giống OS-OUT/OS-IN/DO). `POST`/`PATCH` trả 204 rỗng, cũng không có body để đọc.
5. **Dựa vào `GET /orders/stats` như số liệu chính xác.** Hai field là xấp xỉ: `completedValue` ("Đã giao") dùng `status = COMPLETED` làm proxy vì chưa có bảng giao hàng thật; `expiredTrendCount` so trạng thái *hiện tại* với mốc 7 ngày trước vì không có bảng lịch sử trạng thái.
6. **Tìm route xoá đơn hàng.** Không có, đã bỏ hẳn — huỷ đơn dùng `PATCH status = CANCELLED`. Xem `docs/decisions/orders-no-delete.md`.
7. **Tưởng sửa được đơn đang chờ duyệt (`PENDING_CONFIRMATION`).** Không — `E090`, khoá cho tới khi Giám đốc duyệt/từ chối xong.
8. **Tưởng `REJECTED` có route riêng để "mở lại"/"khôi phục".** Không có — `PATCH` bất kỳ field nào
   mà không kèm `status` tự động đưa nó về `DRAFT`, đó chính là cách "mở lại" (khuôn
   `docs/domains/purchase-requests.md`).

## Related docs

- `docs/workflows/order-approval.md` — trình tự chạy của bước duyệt/từ chối.
- `docs/domains/production.md` — điều xảy ra ngay sau khi duyệt đơn.
- `docs/domains/inventory.md` — cách đơn đã duyệt tạo ra `reserved`.
- `docs/decisions/orders-no-delete.md` — vì sao không có route xoá đơn hàng.
