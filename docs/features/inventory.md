# Tính năng: Inventory (Kho thành phẩm & Kho vật tư)

## Mục đích

Theo dõi tồn kho bằng mô hình sổ giao dịch: mọi biến động là một **phiếu nhập/xuất kho** (`stock_receipts` + dòng `stock_receipt_items`), số tồn luôn **tính lại từ các phiếu** tại thời điểm đọc — không có cột nào lưu số tồn. Đây là bước đầu của luồng "PO đã duyệt → LSX kiểm tra tồn TP và ra quyết định sản xuất": module này cung cấp phần "kiểm tra tồn", còn bước duyệt PO và module LSX là các phần việc riêng, làm sau.

Phạm vi hiện tại: **thành phẩm** (`products.type = FINISHED_GOOD`) **và vật tư** (`materials`, thêm 2026-07-30 — xem "Tồn kho vật tư" bên dưới), **một kho** duy nhất (không phân biệt nhiều kho vật lý), không theo dõi bán thành phẩm (WIP), không giá vốn. Cả hai loại dùng chung một sổ giao dịch (`stock_receipts`), phân biệt bằng cột `subject` (xem "Phiếu nhập/xuất" bên dưới) — không phải hai bảng riêng.

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

**`subject` (2026-07-30) — một sổ, hai kho.** `stock_receipts.subject` (`FINISHED_GOOD`/`MATERIAL`) tách phiếu thành phẩm và phiếu vật tư, **bất biến** sau khi tạo (cùng luật với `code`). Mỗi dòng `stock_receipt_items` mang đúng-một-trong `productId`/`materialId`, khớp `subject` của phiếu cha — CHECK `chk_stock_receipt_items_target` chỉ đảm bảo "đúng một trong hai" (không đọc được row cha), khớp đúng `subject` là việc của service (`StockReceiptsService.ensureItemsMatchSubject`, `E086`). Mã phiếu theo `subject`: `PNxxxx`/`PXxxxx` (thành phẩm) vs `PNVTxxxx`/`PXVTxxxx` (vật tư) — đếm riêng theo từng cặp (`subject`, `type`) nên hai kho không tranh số thứ tự. Phiếu cũ trước ngày này backfill về `FINISHED_GOOD` qua default cột.

`reason` phải thuộc đúng cặp (`subject`, `type`) — enforce ở cả DB (CHECK `chk_stock_receipts_reason_type`, 3 chiều) lẫn service (`StockReceiptsService.ensureReasonMatchesSubjectAndType`, ném `E073` sạch thay vì để lộ lỗi constraint 500 thô):

| `subject` | `type` | `reason` hợp lệ |
| --- | --- | --- |
| `FINISHED_GOOD` | `IN` | `PRODUCTION`, `OPENING`, `STOCKTAKE`, `OTHER` |
| `FINISHED_GOOD` | `OUT` | `DELIVERY`, `STOCKTAKE`, `OTHER` |
| `MATERIAL` | `IN` | `PURCHASE`, `OPENING`, `STOCKTAKE`, `OTHER` |
| `MATERIAL` | `OUT` | `PRODUCTION_ISSUE`, `STOCKTAKE`, `OTHER` |

### `orderItemId` — chỗ nối duy nhất sang `orders`

Một dòng phiếu **có thể** trỏ `orderItemId` tới một dòng `order_items` — chỉ hợp lệ trên phiếu `OUT` (bất kể `reason`, không chỉ riêng `DELIVERY`), và bắt buộc `productId` của dòng phiếu phải khớp `productId` của dòng đơn hàng đó (`E072` nếu không). Đây vừa là "reserved" tính được (xem công thức trên), vừa chính là **delivery tracking** mà `orders` hiện chưa có (`docs/features/orders.md` ghi `GET /orders/stats.completedValue` phải dùng `status = COMPLETED` làm proxy vì "chưa có bảng giao hàng/DO thật" — dữ liệu ở đây đủ để thay proxy đó, nhưng việc sửa `OrdersService` để dùng nó nằm ngoài phạm vi bản này). `orderItemId` **không có ý nghĩa gì trên dòng vật tư** (`subject=MATERIAL`) — nó là chỗ nối tới nhu cầu thành phẩm của đơn hàng, nên bị từ chối thẳng (`E072`) trên mọi dòng vật tư, bất kể `type`.

