# Tính năng: Inventory (Kho thành phẩm)

## Mục đích

Theo dõi tồn kho thành phẩm (TP, `products.type = FINISHED_GOOD`) bằng mô hình sổ giao dịch: mọi biến động là một **phiếu nhập/xuất kho** (`stock_receipts` + dòng `stock_receipt_items`), số tồn luôn **tính lại từ các phiếu** tại thời điểm đọc — không có cột nào lưu số tồn. Đây là bước đầu của luồng "PO đã duyệt → LSX kiểm tra tồn TP và ra quyết định sản xuất": module này cung cấp phần "kiểm tra tồn", còn bước duyệt PO và module LSX là các phần việc riêng, làm sau.

Phạm vi hiện tại: **chỉ thành phẩm**, **một kho** duy nhất (không phân biệt nhiều kho vật lý), không theo dõi vật tư/bán thành phẩm, không giá vốn.

## Quy tắc nghiệp vụ

### Tồn không lưu ở đâu cả — luôn tính từ phiếu

Không có cột `onHand`/`stock`/`quantity` nào trên `products` hay bất kỳ bảng nào khác. `InventoryService` tính ba con số tại thời điểm đọc, hoàn toàn trong Postgres (không rút gọn bằng JS), cho mỗi thành phẩm:

```
onHand   = Σ IN.quantity − Σ OUT.quantity     (mọi phiếu chưa xoá mềm)
delivered(dòng PO) = Σ quantity của các dòng phiếu OUT trỏ orderItemId = dòng PO đó
reserved = Σ max(quantity − delivered(dòng PO), 0)
           (mọi dòng order_items status=NORMAL, thuộc đơn AWAITING_PRODUCTION/IN_PROGRESS chưa xoá mềm)
available = onHand − reserved
```

**Cập nhật 2026-07-29**: module duyệt PO đã có (`docs/features/orders.md`) — "đơn còn mở" nay là `status IN (AWAITING_PRODUCTION, IN_PROGRESS)`, tức đơn **đã được Giám đốc duyệt** (`OrdersService.approveOrder`). `DRAFT`/`PENDING_CONFIRMATION` (chưa duyệt) không giữ tồn — đúng như ghi chú "một dòng `WHERE`" đã dự tính từ trước ở `InventoryService.reservedSubquery`.

### Phiếu nhập/xuất, không có loại "điều chỉnh" riêng

`stock_receipts.type` chỉ có `IN`/`OUT` — dấu của biến động nằm hoàn toàn ở đây, `quantity` trên mọi dòng luôn dương (CHECK `chk_stock_receipt_items_quantity_positive`). Kiểm kê thừa ghi bằng phiếu `IN`/`STOCKTAKE`, kiểm kê thiếu ghi bằng phiếu `OUT`/`STOCKTAKE` — không cần thêm một loại phiếu "điều chỉnh" riêng.

`reason` phải thuộc đúng `type` — enforce ở cả DB (CHECK `chk_stock_receipts_reason_type`) lẫn service (`StockReceiptsService.ensureReasonMatchesType`, ném `E073` sạch thay vì để lộ lỗi constraint 500 thô):

| `type` | `reason` hợp lệ |
| --- | --- |
| `IN` | `PRODUCTION`, `OPENING`, `STOCKTAKE`, `OTHER` |
| `OUT` | `DELIVERY`, `STOCKTAKE`, `OTHER` |

### `orderItemId` — chỗ nối duy nhất sang `orders`

Một dòng phiếu **có thể** trỏ `orderItemId` tới một dòng `order_items` — chỉ hợp lệ trên phiếu `OUT` (bất kể `reason`, không chỉ riêng `DELIVERY`), và bắt buộc `productId` của dòng phiếu phải khớp `productId` của dòng đơn hàng đó (`E072` nếu không). Đây vừa là "reserved" tính được (xem công thức trên), vừa chính là **delivery tracking** mà `orders` hiện chưa có (`docs/features/orders.md` ghi `GET /orders/stats.completedValue` phải dùng `status = COMPLETED` làm proxy vì "chưa có bảng giao hàng/DO thật" — dữ liệu ở đây đủ để thay proxy đó, nhưng việc sửa `OrdersService` để dùng nó nằm ngoài phạm vi bản này).

