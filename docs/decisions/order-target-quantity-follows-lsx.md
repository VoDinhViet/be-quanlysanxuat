# SL mục tiêu giao/hoàn tất đơn ưu tiên LSX, không phải SL đặt gốc

**Trạng thái:** đã đảo ngược 2026-09-22 — xem "Đảo ngược" ở cuối file. Phần Bối cảnh/Quyết định bên
dưới giữ nguyên làm lịch sử, không còn mô tả hành vi hiện tại.

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

## Đảo ngược (2026-09-22)

Người dùng báo lại đúng hệ quả cố ý ở trên: SL mục tiêu giao đang thấp hơn SL đơn hàng đã duyệt khi
LSX bị chỉnh xuống, và yêu cầu SL giao phải luôn theo đơn hàng đã duyệt — không theo LSX. Đã đảo
ngược cả 4 chỗ ở bảng trên về đọc thẳng `order_items.quantity` (bỏ luôn `coalesce`/`LEFT JOIN
production_order_items` ở những chỗ không còn dùng cho mục đích nào khác).

Đánh đổi được chấp nhận: bug mô tả ở "Bối cảnh" có thể tái diễn — nếu LSX bị hạ SL (phần chênh lệch
`fromStockQty`) mà không có DO nào giao nốt phần đó (không gắn Job, lấy từ tồn kho có sẵn), đơn sẽ
đứng `IN_PROGRESS` cho tới khi được giao đủ thật sự. Đây được coi là đúng thực tế nghiệp vụ — đơn chỉ
nên `COMPLETED` khi khách nhận đủ SL đã đặt.

`productionQuantity` trên `OrderItemResDto` (thêm ở quyết định gốc) **vẫn giữ** — thuần hiển thị SL
đã chốt LSX để so sánh, không còn dùng để tính `remainingQty`/mục tiêu.

Không backfill/xử lý gì thêm cho các đơn đang kẹt `IN_PROGRESS` vì đã "COMPLETED nhầm" theo logic cũ
trước ngày đảo ngược — quyết định này chỉ đổi hành vi từ nay về sau.

## Related docs

`docs/domains/orders.md` (mục "COMPLETED đạt được tự động"), `docs/domains/production.md` (mục "Đề
xuất SX ... đóng băng"), `docs/workflows/outbound-delivery.md`, `docs/workflows/
production-order-approval.md`.