**Nguồn phiếu `OUT`/`DELIVERY` thứ hai (2026-07-29): module LSX (`production-orders`).** Ngoài phiếu người dùng tự lập tay qua `POST /stock-receipts`, "Tạo LSX" (`docs/features/production.md`) cũng tự sinh một phiếu `OUT`/`DELIVERY` — một phiếu duy nhất cho cả lượt phát hành, mỗi dòng gắn `orderItemId` đúng cơ chế trên, ghi trực tiếp qua `stockReceipts`/`stockReceiptItems` (không qua `StockReceiptsService`). `InventoryService.getStockLevels`/`reservedSubquery` nhận thêm tham số tuỳ chọn `excludeOrderId` cho `ProductionOrdersService` tính "Khả dụng" của một PO mà không tự trừ nhu cầu của chính nó — `GET /inventory` không dùng tham số này.

### Chặn xuất kho làm tồn âm

`StockReceiptsService.ensureSufficientStock` tính tồn hiện tại theo **`(productId, materialId)`** (đúng-một-trong-hai trên mỗi dòng, gộp thành một khoá qua `stockLineKey`, xem "`subject` — một sổ, hai kho" ở trên — vật tư dùng chung bất biến này với thành phẩm kể từ 2026-07-30), gộp số lượng các dòng `OUT` trong cùng yêu cầu, và từ chối (`E071`, 409) nếu kết quả sẽ âm. Áp dụng cho cả tạo mới lẫn sửa; khi sửa, tồn được tính **loại trừ chính các dòng hiện có của phiếu đang sửa** trước khi cộng dòng mới vào — nếu không sẽ đếm dòng cũ hai lần (một lần trong "tồn hiện tại", một lần bị xoá-rồi-chèn-lại).

### Phiếu sửa/xoá tự do

Không có luật khoá theo trạng thái kiểu `E065` của `orders` — một phiếu đã lập vẫn sửa/xoá được bất cứ lúc nào (xoá mềm). Việc chặn duy nhất là bất biến "không âm tồn" ở trên, áp dụng cho cả sửa. `items` trên `PATCH` là **replace-all**: gửi mảng mới (kể cả `[]`, xoá sạch dòng) thay hoàn toàn bộ dòng cũ; bỏ trống trường này thì giữ nguyên dòng hiện có.

### `GET /inventory` liệt kê mọi TP đang hoạt động, kể cả tồn 0

Danh sách chạy trên `products` (lọc `type=FINISHED_GOOD`, `status=ACTIVE`, chưa xoá mềm), **không phải** trên các sản phẩm từng có phiếu — một TP mới tạo, chưa từng nhập kho, vẫn xuất hiện với `onHand: 0`. Đúng nhu cầu của LSX: cần thấy cả những TP chưa từng sản xuất.

### Không có endpoint lịch sử riêng

Lịch sử biến động của một TP chính là `GET /stock-receipts?productId=<id>`; của một vật tư là `GET /stock-receipts?materialId=<id>`.

## Tồn kho vật tư (2026-07-30)

`GET /inventory/materials` — song song `GET /inventory` (thành phẩm) nhưng chạy trên `materials` thay vì `products`, và **không thể** phân trang trước rồi tra tồn riêng cho từng trang như `getInventory` đang làm: filter `status` chạy trên một giá trị tính (`available`/`minStock`), nên toàn bộ join + tính toán nằm gọn trong **một** câu `.select()`, dùng lại cùng `where` cho cả trang dữ liệu lẫn `count()` (`InventoryService.getMaterialInventory`).

Công thức mỗi vật tư:

