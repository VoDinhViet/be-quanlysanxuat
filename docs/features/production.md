# Tính năng: Production (Lệnh sản xuất — LSX) & Job

## Mục đích

Nối tiếp luồng duyệt PO (`docs/features/orders.md`): một PO đã được Giám đốc duyệt (`AWAITING_PRODUCTION`) cần được kiểm tra tồn thành phẩm và ra quyết định sản xuất trước khi thực sự sản xuất. Đây chính là phần "Module LSX" mà cả `orders.md` lẫn `inventory.md` đã ghi là khoảng trống ở giữa hai module đó.

Ba tầng khái niệm (đảo từ mô hình 1-dòng-PO-1-LSX ban đầu, xem "Ba tầng dữ liệu" bên dưới):

```
1 đơn hàng (PO đã duyệt)  =  1 LSX                         (production_orders — header)
   └─ phần con "quyết định sản xuất": danh sách dòng PO     (production_order_items)
        └─ mỗi sản phẩm FG có SL cần SX > 0  =  1 Job       (production_jobs)
```

Luồng: **duyệt PO xong, hệ thống tự sinh sẵn LSX** (header `PENDING`) và các dòng quyết định sản xuất cho từng dòng PO, tính theo tồn thành phẩm hiện có → người dùng xem tồn/khả dụng, sửa số lượng đề xuất nếu muốn, bấm **Lưu lại** → bấm **Tạo LSX** → hệ thống phát hành: header chuyển `ISSUED` (mã `LSXxxxx`), gộp SL theo sản phẩm sinh **Job** (mã `JOBxxxx`, một Job cho mỗi sản phẩm có SL > 0), ghi nhận phần lấy từ tồn thành phẩm vào sổ kho, và chuyển PO sang `IN_PROGRESS`.

Phạm vi hiện tại: chỉ sinh dữ liệu LSX/Job + API đọc danh sách. Theo dõi tiến độ Job, gắn công đoạn (`routing_steps`), báo cáo sản lượng là việc của một tính năng sau.

## Quy tắc nghiệp vụ

### Công thức đề xuất sản xuất

Cho mỗi dòng `order_items` **status = NORMAL** của một PO:

```
Tồn TP     = onHand(SP)
Khả dụng   = onHand(SP) − reserved(SP, LOẠI TRỪ chính PO đang xét)
Đề xuất SX = Khả dụng >= 0 ? max(0, SL PO − Khả dụng) : SL PO
Lấy từ tồn = max(0, SL PO − Đề xuất SX đã chốt)
SL Job(SP) = Σ Đề xuất SX của mọi dòng cùng SP trong LSX     (chỉ tạo Job khi > 0)
```

`onHand`/`reserved` tái dùng nguyên `InventoryService` (`docs/features/inventory.md`). **"Khả dụng" ở đây khác `available` của màn Kho** (`GET /inventory`): phải loại trừ chính PO đang xét khỏi `reserved`, vì PO đã duyệt nên nó đã tự giữ chỗ trong `reserved` — dùng thẳng `available` sẽ trừ nhu cầu của PO này hai lần. `InventoryService.getStockLevels`/`reservedSubquery` nhận thêm tham số `excludeOrderId` tuỳ chọn cho đúng việc này; call site `GET /inventory` không đổi.

`max(0, ...)` chặn đề xuất về âm khi tồn đã dư hơn PO. Người dùng sửa "Đề xuất SX" tự do — kể cả đặt cao hơn SL PO để sản xuất dư, khi đó "Lấy từ tồn" tính ra 0.

**Hai dòng PO khác nhau cùng một SP tính đề xuất độc lập trên cùng con số Khả dụng** — có thể cùng "xí" một lượng tồn nếu cả hai được duyệt "Lấy từ tồn" > 0. Chốt chặn cuối là bước phát hành (xem dưới), không phải bước tính/lưu kế hoạch.

### LSX + quyết định sản xuất tự sinh khi duyệt PO

`POST /orders/:orderId/approve` (đã có, xem `orders.md`) nay **đồng thời**:

1. Tạo 1 header `production_orders` (`status = PENDING`) cho PO đó.
2. Ghi sẵn các dòng `production_order_items`, một dòng cho mỗi dòng PO `NORMAL`, với Đề xuất SX tính theo công thức trên tại thời điểm duyệt.