**Nguồn phiếu `OUT`/`DELIVERY` thứ hai (2026-07-29): module LSX (`production-orders`).** Ngoài phiếu người dùng tự lập tay qua `POST /stock-receipts`, "Tạo LSX" (`docs/features/production.md`) cũng tự sinh một phiếu `OUT`/`DELIVERY` — một phiếu duy nhất cho cả lượt phát hành, mỗi dòng gắn `orderItemId` đúng cơ chế trên, ghi trực tiếp qua `stockReceipts`/`stockReceiptItems` (không qua `StockReceiptsService`). `InventoryService.getStockLevels`/`reservedSubquery` nhận thêm tham số tuỳ chọn `excludeOrderId` cho `ProductionOrdersService` tính "Khả dụng" của một PO mà không tự trừ nhu cầu của chính nó — `GET /inventory` không dùng tham số này.

### Chặn xuất kho làm tồn âm

`StockReceiptsService.ensureSufficientStock` tính tồn hiện tại theo `productId`, gộp số lượng các dòng `OUT` trong cùng yêu cầu, và từ chối (`E071`, 409) nếu kết quả sẽ âm. Áp dụng cho cả tạo mới lẫn sửa; khi sửa, tồn được tính **loại trừ chính các dòng hiện có của phiếu đang sửa** trước khi cộng dòng mới vào — nếu không sẽ đếm dòng cũ hai lần (một lần trong "tồn hiện tại", một lần bị xoá-rồi-chèn-lại).

### Phiếu sửa/xoá tự do

Không có luật khoá theo trạng thái kiểu `E065` của `orders` — một phiếu đã lập vẫn sửa/xoá được bất cứ lúc nào (xoá mềm). Việc chặn duy nhất là bất biến "không âm tồn" ở trên, áp dụng cho cả sửa. `items` trên `PATCH` là **replace-all**: gửi mảng mới (kể cả `[]`, xoá sạch dòng) thay hoàn toàn bộ dòng cũ; bỏ trống trường này thì giữ nguyên dòng hiện có.

### `GET /inventory` liệt kê mọi TP đang hoạt động, kể cả tồn 0

Danh sách chạy trên `products` (lọc `type=FINISHED_GOOD`, `status=ACTIVE`, chưa xoá mềm), **không phải** trên các sản phẩm từng có phiếu — một TP mới tạo, chưa từng nhập kho, vẫn xuất hiện với `onHand: 0`. Đúng nhu cầu của LSX: cần thấy cả những TP chưa từng sản xuất.

### Không có endpoint lịch sử riêng

Lịch sử biến động của một TP chính là `GET /stock-receipts?productId=<id>`.

## API contract

### `GET /inventory` — tồn kho theo thành phẩm

| Method | Path | Permission | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/inventory` | `inventory:read` | `GetInventoryReqDto` — `limit`, `page`, `q` (khớp mờ `code`/`name`), `order`, `productGroupId` | `200` + `InventoryItemResDto` phân trang |

`InventoryItemResDto`: `id`, `code`, `name`, `group` (nullable), `unit`, `image`, `onHand`, `reserved`, `available`.

### `GET/POST/PATCH/DELETE /stock-receipts` — phiếu nhập/xuất

| Method | Path | Permission | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/stock-receipts` | `inventory:read` | `GetStockReceiptsReqDto` — `limit`, `page`, `q` (khớp mờ `code`), `order`, `type`, `reason`, `productId`, `fromDate`/`toDate` (lọc theo `receiptDate`) | `200` + `StockReceiptResDto` phân trang |
| GET | `/stock-receipts/:receiptId` | `inventory:read` | — | `200` + `StockReceiptResDto` (kèm `items`) |
| POST | `/stock-receipts` | `inventory:create` | `CreateStockReceiptReqDto` — `code?`, `type*`, `reason*`, `receiptDate*`, `note?`, `items[]*` | `201` + `StockReceiptResDto` |
| PATCH | `/stock-receipts/:receiptId` | `inventory:update` | `UpdateStockReceiptReqDto` — như trên trừ `code` (bất biến), tất cả tuỳ chọn | `200` + `StockReceiptResDto` |
| DELETE | `/stock-receipts/:receiptId` | `inventory:delete` | — | `204`, không có body (xoá mềm) |