```
onHand    = Σ IN.quantity − Σ OUT.quantity     (mọi phiếu subject=MATERIAL chưa xoá mềm)
reserved  = 0                                  (chưa có Phiếu lãnh vật tư — đợt sau)
issuable  = onHand − reserved                  (= onHand ở đợt này)
bomDemand = 0                                  (chưa nổ BOM — đợt sau)
available = onHand − bomDemand                 (= onHand ở đợt này)
status    = SHORTAGE  nếu available < 0
          | WARNING   nếu 0 <= available < minStock
          | NORMAL    nếu available >= minStock
```

`reserved`/`bomDemand` là **chỗ cắm sẵn**, không phải field bỏ hờ — `MaterialInventoryItemResDto` luôn trả cả hai, giá trị `0` là hệ quả của phạm vi đợt này (chưa có Phiếu lãnh vật tư cho `reserved`, chưa nổ BOM đa cấp cho `bomDemand`), không phải bug. Vì `available = onHand` ở đợt này, và `ensureSufficientStock` đã chặn tồn âm từ trước, `status = SHORTAGE` **chưa bao giờ xuất hiện thực tế** — chỉ `NORMAL`/`WARNING` — cho tới khi `bomDemand` được nổ BOM thật.

`asOfDate` (tuỳ chọn): tính tồn **tại thời điểm 23:59 ngày đó** — chỉ gộp phiếu có `receiptDate <= asOfDate` (`InventoryService.materialStockSubquery`); bỏ trống = tồn hiện tại.

`GetMaterialInventoryReqDto`: `limit`, `page`, `q` (khớp mờ `code`/`name`), `materialGroupId`, `type` (`INTERNAL`/`CLIENT`), `supplierId` (lọc theo `materials.supplierId` — nhà cung cấp chính, không phải bảng nhiều-nhiều), `status` (`MaterialStockStatus`), `asOfDate`. Danh sách chạy trên mọi vật tư `status=ACTIVE` (không lọc theo đã từng có phiếu hay chưa, cùng lý do với `GET /inventory`), sắp `asc(code)`.

`MaterialInventoryItemResDto`: `id`, `code`, `name`, `type`, `unit`, `group`, `supplier` (nullable), `image` (nullable), `onHand`, `reserved`, `issuable`, `bomDemand`, `available`, `minStock`, `status`.

**Một kho duy nhất** (không có filter "Kho" như ảnh thiết kế) — thêm nhiều kho sau này là thuần cộng thêm `warehouseId`, không migrate lại tồn đã tính (tồn không lưu ở đâu cả, xem "Vì sao thiết kế này mở rộng dễ").

## API contract

### `GET /inventory` — tồn kho theo thành phẩm

| Method | Path | Permission | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/inventory` | `inventory:read` | `GetInventoryReqDto` — `limit`, `page`, `q` (khớp mờ `code`/`name`), `order`, `productGroupId` | `200` + `InventoryItemResDto` phân trang |

`InventoryItemResDto`: `id`, `code`, `name`, `group` (nullable), `unit`, `image`, `onHand`, `reserved`, `available`.

### `GET /inventory/materials` — tồn kho theo vật tư (2026-07-30)

| Method | Path | Permission | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/inventory/materials` | `inventory:read` | `GetMaterialInventoryReqDto` — `limit`, `page`, `q`, `materialGroupId`, `type`, `supplierId`, `status`, `asOfDate` | `200` + `MaterialInventoryItemResDto` phân trang |

Xem "Tồn kho vật tư" ở trên cho công thức + field đầy đủ.

### `GET/POST/PATCH/DELETE /stock-receipts` — phiếu nhập/xuất

