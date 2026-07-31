# Lập phiếu nhập / xuất kho

Con đường **duy nhất** làm tồn kho thay đổi. Không có nghiệp vụ nào khác trong hệ thống tự động
sinh chứng từ kho. Mô hình tính tồn từ sổ chứng từ ở `docs/domains/inventory.md`.

## Trigger

`POST /stock-receipts` (lập), `PATCH /stock-receipts/:receiptId` (sửa),
`DELETE /stock-receipts/:receiptId` (xoá mềm) — tất cả do người dùng chủ động, luôn là thao tác tay.

Một phiếu phục vụ một trong sáu tình huống nghiệp vụ, xác định bởi bộ ba `subject` + `type` +
`reason`:

| Nghiệp vụ | subject | type | reason |
| --- | --- | --- | --- |
| Nhập thành phẩm từ sản xuất | `FINISHED_GOOD` | `IN` | `PRODUCTION` |
| Giao hàng cho khách | `FINISHED_GOOD` | `OUT` | `DELIVERY` |
| Nhập mua vật tư | `MATERIAL` | `IN` | `PURCHASE` |
| Xuất vật tư cho sản xuất | `MATERIAL` | `OUT` | `PRODUCTION_ISSUE` |
| Tồn đầu kỳ | cả hai | `IN` | `OPENING` |
| Kiểm kê thừa / thiếu | cả hai | `IN` / `OUT` | `STOCKTAKE` |

Bộ ba này bị ràng buộc ở **cả** DB CHECK lẫn service.

## Actor

`inventory:create` / `inventory:update` / `inventory:delete`. Không có quyền duyệt phiếu — lập là
xong, không ai ký.

⚠️ Không role seed nào có `inventory:*`, kể cả role `WAREHOUSE` (chỉ có `materials:*`). Xem
`docs/domains/identity-access.md`.

## Preconditions

Không có precondition trạng thái — phiếu không có vòng đời, sửa/xoá được bất cứ lúc nào. Toàn bộ
điều kiện là validate nội dung, chạy **trước** transaction theo đúng thứ tự này:

1. `code` gửi tay → kiểm trùng; không gửi → sinh theo `subject`+`type` (`PN`/`PX` cho thành phẩm,
   `PNVT`/`PXVT` cho vật tư, đếm riêng từng cặp).
2. `reason` khớp cặp (`subject`, `type`) — `E073`.
3. Mọi dòng khớp `subject` của header (`E086`), và mặt hàng tồn tại: thành phẩm phải là
   `FINISHED_GOOD`, vật tư phải tồn tại.
4. `orderItemId` (nếu có) chỉ hợp lệ trên dòng thành phẩm của phiếu `OUT` và phải cùng `productId`
   với dòng đơn — `E072`.
5. Riêng phiếu `OUT`: kiểm tồn đủ (`E071`).

## Flow

1. Chạy hết phần validate ở trên (toàn bộ là đọc).
2. **Transaction**: ghi header + toàn bộ dòng phiếu.
3. Đọc lại chi tiết phiếu để trả về.

`PATCH` cùng khuôn, khác ba điểm:

- `items` là **replace-all** — xoá sạch dòng cũ rồi ghi lại; không gửi `items` thì dòng cũ nguyên vẹn.
- Kiểm tồn đủ **loại trừ chính các dòng hiện có của phiếu này**, nếu không sẽ đếm hàng của chính nó
  hai lần và chặn nhầm thao tác hợp lệ.
- `subject` bất biến; `type`/`reason` đổi được nhưng vẫn phải khớp cặp.

`DELETE` là xoá mềm một lệnh: phiếu rơi khỏi mọi phép tính tồn ngay lập tức.

## State changes

**Không entity nào đổi trạng thái.** Phiếu không có `DRAFT`/`POSTED`/`LOCKED`, và không thao tác
nào ở đây đổi trạng thái đơn hàng, LSX hay Job.

Thứ thay đổi là **số liệu phái sinh**, tính lại ở mỗi lần đọc:

- `onHand` đổi ngay sau khi phiếu được ghi.
- `reserved` chỉ đổi khi dòng phiếu `OUT` có `orderItemId` — đây là cơ chế duy nhất báo cho hệ
  thống biết một dòng đơn đã giao được bao nhiêu.

## Side effects

Chỉ `stock_receipts` + `stock_receipt_items`. Không log, không thông báo, không đụng đơn hàng.

Hai điều **không** xảy ra dù trực giác nghiệp vụ mong đợi:

- Giao đủ hàng cho một đơn **không** tự đẩy đơn sang `COMPLETED` — vẫn phải `PATCH` tay.
- Nhập mua vật tư **không** gắn với nhà cung cấp nào: phiếu không có `supplierId`, và hệ thống
  không có đơn mua hàng. Xem `docs/decisions/no-procurement.md`.

## Transaction boundary

Bao đúng header + dòng phiếu. Cần có vì một phiếu đã commit mà không có dòng nào sẽ âm thầm không
đóng góp gì vào sổ — đúng thứ nó sinh ra để ghi lại.

Kiểm tồn chạy **ngoài** transaction: hai phiếu xuất song song cùng một mặt hàng đều thấy đủ tồn và
cùng ghi thành công, tồn có thể xuống âm. Không có constraint DB nào chặn được điều này (tồn là số
tính lại, không phải cột). Đây là giới hạn đã biết, chưa xử lý.

## Failure cases

| Tình huống | Mã | HTTP |
| --- | --- | --- |
| Phiếu không tồn tại / đã xoá mềm | `E067` | 404 |
| `reason` không khớp cặp `subject`+`type` | `E073` | 400 |
| Dòng phiếu không khớp `subject` của header | `E086` | 400 |
| `orderItemId` sai chỗ hoặc lệch `productId` | `E072` | 400 |
| Xuất làm tồn âm | `E071` | 400 |

`E071` gộp mọi dòng `OUT` trong cùng một request theo mặt hàng trước khi so — gửi ba dòng nhỏ để
lách tổng sẽ không qua được.

## Business rules

- Vì sao không có loại phiếu "điều chỉnh", và kiểm kê ghi bằng `IN`/`OUT` + `STOCKTAKE` →
  `docs/domains/inventory.md`.
- Vì sao `reserved` chỉ tính đơn đã duyệt → cùng file.
- Vì sao `reserved`/`bomDemand` của vật tư luôn bằng 0 → cùng file.

## Related domains

`inventory` là chủ; đọc `orders` (qua `orderItemId`) và `product-structure`/`materials` (mặt hàng).
Không domain nào ghi ngược vào đây — kể cả `production`.

Code: `StockReceiptsService.createStockReceipt`/`updateStockReceipt`/`deleteStockReceipt`,
`InventoryService.getInventory`/`getMaterialInventory`/`getStockLevels`.