(`*` = bắt buộc)

- `code` tự sinh `PNxxxx` (nhập) / `PXxxxx` (xuất) nếu không truyền khi tạo, đếm riêng theo từng `type`; bất biến sau khi tạo.
- Danh sách sắp xếp **ngày chứng từ mới nhất trước**, cùng ngày thì `createdAt` mới nhất trước.
- `StockReceiptItemReqDto`: `productId*` (phải là `FINISHED_GOOD`), `quantity*` (dương), `orderItemId?` (chỉ hợp lệ trên phiếu `OUT`, phải khớp `productId`).
- Sau mọi lệnh ghi, service đọc lại phiếu bằng `getStockReceiptDetail(id)` rồi mới map — response luôn phản ánh trạng thái đã lưu.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| --- | --- | --- |
| Không tìm thấy phiếu | `ErrorCode.E067` | 404 |
| `code` phiếu đã tồn tại (chỉ khi tạo, `code` truyền lên) | `ErrorCode.E068` | 409 |
| `productId` trên dòng phiếu không tồn tại | `ErrorCode.E069` | 404 |
| `productId` tồn tại nhưng không phải `FINISHED_GOOD` | `ErrorCode.E070` | 400 |
| Phiếu xuất (tạo hoặc sửa) làm tồn một sản phẩm về âm | `ErrorCode.E071` | 409 |
| `orderItemId` không hợp lệ — gửi trên phiếu không phải `OUT`, không tồn tại, hoặc `productId` không khớp dòng đơn hàng | `ErrorCode.E072` | 400 |
| `reason` không thuộc `type` | `ErrorCode.E073` | 400 |
| Role của caller thiếu quyền mà route yêu cầu | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

Thứ tự kiểm khi `POST`: mã trùng (`E068`, chỉ khi `code` truyền lên) → `reason` thuộc `type` (`E073`) → từng dòng: sản phẩm tồn tại (`E069`) → là `FINISHED_GOOD` (`E070`) → `orderItemId` hợp lệ nếu có (`E072`) → nếu `type=OUT`: không làm âm tồn (`E071`). Khi `PATCH`: phiếu tồn tại (`E067`) → các kiểm còn lại như `POST` cho những trường thực sự được gửi.

## Vì sao thiết kế này mở rộng dễ

Tồn không lưu ở đâu cả nên mọi hướng mở rộng đều là *cộng thêm*, không phải migrate lại dữ liệu tồn đã lưu:

| Mở rộng sau này | Việc phải làm |
| --- | --- |
| Nhiều kho | thêm `warehouseId` vào `stock_receipts`, `GROUP BY` thêm một chiều trong `InventoryService` |
| Tồn vật tư / bán thành phẩm | thêm `materialId` nullable trên `stock_receipt_items` + CHECK, đúng khuôn `bom_items` đang dùng cho `productId`/`materialId` |
| Giữ hàng thủ công không gắn PO | thêm bảng riêng, cộng vào công thức `reserved` |
| Khoá sổ / bút toán đảo (thay vì sửa/xoá tự do) | chặn `PATCH`/`DELETE` theo điều kiện, không đổi bảng |

## Ngoài phạm vi bản này

Tồn vật tư/bán thành phẩm · nhiều kho vật lý · giá vốn/giá trị tồn · kiểm kê định kỳ có quy trình riêng · lô/serial/hạn dùng · sửa `GET /orders/stats` để dùng delivery tracking thật từ `orderItemId` thay vì proxy `status = COMPLETED`.

(Module LSX — kiểm tra tồn + ra quyết định sản xuất trên một PO đã duyệt — đã được xây, xem `docs/features/production.md`; không còn nằm ngoài phạm vi.)

## Xem thêm

- `orders` — nguồn `order_items`/`orderItemId` cho "reserved" và cho việc liên kết dòng xuất kho với dòng đơn hàng; xem `docs/features/orders.md`.
- `production` — module LSX, nguồn phiếu `OUT`/`DELIVERY` thứ hai và người dùng `excludeOrderId` trên `getStockLevels`; xem `docs/features/production.md`.
- `products` — nguồn thành phẩm (`type = FINISHED_GOOD`); `products.md` mô tả `type`/`unitId`/vòng đời sản phẩm.
