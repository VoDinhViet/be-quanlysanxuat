# SL mục tiêu giao/hoàn tất đơn ưu tiên LSX, không phải SL đặt gốc

**Trạng thái:** còn hiệu lực

## Bối cảnh

Báo lỗi thực tế: đơn SO0001 đặt 200, sau khi duyệt sinh LSX với Đề xuất SX = 200 (snapshot
`production_order_items.orderQty = 200`, `quantity = 200`). Trong lúc LSX còn `PENDING`,
`PATCH /production-orders/:id` (`ProductionOrdersService.updateProductionOrder`) cho sửa SL đề
xuất SX xuống 100 — hợp lệ, có audit log `QUANTITY_UPDATED`, phần chênh lệch tự ghi vào
`fromStockQty = orderQty - quantity` (ý "phần còn lại lấy từ tồn kho có sẵn"). Đây là cơ chế có chủ
đích, không phải chỗ sai.

Chỗ sai nằm ở các bước đọc **sau đó**: mọi nơi tính "đơn đã giao đủ chưa / còn thiếu bao nhiêu / nhu
cầu mở của item này" đọc thẳng `order_items.quantity` (200, đã đóng băng từ lúc duyệt đơn) — không
biết gì về việc LSX đã chốt lại còn 100. Hệ quả: đơn giao đủ 100 (đúng theo LSX) không bao giờ tự
đóng `COMPLETED` (kẹt `IN_PROGRESS` vĩnh viễn vì so với 200), và "Khả dụng" của các đơn khác bị giữ
chỗ oan bởi phần chênh lệch ảo.

## Quyết định

SL mục tiêu để tính giao đủ/còn thiếu/nhu cầu mở của một dòng đơn (`order_items`) ưu tiên đọc
`production_order_items.quantity` (SL đã chốt qua LSX — snapshot ban đầu hoặc đã sửa tay lúc
`PENDING`) khi dòng đó đã có LSX; chỉ fallback về `order_items.quantity` gốc khi chưa có LSX (chưa
duyệt đơn — thực tế hiếm/không xảy ra ở các chỗ sửa dưới đây vì đều chỉ chạy sau khi đơn đã
`AWAITING_PRODUCTION`/`IN_PROGRESS`, nhưng giữ `coalesce` cho an toàn).

`production_order_items.orderItemId` là `unique + notNull` — 1-1 với `order_items` (mỗi dòng
`NORMAL` có đúng 1 dòng LSX, sinh cùng lúc duyệt đơn), nên chỉ cần
`LEFT JOIN production_order_items ON orderItemId = order_items.id` rồi
`coalesce(production_order_items.quantity, order_items.quantity)`.

### 4 chỗ đã sửa

| File:hàm                                                                        | Trước                                    | Sau                                                                                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `outbound-orders.service.ts` `closeOrdersIfFullyDelivered`                      | so `issuedQty ≥ order_items.quantity`    | so `issuedQty ≥ targetQuantity` (coalesce LSX) — gate `COMPLETED` duy nhất của đơn                                                         |
| `orders.service.ts` `getOrderItems`                                             | `remainingQty = quantity - issuedQty`    | `remainingQty = targetQuantity - issuedQty`; thêm field `productionQuantity` (nullable) để FE hiện cả 2 số                                 |
| `inventory.query.ts` `openOrderDemandByItemSubquery`                            | demand cộng `order_items.quantity`       | demand cộng `targetQuantity`                                                                                                               |
| `outbound-orders.service.ts` `getOutboundOrderItems`/`getUnfulfilledOrderItems` | `orderedQuantity = order_items.quantity` | `orderedQuantity = targetQuantity` (giữ nguyên tên field — cảnh báo "Vượt SL đặt" và giá trị mặc định ở FE tự đúng theo, không cần sửa FE) |

**Không đụng**: `updateProductionOrder`'s guard hiện có (E076/E084/E078 — đúng, không phải chỗ
sai); mọi chỗ production/job/OQC/inventory-receipts vốn đã đọc đúng `job.quantity`
(`inventory-receipts.service.ts` — `closeJobIfFullyReceived`, `E197`) — các chỗ này không có gì
cần sửa, LSX/Job vẫn luôn là "quyết định sản xuất thật sự" từ trước tới nay, quyết định này chỉ nối
lại phần đơn hàng/tồn kho cho khớp với nó.

## Rủi ro cố ý để ngoài phạm vi

Quyết định này **không** xác minh phần `fromStockQty` (SL "lấy từ tồn kho") có thực sự tồn tại hay
không — đơn sẽ tự đóng `COMPLETED` ngay khi giao đủ phần SL LSX (100), dù khách hàng lẽ ra còn được
nhận thêm phần `fromStockQty` (100) mà không hệ thống nào theo dõi việc đó có xảy ra không. Đây là
khoảng trống khác — cần đề xuất riêng nếu muốn xử lý (VD: chặn sửa SL LSX xuống dưới `orderQty` trừ
khi tồn kho thật đủ `fromStockQty`, hoặc bắt buộc DO riêng cho phần `fromStockQty`).

## Đừng hoàn lại

- Đừng đổi 4 chỗ trên về đọc thẳng `order_items.quantity` làm mục tiêu giao/hoàn tất/nhu cầu — đó
  chính là lỗ hổng đã sửa (đơn kẹt `IN_PROGRESS` vĩnh viễn khi LSX bị giảm SL).
- Đừng nhầm `productionQuantity` (mới, ở `OrderItemResDto`) với `orderQty` (đã có sẵn trên
  `production_order_items`, snapshot SL đặt gốc tại lần ghi gần nhất — dùng để tính `fromStockQty`,
  khác mục đích).
- `order_items.quantity` chính nó **không đổi nghĩa** — vẫn là SL khách đặt, hiển thị nguyên vẹn
  trên trang chi tiết đơn; chỉ có các phép tính "còn thiếu/đã đủ" là đổi cơ sở so sánh.

## Related docs

`docs/domains/orders.md` (mục "COMPLETED đạt được tự động"), `docs/domains/production.md` (mục "Đề
xuất SX ... đóng băng"), `docs/workflows/outbound-delivery.md`, `docs/workflows/
production-order-approval.md`.