Cả hai chạy cùng một transaction với việc chuyển PO sang `AWAITING_PRODUCTION`. Đây là **hồ sơ quyết định**, không phải nguồn hiển thị: màn Tab2 luôn tính lại tồn/khả dụng **live** mỗi lần đọc, nên một kế hoạch cũ không bao giờ làm màn hình hiện số sai — nó chỉ là giá trị khởi tạo cho ô "Đề xuất SX" và là nơi lưu lại lựa chọn khi người dùng bấm "Lưu lại".

Một PO bị từ chối (`POST .../reject`, quay về `DRAFT`) rồi sửa và duyệt lại sẽ ghi đè hoàn toàn header + dòng quyết định cũ (replace-all theo `orderId`) — không cộng dồn, không giữ lịch sử các lần duyệt trước.

### Phát hành LSX sinh Job theo sản phẩm, ghi nhận vào sổ kho, chuyển PO sang IN_PROGRESS

Bấm "Tạo LSX" (`POST /production-orders/:orderId/issue`) trong một transaction:

1. Chốt lại toàn bộ dòng quyết định sản xuất (kể cả dòng Đề xuất SX = 0 — **được giữ lại làm hồ sơ**, khác bản đầu tiên từng xoá dòng này).
2. Xoá header `PENDING` cũ, chèn lại header `status = ISSUED` (mã `LSXxxxx`, `issuedBy`/`issuedAt`) cùng bộ dòng quyết định cuối cùng.
3. Gộp Đề xuất SX theo `productId` trên mọi dòng có SL > 0, sinh **1 Job** (`production_jobs`, mã `JOBxxxx`) cho mỗi sản phẩm — hai dòng PO khác nhau cùng một sản phẩm gộp vào **một** Job duy nhất. Việc sinh Job do `ProductionJobsService.issueJobs` thực hiện (module riêng, xem "Module" bên dưới), gọi từ trong transaction phát hành của `ProductionOrdersService`.
4. Nếu tổng "Lấy từ tồn" của cả lượt phát hành > 0: lập **một** phiếu xuất kho (`stock_receipts`, `type=OUT`, `reason=DELIVERY`) cho cả lượt, mỗi dòng phiếu (`stock_receipt_items`) gắn `orderItemId` — đúng cơ chế delivery tracking `inventory.md` đã mô tả. Không phải mỗi Job một phiếu riêng.
5. Chuyển PO sang `IN_PROGRESS` — đóng bước `AWAITING_PRODUCTION → IN_PROGRESS` mà `orders.md` từng ghi "tạm qua PATCH, sẽ gắn với module LSX khi module đó được xây".

**Kiểm tồn thật lúc phát hành, không chỉ lúc lưu kế hoạch**: trước khi ghi, hệ thống tính lại tồn/khả dụng **live**, hợp nhất với kế hoạch đã lưu (dòng chưa lưu dùng đề xuất hệ thống tính), rồi gộp "Lấy từ tồn" theo `productId` — nếu vượt `onHand` thật của SP đó thì từ chối cả lượt phát hành (`E071`, tái dùng mã lỗi của `inventory`, cùng một bất biến "không âm tồn"). Đây là chốt chặn cho ca "hai dòng PO cùng SP cùng xí một lượng tồn" nói ở trên.

Phiếu xuất kho được ghi **trực tiếp qua bảng** `stock_receipts`/`stock_receipt_items`, không gọi `StockReceiptsService.createStockReceipt` — hàm đó tự mở transaction riêng (phiếu sẽ commit tách khỏi việc phát hành LSX) và các kiểm tra của nó nhắm vào việc validate DTO người dùng gửi tay, trong khi ở đây dòng phiếu do server tự dựng từ dữ liệu PO đã qua kiểm.

### Ba tầng dữ liệu — đảo quyết định 2026-07-29

Bản dựng đầu tiên hiểu sai đơn vị "lệnh sản xuất": 1 bảng `production_orders` duy nhất, **1 dòng cho mỗi dòng PO**, mỗi dòng một mã `LSXxxxx` riêng — một PO 5 sản phẩm sinh ra 5 LSX. Cùng ngày, đã tách lại đúng nghĩa nghiệp vụ thành 3 tầng:

- `production_orders` — header, **1 đơn hàng = 1 LSX** (`orderId` unique).
- `production_order_items` — phần con "quyết định sản xuất", 1 dòng/dòng-PO (giữ 1-1 với `orderItemId` vì phiếu xuất kho cần khoá theo đó).
- `production_jobs` — **1 sản phẩm (FG) = 1 Job**, gộp mọi dòng cùng sản phẩm trong LSX, chỉ sinh khi phát hành.