| Method | Path | Permission | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/stock-receipts` | `inventory:read` | `GetStockReceiptsReqDto` — `limit`, `page`, `q` (khớp mờ `code`), `order`, `subject`, `type`, `reason`, `productId`, `materialId`, `fromDate`/`toDate` (lọc theo `receiptDate`) | `200` + `StockReceiptResDto` phân trang |
| GET | `/stock-receipts/:receiptId` | `inventory:read` | — | `200` + `StockReceiptResDto` (kèm `items`) |
| POST | `/stock-receipts` | `inventory:create` | `CreateStockReceiptReqDto` — `code?`, `subject*`, `type*`, `reason*`, `receiptDate*`, `note?`, `items[]*` | `201` + `StockReceiptResDto` |
| PATCH | `/stock-receipts/:receiptId` | `inventory:update` | `UpdateStockReceiptReqDto` — như trên trừ `code`/`subject` (bất biến), tất cả tuỳ chọn | `200` + `StockReceiptResDto` |
| DELETE | `/stock-receipts/:receiptId` | `inventory:delete` | — | `204`, không có body (xoá mềm) |

(`*` = bắt buộc)

- `subject` (`FINISHED_GOOD`/`MATERIAL`) bắt buộc khi tạo, **bất biến** sau đó — cùng luật với `code`.
- `code` tự sinh theo `subject`: `PNxxxx`/`PXxxxx` (thành phẩm) hoặc `PNVTxxxx`/`PXVTxxxx` (vật tư) nếu không truyền khi tạo, đếm riêng theo từng cặp (`subject`, `type`); bất biến sau khi tạo.
- Danh sách sắp xếp **ngày chứng từ mới nhất trước**, cùng ngày thì `createdAt` mới nhất trước.
- `StockReceiptItemReqDto`: đúng-một-trong `productId?` (phải là `FINISHED_GOOD`, chỉ gửi trên phiếu `subject=FINISHED_GOOD`) / `materialId?` (chỉ gửi trên phiếu `subject=MATERIAL`), `quantity*` (dương), `orderItemId?` (chỉ hợp lệ trên dòng thành phẩm của phiếu `OUT`, phải khớp `productId`; luôn bị từ chối trên dòng vật tư).
- Sau mọi lệnh ghi, service đọc lại phiếu bằng `getStockReceiptDetail(id)` rồi mới map — response luôn phản ánh trạng thái đã lưu.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| --- | --- | --- |
| Không tìm thấy phiếu | `ErrorCode.E067` | 404 |
| `code` phiếu đã tồn tại (chỉ khi tạo, `code` truyền lên) | `ErrorCode.E068` | 409 |
| `productId` trên dòng phiếu không tồn tại | `ErrorCode.E069` | 404 |
| `productId` tồn tại nhưng không phải `FINISHED_GOOD` | `ErrorCode.E070` | 400 |
| Phiếu xuất (tạo hoặc sửa) làm tồn một sản phẩm/vật tư về âm | `ErrorCode.E071` | 409 |
| `orderItemId` không hợp lệ — gửi trên phiếu không phải `OUT`, không tồn tại, hoặc `productId` không khớp dòng đơn hàng, hoặc gửi trên dòng vật tư | `ErrorCode.E072` | 400 |
| `reason` không thuộc cặp (`subject`, `type`) | `ErrorCode.E073` | 400 |
| `materialId` trên dòng phiếu không tồn tại | `ErrorCode.E085` | 404 |
| Dòng phiếu gửi sai loại so với `subject` của phiếu cha (gửi `productId` trên phiếu vật tư, `materialId` trên phiếu thành phẩm, gửi cả hai, hoặc không gửi gì) | `ErrorCode.E086` | 400 |
| Role của caller thiếu quyền mà route yêu cầu | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

Thứ tự kiểm khi `POST`: mã trùng (`E068`, chỉ khi `code` truyền lên) → `reason` thuộc `subject`+`type` (`E073`) → từng dòng: khớp `subject` (`E086`) → rồi rẽ theo loại — thành phẩm: tồn tại (`E069`) → là `FINISHED_GOOD` (`E070`) → `orderItemId` hợp lệ nếu có (`E072`); vật tư: tồn tại (`E085`) → không có `orderItemId` (`E072`) → nếu `type=OUT`: không làm âm tồn (`E071`). Khi `PATCH`: phiếu tồn tại (`E067`) → các kiểm còn lại như `POST` cho những trường thực sự được gửi.

## Vì sao thiết kế này mở rộng dễ

Tồn không lưu ở đâu cả nên mọi hướng mở rộng đều là *cộng thêm*, không phải migrate lại dữ liệu tồn đã lưu:

| Mở rộng sau này | Việc phải làm |
| --- | --- |
| Nhiều kho | thêm `warehouseId` vào `stock_receipts`, `GROUP BY` thêm một chiều trong `InventoryService` |
| Giữ hàng thủ công không gắn PO | thêm bảng riêng, cộng vào công thức `reserved` |
| Khoá sổ / bút toán đảo (thay vì sửa/xoá tự do) | chặn `PATCH`/`DELETE` theo điều kiện, không đổi bảng |

**Tồn vật tư / bán thành phẩm** — đã làm phần vật tư 2026-07-30 đúng theo hướng đã ghi ở đây trước đó (`materialId` nullable trên `stock_receipt_items` + CHECK, khuôn `bom_items`); bán thành phẩm (WIP) vẫn ngoài phạm vi.

## Ngoài phạm vi bản này

Tồn bán thành phẩm (WIP) · nhiều kho vật lý · giá vốn/giá trị tồn · kiểm kê định kỳ có quy trình riêng · lô/serial/hạn dùng · sửa `GET /orders/stats` để dùng delivery tracking thật từ `orderItemId` thay vì proxy `status = COMPLETED` · "Đã giữ"/"Có thể xuất" thật cho vật tư (cần Phiếu lãnh vật tư) · "Tổng nhu cầu BOM"/"Tồn khả dụng" thật cho vật tư (cần nổ BOM đa cấp).

(Module LSX — kiểm tra tồn + ra quyết định sản xuất trên một PO đã duyệt — đã được xây, xem `docs/features/production.md`; không còn nằm ngoài phạm vi.)

## Xem thêm

- `orders` — nguồn `order_items`/`orderItemId` cho "reserved" và cho việc liên kết dòng xuất kho với dòng đơn hàng; xem `docs/features/orders.md`.
- `production` — module LSX, nguồn phiếu `OUT`/`DELIVERY` thứ hai và người dùng `excludeOrderId` trên `getStockLevels`; xem `docs/features/production.md`.
- `products` — nguồn thành phẩm (`type = FINISHED_GOOD`); `products.md` mô tả `type`/`unitId`/vòng đời sản phẩm.
- `materials` — nguồn vật tư cho `GET /inventory/materials`; `materials.md` mô tả `minStock`/`supplierId` (thêm cùng ngày với tính năng này).

## Frontend integration notes

**2026-07-30 — thêm Tồn kho vật tư + `subject` trên phiếu, có breaking change:**

- **Breaking**: `POST /stock-receipts` nay **bắt buộc** field `subject` (`FINISHED_GOOD`/`MATERIAL`). Client tạo phiếu thành phẩm như trước phải gửi thêm `subject: FINISHED_GOOD`; thiếu field này sẽ bị `ValidationPipe` từ chối (422).
- Additive: route mới `GET /inventory/materials` (màn "Tồn kho vật tư") — xem "Tồn kho vật tư" ở trên cho công thức + field.
- Additive: `GetStockReceiptsReqDto` thêm `subject?`/`materialId?`; `StockReceiptItemReqDto` thêm `materialId?` (đúng-một-trong-hai với `productId?`, cả hai nay đều optional ở tầng DTO — validate đúng-một-trong-hai nằm ở service, `E086`); `StockReceiptResDto` thêm `subject`; `StockReceiptItemResDto`.`product` đổi thành nullable, thêm `material` nullable.
- Trên màn "Tồn kho vật tư", `reserved`/`bomDemand` hiện luôn `0` và `status` chỉ có thể là `NORMAL`/`WARNING` — chưa bao giờ `SHORTAGE` (xem "Tồn kho vật tư"). FE không nên coi đây là dấu hiệu "hệ thống lỗi" — số liệu sẽ đổi khi các đợt sau nổ BOM/thêm Phiếu lãnh vật tư.
