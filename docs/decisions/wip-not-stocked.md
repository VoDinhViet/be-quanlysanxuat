# Kho không quản tồn bán thành phẩm (WIP)

**Trạng thái:** còn hiệu lực

## Bối cảnh

`POST /outsourcing-orders` (OS-OUT) từng trừ tồn kho cho mặt hàng suy từ node BOM của công đoạn
được chọn. Công đoạn chỉ gắn được vào node không phải RM (`E063`) và node không được là FG (`E053`)
— nên mặt hàng gửi gia công ngoài trên thực tế luôn là WIP. Nhưng không luồng nào trong hệ thống
nhập WIP vào kho: `startJob` không lập phiếu kho, không có route "hoàn thành Job" sinh phiếu nhập,
seed chỉ tạo tồn cho RM. Tồn WIP luôn bằng 0, nên mọi `POST /outsourcing-orders` đều trả `409 E106`
— hệ quả tất yếu của thiết kế cũ, không phải bug ngẫu nhiên.

Nghiệp vụ thật: kho chỉ quản thành phẩm (FG) và vật tư (RM). Bán thành phẩm là hàng dở dang trên
chuyền hoặc đang ở NCC gia công — không có sổ tồn kho.

## Quyết định

**WIP không bao giờ đụng `inventory_balances`/`inventory_transactions`, và mặc định không hiện
trên các route liệt kê tồn kho.**

- `OutsourcingOrdersService`/`OutsourcingReceiptsService` (`create`/`cancel`) không gọi
  `InventoryPostingService.postDocument`/`reverseDocument`. Gia công ngoài chỉ theo dõi SL gửi/nhận
  qua `outsourcing_order_items`/`outsourcing_receipt_items` — `E184`/`E172` đọc thẳng 2 bảng dòng
  này, không đọc sổ cái.
- `SupplierReturnsService.shouldPostStock` trả `false` khi phiếu trả sinh từ IQC của OS-IN
  (`outsourcingReceiptId` có giá trị) — hàng đó chưa từng vào tồn nên trừ ra cũng sai, cùng lý do áp
  dụng cho nhánh "phiếu nhập gốc chưa `POSTED`".
- `GET /inventory-products`/`GET /inventory-materials` (danh mục FG/RM) không nhận `itemType=WIP` —
  cứng FG/RM theo route. `GET /inventory/balances` giữ hành vi cũ hơn: bỏ trống `itemType` trả FG/RM,
  gửi tường minh `itemType=WIP` vẫn xem được (luôn rỗng, chỉ để đối chiếu/debug). `GET
  /inventory/transactions` không đổi — vẫn liệt kê mọi loại.
- `WarehousesService.ensureWarehouseNotInUse` kiểm tồn tại trực tiếp trên
  `outsourcing_orders`/`supplier_returns` theo `warehouseId` — vì đường gián tiếp qua
  `inventory_transactions` (từng có do `create` gọi `postDocument`) đã biến mất.

## Giữ nguyên, không đổi

- `InventoryReferenceType.OUTSOURCING_ORDER`/`OUTSOURCING_RECEIPT` vẫn còn trong pgEnum (gỡ phải
  migrate cột dùng chung 5 bảng), chỉ không còn nguồn nào phát sinh giá trị mới.
- `warehouseId` trên `outsourcing_orders` — vẫn là thông tin "hàng đi khỏi kho nào", chỉ không còn
  dùng để ghi bút toán.
- `ensureWarehouseActive`, `E184`/`E172`, `E169`/`E173` chặn `cancel`.
- Phiếu nhập/xuất kho lập tay không bị chặn cứng chọn WIP — người dùng vẫn tự chọn được nếu muốn,
  chỉ là kho không quản tồn đó theo mặc định.

## `outsourcing_receipts` không giữ `warehouseId`

Khác `outsourcing_orders`, OS-IN **không có cột `warehouseId`** — phiếu nhận gia công ngoài không
cần biết hàng về kho nào (hàng gia công về thẳng chuyền/NCC tiếp theo, không nhập kho vật lý). Hệ
quả: `IqcService.resolveReturnWarehouseId` chỉ còn `inventoryReceipt.warehouseId ??
purchaseOrder.receiptWarehouseId ?? null` — IQC FAIL với `disposition=RETURN` sinh từ một phiếu
OS-IN **luôn** trả `E163` (không xác định được kho nguồn) cho tới khi có thiết kế khác (một điểm
nhập kho riêng cho hàng gia công ngoài, hoặc chọn tay kho trả hàng). Chấp nhận có chủ ý.

## Đừng hoàn lại

Nếu sau này thật sự cần quản tồn WIP, thiết kế đúng là thêm **một nguồn nhập WIP** trước (ví dụ
phiếu nhập từ một bước hoàn thành công đoạn/Job), rồi mới cân nhắc gia công ngoài có nên ghi bút
toán hay không — không phải bật lại `postDocument` trong `createOutsourcingOrder`/
`createOutsourcingReceipt` như cũ, vì tồn WIP vẫn sẽ luôn bắt đầu từ 0 và `E106` sẽ quay lại y hệt.

## Related docs

`docs/decisions/outsourcing-no-draft.md` (quyết định liền trước — không đảo ngược gì ở đó, chỉ bỏ
tiếp phần ghi bút toán). `docs/domains/inventory.md`, `docs/workflows/outsourcing-round-trip.md`,
`docs/workflows/supplier-return.md`.