Trước đó cùng ngày cũng đã có một lần gộp 2 bảng (`production_plans`/`production_orders`) thành 1 bảng có cột `status` lưu trực tiếp thay vì suy ra bằng `EXISTS` — quyết định đó **vẫn giữ** ở tầng header (`production_orders.status`), chỉ không còn đúng ở tầng "mỗi dòng PO một LSX" nữa.

### Không có xoá/sửa LSX đã phát hành

Bản này không có endpoint xoá/sửa một LSX `ISSUED` hay một Job — một lệnh đã phát hành là chốt. `production_order_items.orderItemId` là FK `restrict` (bảo vệ dòng đã gắn với một LSX `ISSUED` khỏi mất liên kết) — hệ quả:

- Sửa dòng PO nguồn (`PATCH /orders/:orderId` với `items`) sau khi LSX của đơn đó đã `ISSUED` bị chặn ở tầng service (`E080`, 409), tránh nổ 500 thô từ constraint.
- Một LSX chỉ đang `PENDING` (kế hoạch, chưa phát hành) **không** chặn sửa `items` — `OrdersService.updateOrder` tự xoá header `production_orders` của đơn đó ngay trong transaction (cascade dọn `production_order_items`), trước khi `order_items` bị replace-all. Hệ quả: sửa `items` của PO đã duyệt (chưa "Tạo LSX") xoá sạch kế hoạch đã lưu; mở lại màn LSX sẽ tính lại Đề xuất SX từ đầu cho bộ dòng mới, không phục hồi lựa chọn cũ.

## Mô hình dữ liệu

**`production_orders`** — header, 1-1 với một `orders` (unique trên `orderId`, `onDelete: 'restrict'`):

| Cột | Ghi chú |
| --- | --- |
| `code` | `LSXxxxx`, unique, **nullable** — chỉ gán khi `status = ISSUED` |
| `orderId` | unique — mỗi PO chỉ có đúng một LSX |
| `status` | `PENDING` (default) \| `ISSUED` |
| `issuedBy`, `issuedAt` | nullable, chỉ có khi `ISSUED` |
| `createdBy` | ai duyệt PO / ai lưu kế hoạch gần nhất |

CHECK `chk_production_orders_issued_fields`: `code`/`issued_at` phải cùng có hoặc cùng không, khớp `status`.

**`production_order_items`** — "quyết định sản xuất", 1-1 với một `order_items` (unique trên `orderItemId`, `onDelete: 'restrict'`), `onDelete: 'cascade'` từ `production_orders`:

| Cột | Ghi chú |
| --- | --- |
| `productionOrderId`, `productId` | |
| `quantity` | Đề xuất SX đã chốt (luôn >= 0, kể cả 0) |
| `orderQty`, `onHandQty`, `availableQty`, `fromStockQty` | snapshot tại lần ghi gần nhất |

CHECK `chk_production_order_items_quantity`: `quantity >= 0`.

**`production_jobs`** — 1 sản phẩm (FG) = 1 Job trong một LSX, `onDelete: 'cascade'` từ `production_orders`, unique `(productionOrderId, productId)`:

| Cột | Ghi chú |
| --- | --- |
| `code` | `JOBxxxx`, notNull, unique |
| `productionOrderId`, `productId` | |
| `quantity` | Σ Đề xuất SX của SP đó trong LSX (luôn > 0 — dòng SL = 0 không sinh Job) |

CHECK `chk_production_jobs_quantity`: `quantity > 0`.

Không có cột `stockReceiptId` ở đâu — đường nối LSX ↔ phiếu xuất kho đã có sẵn qua `stock_receipt_items.orderItemId = production_order_items.orderItemId`, thêm cột nữa là dữ liệu trùng có thể lệch.

## Module

Hai module tách biệt (đảo từ "1 module duy nhất" của bản gộp `production_orders`/`production_plans` trước đó — Job là một khái niệm/vòng đời khác, "Quản lý sản xuất" là màn hình việc-làm-thực-tế của xưởng, không phải một hình dạng đọc khác của cùng LSX):

- **`ProductionOrdersController`/`Service`** (`src/api/production-orders/`) — màn hình chính LSX (theo PO): `getProductionOrders`/`getProductionOrderDetail`/`updateProductionOrder`/`issueProductionOrders`.
- **`ProductionJobsController`/`Service`** (`src/api/production-jobs/`) — "Quản lý sản xuất" (theo Job): `getProductionJobs`/`getProductionJobDetail`, cùng write helper nội bộ `issueJobs(tx, productionOrderId, quantityByProduct)` mà `ProductionOrdersService.issueProductionOrders` gọi trong transaction phát hành của nó. Job không có route ghi riêng — chỉ được tạo qua đường phát hành LSX.

