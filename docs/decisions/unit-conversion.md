# Đơn vị hiển thị trên dòng phiếu kho

**Trạng thái:** còn hiệu lực

## Bối cảnh

Mọi dòng phiếu kho (`inventory_receipt_items`/`inventory_issue_items`/`inventory_adjustment_items`/
`inventory_requisition_items`) ghi `quantity` theo đơn vị gốc của item (`items.unitId`) —
`quantity` **luôn** là số lượng ở đơn vị gốc, không có phép quy đổi nào diễn ra ở tầng lưu trữ hay
tính toán. Nhu cầu ban đầu là mua theo Thùng rồi tồn/xuất theo Cái, nhưng quyết định cuối cùng thu
hẹp lại: chỉ cần **ghi nhận đơn vị người dùng chọn để hiển thị**, không cần server tự quy đổi số —
FE tự lo phần đổi (nếu có) trước khi gửi `quantity`.

## Quyết định

**`unitId` trên mỗi dòng phiếu kho là trường hiển thị thuần tuý, không tham gia bất kỳ phép tính
nào.** `quantity` luôn được hiểu là số lượng ở đơn vị gốc của item (`items.unitId`) — mọi bút toán
(`inventory_transactions`), tồn (`inventory_balances`), so sánh định mức (`E154`, `E230`/`E232`)
đọc thẳng `quantity`, giống hệt trước khi tính năng này tồn tại.

Bảng `item_units` (`itemId` + `unitId` + `conversionFactor`, `unique(itemId, unitId)`) vẫn giữ —
đây là danh mục "item này còn được đóng gói/mua bán theo đơn vị nào, quy đổi tham khảo bao nhiêu",
phục vụ FE hiển thị (ví dụ tooltip "1 Thùng = 12 Cái"). Server không đọc lại `conversionFactor` này
ở bất kỳ luồng ghi/tính toán nào của 4 bảng dòng phiếu.

Mỗi dòng phiếu kho có đúng 1 cột liên quan: `unitId` — đơn vị người nhập liệu chọn để hiển thị, mặc
định = đơn vị gốc của item nếu payload không gửi. Không có validate nào đối chiếu `unitId` với
`item_units` của item — chỉ cần là một `units.id` hợp lệ (FK), FE tự chịu trách nhiệm gợi ý đúng
đơn vị. `unitId` không kéo theo bất kỳ phép nhân/chia nào trên `quantity`.

## Vì sao không quy đổi

Thiết kế ban đầu (snapshot `conversionFactor` + cột `baseQuantity` tính sẵn trên mỗi dòng, mọi bút
toán đọc `baseQuantity`) đã được duyệt rồi đảo lại giữa chừng — quy đổi số lượng tự động không cần
thiết cho nghiệp vụ hiện tại, chỉ cần chỗ lưu "đơn vị nào" để hiển thị lại đúng. Giữ `quantity` là
nguồn sự thật duy nhất tránh thêm một tầng phức tạp (2 cột số + CHECK dương + logic quy đổi ở
service) không phục vụ mục tiêu thật.

## Phạm vi cố ý hẹp

Chỉ 4 bảng dòng phiếu kho (`inventory_receipt_items`, `inventory_issue_items`,
`inventory_adjustment_items`, `inventory_requisition_items`) có `unitId`. `purchase_order_items`/
`order_items`/`outbound_order_items` không đổi — không có khái niệm đơn vị hiển thị riêng.

## Business rules

- `unitId` trên dòng phiếu kho luôn là một `units.id` hợp lệ (FK) — mặc định đơn vị gốc của item
  khi payload không gửi. Không đối chiếu với `item_units`. `quantity` không bị biến đổi bởi lựa
  chọn này.
- `item_units.conversionFactor` phải `> 0` (CHECK) — chỉ để hiển thị, không có ý nghĩa tính toán ở
  tầng server, không module nào đọc lại giá trị này ngoài chính `item-units` CRUD.
- **Xoá một dòng `item_units` luôn an toàn** — cột `unitId` trên dòng phiếu FK thẳng tới `units`
  (đơn vị gốc dùng chung toàn hệ thống), không FK tới `item_units`. Xoá một dòng `item_units` chỉ
  làm mất lựa chọn đó cho **phiếu mới lập sau này** — không cần mã lỗi "in_use", không cần chặn.
- `GET .../units` của một item chỉ liệt kê `item_units` của chính item đó, không có danh sách toàn
  cục kiểu "mọi đơn vị từng dùng" — mỗi item quản lý danh mục đơn vị hiển thị độc lập.

## Related docs

`docs/domains/inventory.md`, `docs/domains/product-structure.md` (`item_units` mount dưới
`/items/:itemId/units`).
