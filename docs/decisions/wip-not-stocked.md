# Kho không quản tồn bán thành phẩm (WIP)

**Trạng thái:** còn hiệu lực

## Bối cảnh

`POST /outsourcing-orders` (OS-OUT) trừ tồn kho cho mặt hàng suy từ node BOM của công đoạn được
chọn. Công đoạn chỉ gắn được vào node **không phải RM** (`E063`) và node BOM không được là FG
(`E053`) — nên mặt hàng gửi gia công ngoài trên thực tế **luôn là WIP**. Nhưng không luồng nào trong
hệ thống nhập WIP vào kho: `ProductionJobsService.startJob` không lập phiếu kho, không có route
"hoàn thành Job" sinh phiếu nhập, seed chỉ tạo tồn cho RM. Tồn WIP luôn bằng 0, nên **mọi** `POST
/outsourcing-orders` đều trả `409 E106` (thiếu tồn) — không phải bug ngẫu nhiên, là hệ quả tất yếu
của thiết kế cũ.

Nghiệp vụ thật của nhà máy: **kho chỉ quản thành phẩm (FG) và vật tư (RM)**. Bán thành phẩm là hàng
đang dở dang trên chuyền hoặc đang ở NCC gia công, không có sổ tồn kho — không nhập, không xuất,
không tồn.

## Quyết định

**WIP không bao giờ đụng `inventory_balances`/`inventory_transactions`, và mặc định không hiện trên
2 route liệt kê tồn kho.**

- `OutsourcingOrdersService.createOutsourcingOrder`/`cancelOutsourcingOrder` và
  `OutsourcingReceiptsService.createOutsourcingReceipt`/`cancelOutsourcingReceipt` **không còn gọi**
  `InventoryPostingService.postDocument`/`reverseDocument`. Gia công ngoài giờ chỉ còn theo dõi SL
  gửi/nhận theo `outsourcing_order_items`/`outsourcing_receipt_items` (E184/E172 không đổi — hai
  hàm đó đọc thẳng hai bảng dòng, không đọc sổ cái).
- `SupplierReturnsService.shouldPostStock` trả `false` khi phiếu trả sinh từ IQC của OS-IN
  (`outsourcingReceiptId` có giá trị) — hàng đó chưa từng vào tồn nên trừ ra cũng sai, cùng lý do
  đã áp dụng cho nhánh "phiếu nhập gốc chưa `POSTED`".
- `GET /inventory` + `GET /inventory/balances` mặc định lọc `itemType IN (FG, RM)` khi client không
  gửi `itemType` — gửi tường minh `itemType=WIP` vẫn xem được (chỉ để đối chiếu/debug, sẽ luôn rỗng
  vì không nguồn nào ghi tồn WIP). `GET /inventory/transactions` **không đổi** — vẫn liệt kê mọi
  loại, kể cả khi kết quả rỗng cho WIP.
- `WarehousesService.ensureWarehouseNotInUse` thêm kiểm tồn tại trực tiếp trên
  `outsourcing_orders`/`supplier_returns` theo `warehouseId` — trước đây một kho chỉ những bảng này
  tham chiếu vẫn bị chặn xoá **gián tiếp** qua `inventory_transactions` (vì `create` luôn
  `postDocument`); sau thay đổi này đường gián tiếp đó biến mất, phải kiểm thẳng. `outsourcing_
  receipts` không còn trong danh sách này — xem mục "Cập nhật" bên dưới, cột đã bị xoá hẳn.

## Giữ nguyên, không đổi

- `InventoryReferenceType.OUTSOURCING_ORDER`/`OUTSOURCING_RECEIPT` — vẫn còn trong pgEnum (gỡ phải
  migrate cả cột dùng chung 5 bảng), `GET /inventory/transactions?referenceType=` vẫn nhận được, chỉ
  không còn nguồn nào phát sinh giá trị mới.
- `warehouseId` trên `outsourcing_orders` — vẫn là thông tin "hàng đi khỏi kho nào", chỉ không còn
  dùng để ghi bút toán. `outsourcing_receipts` **không còn** giữ field này — xem mục "Cập nhật".
- `ensureWarehouseActive`, `E184`/`E172` và cả hai lượt validate (mềm trước insert + chốt thật trên
  dữ liệu vừa insert), `E169`/`E173` chặn `cancel`.
- Phiếu nhập/xuất kho lập tay **không** bị chặn cứng chọn WIP — người dùng vẫn tự chọn được nếu thật
  sự muốn, chỉ là kho không quản tồn đó theo mặc định.

## Cập nhật — bỏ hẳn `warehouseId` khỏi `outsourcing_receipts`

Quyết định gốc ở trên (mục "Giữ nguyên, không đổi") từng chủ ý **giữ** `warehouseId` trên
`outsourcing_receipts` làm metadata "hàng về kho nào", dù không còn dùng để ghi bút toán. Quyết định
đó đã bị **đảo ngược** — riêng cho `outsourcing_receipts` (OS-IN), không áp dụng cho
`outsourcing_orders` (OS-OUT), vì phiếu nhận gia công ngoài không cần biết hàng về kho nào (nghiệp
vụ thật: hàng gia công về thẳng chuyền/NCC tiếp theo, không nhập kho vật lý).

- Xoá hẳn cột `warehouse_id` khỏi bảng `outsourcing_receipts` (migration
  `drizzle/0112_ambitious_apocalypse.sql`), cùng FK, index, và `warehouse` relation.
- `CreateOutsourcingReceiptReqDto`/`GetOutsourcingReceiptsReqDto`/`OutsourcingReceiptBaseResDto`
  không còn field `warehouseId`/`warehouse`. `createOutsourcingReceipt` không còn gọi
  `ensureWarehouseActive`, không còn filter theo `warehouseId`.
- `IqcService.resolveReturnWarehouseId` mất nhánh fallback đọc `outsourcingReceipt.warehouseId` —
  giờ chỉ còn `inventoryReceipt.warehouseId ?? purchaseOrder.receiptWarehouseId ?? null`. Hệ quả:
  IQC FAIL với disposition RETURN sinh từ một phiếu OS-IN **luôn** trả `E163` (không xác định được
  kho nguồn) cho tới khi có thiết kế khác (một điểm nhập kho riêng cho hàng gia công ngoài, hoặc
  cho chọn tay kho trả hàng). Regression này được chấp nhận có chủ ý, không phải bug bỏ sót.

## Đừng hoàn lại

Nếu sau này thật sự cần quản tồn WIP, thiết kế đúng là thêm **một nguồn nhập WIP** trước (ví dụ
phiếu nhập từ một bước hoàn thành công đoạn/Job), rồi mới cân nhắc lại việc gia công ngoài có nên
ghi bút toán hay không — không phải bật lại `postDocument` trong `createOutsourcingOrder`/
`createOutsourcingReceipt` như cũ, vì khi đó tồn WIP vẫn sẽ luôn bắt đầu từ 0 và lỗi `E106` sẽ quay
lại y hệt.

## Related docs

`docs/decisions/outsourcing-no-draft.md` (quyết định liền trước, gộp `post` vào `create` — quyết
định này không đảo ngược gì ở đó, chỉ bỏ tiếp phần ghi bút toán). `docs/domains/inventory.md`,
`docs/workflows/outsourcing-round-trip.md`, `docs/workflows/supplier-return.md`.
