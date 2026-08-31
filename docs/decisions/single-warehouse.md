# Bỏ khái niệm nhiều kho — chỉ 1 kho vật lý duy nhất

**Trạng thái:** còn hiệu lực

## Bối cảnh

`warehouses` từng là danh mục kho (`code`/`name`/`type`), gắn FK vào 8 bảng
(`inventory_balances`/`inventory_transactions`/`inventory_receipts`/`inventory_issues`/
`inventory_requisitions`/`supplier_returns`/`outsourcing_orders`/`purchase_orders`), với seed tạo 3
kho (`KHO-NVL`/`KHO-BTP`/`KHO-TP`) phân theo `type` (RM/WIP/FG). Nhưng thực tế nhà máy chỉ có
**một kho vật lý duy nhất, mở 24/7** — không có khái niệm đóng/mở, không phân khu theo loại hàng.

`warehouses.type` chưa từng ràng buộc loại hàng được nhập/xuất (chỉ là nhãn lọc) — hệ quả là mọi
service ghi tồn phải tự "đoán" đúng kho theo `type` thay vì có một đáp án tường minh:
`resolveReceiptWarehouseId` (kho RM cho PO), `resolveFgWarehouseId` (kho FG cho phiếu nhập TP tự
sinh và cho `deliver` DO). `resolveFgWarehouseId` ở `deliver` DO ném lỗi cứng (`E238`) nếu khác
đúng 1 kho FG; ở phiếu nhập TP tự sinh thì bỏ qua im lặng. Cả hai đều là triệu chứng của cùng một
vấn đề: mô hình dữ liệu giả định nhiều kho trong khi nghiệp vụ chỉ có một.

`KHO-BTP` (kho WIP) chưa bao giờ được dùng thật — WIP không quản tồn kho
(`docs/decisions/wip-not-stocked.md`), nên một trong ba kho seed sẵn là hàng chết ngay từ đầu.

## Quyết định

**Bỏ hẳn bảng `warehouses`, enum `warehouse_type`, module `warehouses`, và mọi cột `warehouseId`.**
Hệ thống không còn khái niệm kho — mọi tồn kho/phiếu/bút toán chỉ còn khoá theo `itemId`.

- `inventory_balances` unique theo `(itemId)` thay vì `(warehouseId, itemId)`.
- `inventory_transactions`/`inventory_receipts`/`inventory_issues`/`inventory_requisitions`/
  `supplier_returns` bỏ cột `warehouseId` + mọi index liên quan.
- `outsourcing_orders.warehouseId` (đã là cột chết, không ghi bút toán từ
  `docs/decisions/wip-not-stocked.md`) và `purchase_orders.receiptWarehouseId` bỏ hẳn.
- 4 hàm tự resolve kho (`resolveReceiptWarehouseId`, 2×`resolveFgWarehouseId`,
  `resolveReturnWarehouseId`) xoá — không còn gì để resolve.
- Gate IQC theo `(itemId, warehouseId)` (`hasPendingIqcForItems`,
  `docs/decisions/qc-gates-on-stock-moves.md`) thu hẹp còn theo `itemId` — vẫn giữ join sang
  `inventory_receipts` để chỉ tính IQC hàng nhập kho, không phải mọi IQC.
- FE bỏ hết dropdown/picker chọn kho ở phiếu nhập/xuất/lãnh vật tư.

## Vì sao không giữ bảng rồi seed cứng 1 dòng

Từng cân nhắc giữ `warehouses` với đúng 1 dòng seed cứng thay vì xoá hẳn — bị bác vì:

- FK vẫn phải có mặt ở 7 bảng, mọi `.select()`/join vẫn phải kéo cột đó ra dù luôn là cùng một giá
  trị — không giảm được độ phức tạp thật, chỉ che đi.
- 4 hàm resolve vẫn phải tồn tại (dù đơn giản hơn: luôn trả về đúng 1 dòng) — không xoá được rủi ro
  "0 hoặc >1 kho" đã từng gây `E238`/bỏ qua im lặng, chỉ dịch chuyển rủi ro sang "lỡ tay tạo kho thứ
  2".
- Không có tín hiệu nghiệp vụ nào (kho phế liệu, ký gửi NCC, chi nhánh...) cho thấy kho thứ 2 sẽ
  xuất hiện trong tương lai gần — xác nhận với user.

## Đừng hoàn lại

Nếu sau này thật sự cần nhiều kho (mở chi nhánh, tách kho ký gửi NCC...), đó là một thiết kế mới —
thêm lại `warehouseId` **có ý nghĩa thật** (không phải nhãn lọc như bản cũ), kèm UI chọn kho ở đúng
những luồng cần phân biệt, không phải khôi phục nguyên trạng bảng `warehouses` cũ.

## Related docs

`docs/domains/inventory.md`, `docs/decisions/wip-not-stocked.md` (vì sao WIP không có kho để bàn
tới), `docs/decisions/production-lifecycle-closing.md` (mất `E238`),
`docs/decisions/qc-gates-on-stock-moves.md` (gate D1 thu hẹp theo `itemId`).