`ProductionOrdersModule` import `ProductionJobsModule` (không có chiều ngược lại — không vòng phụ thuộc).

## API contract

| Method | Path | Permission | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/production-orders` | `production:read` | `GetProductionOrdersReqDto` — `limit`, `page`, `q` (khớp mờ mã PO/mã LSX), `status` (`PENDING`/`ISSUED`), `clientId`, `fromDate`/`toDate` (theo `dueDate`) | `200` + `ProductionOrderResDto` phân trang — **màn hình chính LSX**, 1 dòng/PO |
| GET | `/production-orders/:orderId` | `production:read` | — | `200` + `ProductionOrderDetailResDto` (Tab1 header LSX + Tab2 dòng quyết định sản xuất kèm tồn/khả dụng/đề xuất) |
| PATCH | `/production-orders/:orderId` | `production:update` | `UpdateProductionOrderReqDto` — `items[]` (replace-all: `orderItemId*`, `quantity*`) | `200` + `ProductionOrderDetailResDto` — "Lưu lại" |
| POST | `/production-orders/:orderId/issue` | `production:create` | — | `200` + `ProductionOrderDetailResDto` — "Tạo LSX", phát hành |
| GET | `/production-jobs` | `production:read` | `GetProductionJobsReqDto` — `limit`, `page`, `q` (khớp mờ mã Job/mã LSX/mã PO/mã-tên SP), `orderId`, `productId`, `clientId`, `fromDate`/`toDate` (theo `dueDate` của PO) | `200` + `ProductionJobResDto` phân trang — **"Quản lý sản xuất"**, 1 dòng/Job |
| GET | `/production-jobs/:jobId` | `production:read` | — | `200` + `ProductionJobResDto` |

(`*` = bắt buộc)

- `GET /production-orders` chỉ liệt kê PO có `status IN (AWAITING_PRODUCTION, IN_PROGRESS)` — PO chưa duyệt không thuộc phạm vi LSX.
- `PATCH`/`POST .../issue` chỉ hợp lệ khi PO đang `AWAITING_PRODUCTION` (`E076` nếu khác) và LSX chưa phát hành (`E077` nếu đã phát hành).
- `GET /production-orders` sắp `dueDate` PO tăng dần rồi `createdAt` PO giảm dần; `GET /production-jobs` sắp `dueDate` PO tăng dần rồi `issuedAt` LSX giảm dần.

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| --- | --- | --- |
| Không tìm thấy đơn hàng | `ErrorCode.E057` | 404 |
| PO chưa duyệt (không phải `AWAITING_PRODUCTION`) khi `PATCH`/`POST .../issue` | `ErrorCode.E076` | 409 |
| LSX đã phát hành khi `PATCH`/`POST .../issue` | `ErrorCode.E077` | 409 |
| `orderItemId` trong `items` không thuộc PO này hoặc là dòng `CANCELLED` | `ErrorCode.E078` | 400 |
| PO không có dòng `NORMAL` nào khi phát hành | `ErrorCode.E079` | 400 |
| Sửa `items` của một PO mà LSX đã phát hành (`PATCH /orders/:orderId`) | `ErrorCode.E080` | 409 |
| Header LSX không tồn tại cho một PO trong phạm vi (chốt chặn dữ liệu bất nhất, không phải luồng bình thường) | `ErrorCode.E081` | 404 |
| Không tìm thấy Job | `ErrorCode.E082` | 404 |
| Phát hành làm tồn một sản phẩm về âm (gộp theo `productId` cả lượt) | `ErrorCode.E071` | 409 |
| Role của caller thiếu quyền mà route yêu cầu | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

## Ngoài phạm vi

Theo dõi tiến độ Job (chưa có `status` trên `production_jobs`), gắn công đoạn từ `routing_steps`, nhập kho thành phẩm từ sản xuất, báo cáo sản lượng · xoá/huỷ/sửa LSX hoặc Job đã phát hành · Job cho bán thành phẩm (WIP) / nổ BOM xuống vật tư · note riêng cho LSX · cập nhật `GET /orders/stats` theo bộ trạng thái mới (đã là TODO riêng sẵn có, xem `orders.md`).

## Xem thêm

- `orders` — nguồn PO/`order_items`; điều kiện duyệt và luồng trạng thái đầy đủ ở `docs/features/orders.md`.
- `inventory` — nguồn `onHand`/`reserved` và cơ chế delivery tracking qua `orderItemId`; xem `docs/features/inventory.md`.
