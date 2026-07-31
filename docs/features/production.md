# Tính năng: Production (Lệnh sản xuất — LSX) & Job

Bối cảnh nghiệp vụ, vòng đời và bất biến: `docs/domains/production.md`. File này là chi tiết mức module: quy tắc cụ thể, ngữ nghĩa endpoint, error code.

## Mục đích

Nối tiếp luồng duyệt PO (`docs/features/orders.md`): một PO đã được Giám đốc duyệt (`AWAITING_PRODUCTION`) cần được kiểm tra tồn thành phẩm và ra quyết định sản xuất trước khi thực sự sản xuất.

Ba tầng dữ liệu:

```
1 đơn hàng (PO đã duyệt)  =  1 LSX                         (production_orders — header)
   └─ phần con "quyết định sản xuất": danh sách dòng PO     (production_order_items)
        └─ mỗi sản phẩm FG có SL cần SX > 0  =  1 Job       (production_jobs, sinh khi duyệt LSX)
```

Luồng hiện tại: **duyệt PO xong, hệ thống tự sinh sẵn LSX** (header `PENDING`) và các dòng quyết định sản xuất cho từng dòng PO, tính theo tồn thành phẩm hiện có tại thời điểm duyệt. Trong lúc còn `PENDING`, người dùng có thể **sửa số lượng sản xuất từng dòng** (`PATCH /production-orders/:productionOrdersId`, nhập tay, xem "Sửa số lượng sản xuất" bên dưới). Giám đốc/quản lý sản xuất sau đó **duyệt LSX** (`POST /production-orders/:productionOrdersId/approve`, `PENDING → APPROVED`, xem "Luồng duyệt LSX" bên dưới). `GET /production-orders/:productionOrdersId` đọc lại được header + các dòng này, nhưng chỉ là **snapshot đã ghi lúc duyệt PO** (hoặc lúc sửa số lượng gần nhất) — không tính lại live qua `InventoryService` (xem "Đọc lại chi tiết bằng snapshot").

Phạm vi hiện tại: sinh dữ liệu LSX khi duyệt PO + sửa số lượng sản xuất (khi còn `PENDING`) + duyệt LSX (đồng thời sinh Job) + log lịch sử thao tác LSX (`GET /production-orders/.../logs`) + `GET /production-orders` (list) + `GET /production-orders/:productionOrdersId` (snapshot chi tiết) + `GET /production-jobs*` (đọc + vòng đời Job). Job không lưu lịch sử thao tác riêng — xem "Vòng đời Job + báo sản lượng". Huỷ duyệt LSX, ghi nhận xuất kho khi duyệt LSX, kiểm tra tồn kho tổng hợp trước khi duyệt, theo dõi tiến độ Job theo từng công đoạn (`routing_steps`), gắn tổ/máy/nhân công, refresh tồn kho khi sửa số lượng là việc của một tính năng sau — xem "Ngoài phạm vi".

## Quy tắc nghiệp vụ

### Công thức đề xuất sản xuất

Cho mỗi dòng `order_items` **status = NORMAL** của một PO:

```
Tồn TP     = onHand(SP)
Khả dụng   = onHand(SP) − reserved(SP, LOẠI TRỪ chính PO đang xét)
Đề xuất SX = Khả dụng >= 0 ? max(0, SL PO − Khả dụng) : SL PO
Lấy từ tồn = max(0, SL PO − Đề xuất SX đã chốt)
```

`onHand`/`reserved` tái dùng nguyên `InventoryService` (`docs/features/inventory.md`). **"Khả dụng" ở đây khác `available` của màn Kho** (`GET /inventory`): phải loại trừ chính PO đang xét khỏi `reserved`, vì PO đã duyệt nên nó đã tự giữ chỗ trong `reserved` — dùng thẳng `available` sẽ trừ nhu cầu của PO này hai lần. `InventoryService.getStockLevels`/`reservedSubquery` nhận thêm tham số `excludeOrderId` tuỳ chọn cho đúng việc này; call site `GET /inventory` không đổi.

Công thức chỉ chạy ở **một chỗ**: `ProductionOrdersService.getInitialPlanItems`, gọi lúc duyệt PO (không có override). Cả `getInitialPlanItems` lẫn phần ghi (`seedPlan`) đều nằm trong `ProductionOrdersService`, chỉ được `OrdersService.approveOrder` gọi cross-module — không còn nơi nào khác tính lại công thức này.

`max(0, ...)` chặn đề xuất về âm khi tồn đã dư hơn PO.

**Hai dòng PO khác nhau cùng một SP tính đề xuất độc lập trên cùng con số Khả dụng** tại thời điểm duyệt — có thể cùng "xí" một lượng tồn nếu cả hai đều có "Lấy từ tồn" > 0. Hiện không có chốt chặn ở tầng ứng dụng cho ca này — `approveProductionOrder` chỉ đổi status/mã, không tính lại hay kiểm tra lại tồn (xem "Ngoài phạm vi").

### LSX + quyết định sản xuất tự sinh khi duyệt PO

`POST /orders/:orderId/approve` (xem `orders.md`) đồng thời:

1. Tạo 1 header `production_orders` (`status = PENDING`) cho PO đó.
2. Ghi sẵn các dòng `production_order_items`, một dòng cho mỗi dòng PO `NORMAL`, với Đề xuất SX tính theo công thức trên tại thời điểm duyệt.

Cả hai chạy cùng một transaction với việc chuyển PO sang `AWAITING_PRODUCTION`. Người dùng có thể sửa số lượng từng dòng sau khi ghi, miễn LSX còn `PENDING` (xem "Sửa số lượng sản xuất"), rồi mới duyệt cả LSX (xem "Luồng duyệt LSX"). `GET /production-orders/:productionOrdersId` đọc lại được đúng những gì đã ghi ở bước này (hoặc đã sửa sau đó), không hơn (xem "Đọc lại chi tiết bằng snapshot").

Một PO bị từ chối (`POST .../reject`, quay về `DRAFT`) rồi sửa và duyệt lại sẽ ghi đè hoàn toàn header + dòng quyết định cũ (replace-all theo `orderId`) — không cộng dồn, không giữ lịch sử các lần duyệt trước.

### Sửa số lượng sản xuất

`PATCH /production-orders/:productionOrdersId` (quyền `production:update`) — sửa số lượng sản xuất (Đề xuất SX) từng dòng, **nhập tay**, chỉ hợp lệ khi LSX còn `PENDING` (`ErrorCode.E084` nếu đã `APPROVED`):

- **Partial, không replace-all**: body `{ items: [{ orderItemId, quantity }] }` — chỉ dòng có mặt trong `items` bị ghi, dòng không gửi giữ nguyên. `items: []` là no-op hợp lệ (không throw).
- `orderItemId` phải thuộc chính LSX này, nếu không → `ErrorCode.E078` (400).
- Chỉ **tính lại `fromStockQty`** (= `max(0, orderQty − quantity mới)`, dùng `orderQty` snapshot đã lưu) — `orderQty`/`onHandQty`/`availableQty` giữ nguyên, **không** gọi lại `InventoryService` để refresh tồn kho hiện tại (xem "Ngoài phạm vi").
- Trả về `ProductionOrderDetailResDto` đầy đủ (gọi lại `getProductionOrdersById` sau khi ghi) — cùng shape response với `GET`/`.../approve`.

### Luồng duyệt LSX

`POST /production-orders/:productionOrdersId/approve` (quyền `production:approve`) — chỉ hợp lệ khi LSX đang `PENDING` **và** PO gốc vẫn `AWAITING_PRODUCTION` (`ErrorCode.E076` nếu không). Chốt LSX: `status → APPROVED`, sinh mã `LSXxxxx` (đếm số LSX `APPROVED`, cùng khuôn `OrdersService.generateOrderCode`), ghi `approvedBy`/`approvedAt`; đẩy PO gốc `orders.status → IN_PROGRESS`; và sinh Job (xem "Sinh Job khi duyệt LSX") — tất cả trong cùng transaction. Chưa lập phiếu xuất kho (xem "Ngoài phạm vi"). Trả về `ProductionOrderDetailResDto` (gọi lại `getProductionOrdersById` sau khi transaction commit).

Một chiều: `APPROVED` là điểm cuối, chưa có route đưa LSX quay lại `PENDING` — xem "Ngoài phạm vi".

### Sinh Job khi duyệt LSX

`ProductionJobsService.createJobs`, gọi từ trong transaction của `approveProductionOrder`:

- Gộp mọi dòng `production_order_items` của LSX theo `productId`, chỉ giữ sản phẩm có tổng SL > 0 (khớp `chk_production_jobs_quantity`) — số liệu dùng đúng bản đã lưu tại thời điểm duyệt, kể cả đã sửa tay qua `updateProductionOrder`, không tính lại gì thêm.
- Mỗi sản phẩm sinh đúng 1 dòng `production_jobs`, mã `JOBxxxx` (đếm toàn bảng `production_jobs`, không lọc theo LSX).
- Không có sản phẩm nào SL > 0 (LSX 0 dòng, hoặc mọi dòng đã sửa về 0) → không tạo Job nào, không lỗi.
- Không lập phiếu xuất kho `OUT`/`DELIVERY` cho "Lấy từ tồn" — xem "Ngoài phạm vi".
- Không kiểm tra tồn kho tổng hợp trước khi duyệt (ca 2 dòng PO khác nhau cùng sản phẩm cộng dồn "Lấy từ tồn" vượt tồn thực tế) — xem "Ngoài phạm vi".

### Log LSX

`production_order_logs` — lịch sử thao tác trên một LSX: thời gian (`createdAt`), người thực hiện (`performedBy`), nội dung (`content`, mô tả tiếng Việt sẵn để hiển thị). `ProductionOrdersService.logAction` là nơi ghi duy nhất, luôn gọi **trong cùng transaction** với hành động đang log — không có route ghi log trực tiếp:

- `seedPlan` → `CREATED`, nội dung `"Tạo LSX (N dòng quyết định sản xuất)"`.
- `updateProductionOrder` → `QUANTITY_UPDATED`, chỉ ghi khi thực sự có dòng đổi (`items: []` không log gì) — nội dung liệt kê **từng dòng** đổi: `"Cập nhật SL sản xuất: <tên SP> <cũ> → <mới>; ..."`.
- `approveProductionOrder` → `APPROVED`, nội dung `"Duyệt LSX <code>, sinh N Job"` (bỏ vế Job nếu N = 0).

Đọc qua `GET /production-orders/:productionOrdersId/logs` (phân trang, mới nhất trước), tái dùng quyền `production:read`, 404 dùng lại `E081`.

`content` là `varchar(1000)` — nội dung quá dài bị cắt bớt (`.slice(0, 1000)`) ở tầng service trước khi ghi. `onDelete: 'cascade'` từ `production_orders` — khi header bị xoá để ghi đè (replace-all lúc `seedPlan`/`OrdersService.updateOrder` xoá LSX `PENDING`), log cũ mất theo, kế thừa đúng hành vi `production_order_items`.

### Đọc lại chi tiết bằng snapshot

`GET /production-orders/:productionOrdersId` — path param là `production_orders.id`. `ProductionOrdersService.getProductionOrdersById` chỉ **một** query Drizzle: `productionOrders.findFirst({ where: eq(productionOrders.id, ...), with: { order: {...}, items: {...} } })`, không query `orders` riêng, không gọi lại `InventoryService`. Đây cũng là response chung cho `approveProductionOrder`.

- Số liệu trả về (`quantity`/`onHandQty`/`availableQty`/`fromStockQty`) là snapshot tại thời điểm duyệt PO gần nhất (hoặc lúc sửa số lượng gần nhất) — có thể lệch tồn kho thực tế nếu tồn đã đổi từ lúc đó, vì sửa số lượng không refresh `onHandQty`/`availableQty` và không tính lại live.
- Route tra theo `production_orders.id` nên điều kiện tồn tại chỉ còn một: có hay không có header đó (`E081`).
- **Shape response khác hẳn list**: `ProductionOrderResDto` (list) để phẳng `orderId`/`orderCode`/`client`/`orderDate`/`dueDate`/`note` (query dùng `.select()` + join). `ProductionOrderDetailResDto` (detail) lồng toàn bộ phần đó vào một field `order: OrderRefResDto` (`src/api/orders/dto/order-ref.res.dto.ts`, `{ id, code, client, orderDate, dueDate, note }`, query dùng relational `with: { order: {...} }`). Hai DTO **không** extends nhau.
- `ProductionOrderResDto` (list) có field `id` (`production_orders.id`) để client lấy khoá tra cứu ngay từ dòng danh sách.

### Không có xoá/sửa/huỷ duyệt LSX đã duyệt

Không có endpoint xoá một LSX hay một Job. Sửa số lượng sản xuất (`updateProductionOrder`) chỉ hợp lệ khi LSX còn `PENDING` — một LSX đã `APPROVED` không sửa được từng dòng nữa (`E084`), và chưa có cách huỷ duyệt — xem "Ngoài phạm vi". `production_order_items.orderItemId` là FK `restrict` (bảo vệ dòng đã gắn với một LSX `APPROVED` khỏi mất liên kết) — hệ quả:

- Sửa dòng PO nguồn (`PATCH /orders/:orderId` với `items`) sau khi LSX của đơn đó đã `APPROVED` bị chặn ở tầng service (`E080`, 409), tránh nổ 500 thô từ constraint.
- Một LSX đang `PENDING` (kế hoạch, chưa duyệt) **không** chặn sửa `items` — `OrdersService.updateOrder` tự xoá header `production_orders` của đơn đó ngay trong transaction (cascade dọn `production_order_items`), trước khi `order_items` bị replace-all. Hệ quả: sửa `items` của một PO đang ở trạng thái này xoá sạch hồ sơ LSX đã lưu; duyệt lại (nếu PO quay về được `PENDING_CONFIRMATION`) sẽ tính lại Đề xuất SX từ đầu cho bộ dòng mới.

### Vòng đời Job + báo sản lượng

`production_jobs` sinh ra khi duyệt LSX (`createJobs`), có vòng đời riêng ở **mức Job** (chưa chia theo công đoạn `routing_steps` — xem "Ngoài phạm vi"). Job **không lưu lịch sử thao tác** — khác LSX, `production_order_logs` vẫn còn (xem "Log LSX") — nên không có cách nào qua API biết ai/khi nào đã `report`/`hold`/`resume` một Job; chỉ `startedBy`/`startedAt` (cột thật) ghi lại được cho `start`. Bốn route ghi dùng chung quyền `production:update`, mỗi route chỉ 1 câu `update`, không cần transaction.

Chuyển trạng thái hợp lệ (`E087` nếu gọi sai):

| Từ | Hành động | Sang | Ghi thêm |
| --- | --- | --- | --- |
| `PENDING` | `start` | `IN_PROGRESS` | `startedBy`/`startedAt` |
| `IN_PROGRESS` | `report` | `IN_PROGRESS` (không đổi status) | cộng dồn `producedQty`/`rejectedQty` |
| `IN_PROGRESS` | `hold` | `WAITING` | — |
| `WAITING` | `resume` | `IN_PROGRESS` | — |

**Bộ 3 trạng thái này không có điểm kết thúc.** Một Job báo đủ sản lượng (`producedQty + rejectedQty = quantity`) vẫn đứng ở `IN_PROGRESS`; `report` gọi tiếp sẽ nhận `E088`. Thêm một trạng thái kết thúc là việc của một đợt sau — xem "Ngoài phạm vi".

**Báo sản lượng cộng dồn, không ghi đè**: mỗi lần `report` cộng `producedQty`/`rejectedQty` thêm vào số đã có — hai lần báo `{producedQty: 10}` cho ra tổng `20`, không phải `10`. Phải gửi ít nhất một trong hai giá trị > 0 (`E089`); tổng cộng dồn sau khi cộng không được vượt `quantity` của Job (`E088`, kiểm ở service để ra 400 sạch thay vì để lộ lỗi constraint `chk_production_jobs_report_qty` 500 thô).

### Response list vs detail

`GET /production-jobs` (list, "Quản lý sản xuất") và `GET /production-jobs/:jobId`/4 route ghi (`start`/`report`/`hold`/`resume`, đều trả lại chi tiết sau khi ghi) trả hai DTO khác nhau — khuôn `ProductionOrderResDto`/`ProductionOrderDetailResDto` đã có ở `production-orders`. `getProductionJobs` (list) tự dựng `.select()` join riêng; `getProductionJob` (detail) đọc thẳng `production_jobs` bằng relational query (`db.query.productionJobs.findFirst`), không join.

`ProductionJobResDto` (list) — đúng bộ cột cho bảng:

| Field | Nguồn | Ghi chú |
| --- | --- | --- |
| `id` | `production_jobs.id` | |
| `code` | `production_jobs.code` | Mã Job |
| `orderCode` | `orders.code` | Mã đơn hàng (PO) |
| `client` | `orders.clientId` → `clients` | `OrderClientRefResDto`, nullable |
| `image` | `products.imageFileId` → `files` | Ảnh sản phẩm, `FileResDto`, nullable |
| `quantity` | `production_jobs.quantity` | SL cần sản xuất — đã gộp theo sản phẩm, dùng thẳng số có sẵn |
| `orderDate` | `orders.orderDate` | |
| `dueDate` | `orders.dueDate` | nullable |
| `warning` | tính trong SQL | xem công thức dưới |
| `producedQty` | `production_jobs.producedQty` | SL đạt đã báo, cộng dồn |
| `status` | `production_jobs.status` | |

**`warning`** — cảnh báo trễ hạn, cùng tinh thần `OrdersService.expiredSql` (`docs/features/orders.md`, "Trễ hạn"): `dueDate IS NOT NULL AND dueDate < now() AND (producedQty + rejectedQty) < quantity`. Không dùng `status` để xét "chưa xong" vì bộ 3 trạng thái không có điểm kết thúc — phải so trực tiếp số lượng.

`ProductionJobDetailResDto` (detail + 4 route ghi) — đúng **12 cột của bảng `production_jobs`**, không có field join nào; thông tin PO/khách hàng/sản phẩm FE lấy từ dòng tương ứng ở `GET /production-jobs` (list): `id`, `code`, `productionOrderId`, `productId`, `quantity`, `status`, `producedQty`, `rejectedQty`, `startedBy`, `startedAt`, `createdAt`, `updatedAt`. `remainingQty` không trả về — FE tự tính `quantity − producedQty − rejectedQty`.

## Mô hình dữ liệu

**`production_orders`** — header, 1-1 với một `orders` (unique trên `orderId`, `onDelete: 'restrict'`):

| Cột                        | Ghi chú                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `code`                     | `LSXxxxx`, unique, **nullable** — chỉ gán khi `status = APPROVED` (`approveProductionOrder`)       |
| `orderId`                  | unique — mỗi PO chỉ có đúng một LSX                                                                |
| `status`                   | `PENDING` (default) \| `APPROVED` — chỉ 2 giá trị, hiện chỉ đi một chiều (chưa có route huỷ duyệt) |
| `approvedBy`, `approvedAt` | nullable, chỉ có khi `APPROVED`                                                                    |
| `createdBy`                | ai duyệt PO                                                                                        |

CHECK `chk_production_orders_status_fields`: `code`/`approved_at` phải cùng có hoặc cùng không, khớp `status` (`APPROVED` thì cả hai NOT NULL, `PENDING` thì cả hai NULL).

**`production_order_items`** — "quyết định sản xuất", 1-1 với một `order_items` (unique trên `orderItemId`, `onDelete: 'restrict'`), `onDelete: 'cascade'` từ `production_orders`. Đọc lại qua `GET /production-orders/:productionOrdersId` là snapshot tĩnh, không tính lại (xem "Đọc lại chi tiết bằng snapshot"):

| Cột                                     | Ghi chú                                                                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `productionOrderId`, `productId`        |                                                                                                                                        |
| `quantity`                              | Đề xuất SX — do hệ thống tính lúc duyệt PO, hoặc người dùng sửa tay qua `updateProductionOrder` khi còn `PENDING` (luôn >= 0, kể cả 0) |
| `orderQty`, `onHandQty`, `availableQty` | snapshot tại lần duyệt PO — không đổi khi sửa `quantity`                                                                               |
| `fromStockQty`                          | dẫn xuất `max(0, orderQty − quantity)`, tính lại mỗi lần `quantity` đổi (lúc duyệt PO hoặc lúc sửa)                                    |

CHECK `chk_production_order_items_quantity`: `quantity >= 0`.

**`production_jobs`** — 1 sản phẩm (FG) = 1 Job trong một LSX, `onDelete: 'cascade'` từ `production_orders`, unique `(productionOrderId, productId)`, sinh qua `createJobs` khi duyệt LSX:

| Cột                                         | Ghi chú                                                         |
| -------------------------------------------- | --------------------------------------------------------------- |
| `code`                                      | `JOBxxxx`, notNull, unique                                      |
| `productionOrderId`, `productId`            |                                                                 |
| `quantity`                                  | Σ Đề xuất SX của SP đó trong LSX tại thời điểm duyệt (luôn > 0) |
| `status`                                    | `PENDING` (default) \| `IN_PROGRESS` \| `WAITING` — không có điểm kết thúc, xem "Vòng đời Job + báo sản lượng" |
| `producedQty`, `rejectedQty`                | `numeric`, default `0` — cộng dồn qua từng lần `report` |
| `startedBy`/`startedAt`                     | nullable, ghi khi `start`                                       |

CHECK `chk_production_jobs_quantity`: `quantity > 0`. CHECK `chk_production_jobs_report_qty`: `produced_qty >= 0 AND rejected_qty >= 0 AND produced_qty + rejected_qty <= quantity`. CHECK `chk_production_jobs_status_fields`: `status <> 'PENDING' OR started_at IS NULL` — `IN_PROGRESS`/`WAITING` không còn ràng buộc thêm.

**`production_order_logs`** — lịch sử thao tác, `onDelete: 'cascade'` từ `production_orders`, append-only (không có `updatedAt`, cùng khuôn `order_attachments`/`client_contacts`). Ghi qua `ProductionOrdersService.logAction`, đọc qua `GET /production-orders/:productionOrdersId/logs` (xem "Log LSX"):

| Cột                 | Ghi chú                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `productionOrderId` |                                                                      |
| `action`            | `CREATED` \| `QUANTITY_UPDATED` \| `APPROVED`                        |
| `content`           | `varchar(1000)`, mô tả tiếng Việt sẵn để hiển thị, sinh lúc ghi      |
| `performedBy`       | nullable (`set null` nếu credential bị xoá) — ai thực hiện hành động |
| `createdAt`         | thời điểm thực hiện                                                  |

Không có cột `stockReceiptId` ở đâu — đường nối LSX ↔ phiếu xuất kho là qua `stock_receipt_items.orderItemId = production_order_items.orderItemId`, chưa được lập tự động cho LSX (xem "Ngoài phạm vi").

## Module

Hai module tách biệt — Job là một khái niệm/vòng đời khác, "Quản lý sản xuất" là màn hình việc-làm-thực-tế của xưởng, không phải một hình dạng đọc khác của cùng LSX:

- **`ProductionOrdersController`/`Service`** (`src/api/production-orders/`) — phía đọc: `getProductionOrders` (list), `getProductionOrdersById` (snapshot chi tiết, xem "Đọc lại chi tiết bằng snapshot"), `getProductionOrderLogs` (lịch sử thao tác, xem "Log LSX"); phía ghi: `updateProductionOrder` (xem "Sửa số lượng sản xuất") và `approveProductionOrder` (xem "Luồng duyệt LSX") — cả hai cùng `seedPlan` đều gọi `logAction` (private); cộng 2 method public chỉ phục vụ `OrdersService.approveOrder` khi duyệt PO: `getInitialPlanItems` (tính Đề xuất SX ban đầu) rồi `seedPlan` (ghi header + dòng quyết định + log `CREATED`).
- **`ProductionJobsController`/`Service`** (`src/api/production-jobs/`) — "Quản lý sản xuất" (theo Job): `getProductionJobs`/`getProductionJob` (đọc) + `createJobs` (tạo mới, chỉ gọi được từ transaction duyệt LSX của `ProductionOrdersService.approveProductionOrder` — không có route tạo Job riêng) + `startJob`/`reportJob`/`holdJob`/`resumeJob` (vòng đời sau khi Job đã tồn tại, có route riêng ở `/production-jobs/:jobId/*` — xem "Vòng đời Job + báo sản lượng").

`ProductionOrdersModule` import `ProductionJobsModule` để `approveProductionOrder` gọi được `createJobs`.

## API contract

Bảng route/DTO đầy đủ: Swagger UI ở `/api-docs` (tự sinh từ `@ApiAuth`/`@ApiPublic`, luôn khớp code). Dưới đây chỉ ghi ngữ nghĩa không đọc được từ signature.

`GET /production-orders` sắp `dueDate` PO tăng dần rồi `createdAt` PO giảm dần; `GET /production-jobs` sắp `dueDate` PO tăng dần rồi `approvedAt` LSX giảm dần.

## Trường hợp lỗi

| Trường hợp                                                                                    | ErrorCode        | HTTP status |
| --------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| Không tìm thấy đơn hàng gốc, hoặc đơn đã bị xoá mềm (`GET`/`PATCH`/`.../approve`)             | `ErrorCode.E057` | 404         |
| PO gốc không còn `AWAITING_PRODUCTION` (`.../approve`)                                        | `ErrorCode.E076` | 409         |
| `orderItemId` không thuộc chính LSX này (`PATCH /production-orders/:productionOrdersId`)      | `ErrorCode.E078` | 400         |
| Sửa `items` của một PO mà LSX đã `APPROVED` (`PATCH /orders/:orderId`, thuộc module `orders`) | `ErrorCode.E080` | 409         |
| Header LSX không tồn tại theo `productionOrdersId` (`GET`/`PATCH`/`.../approve`/`.../logs`)   | `ErrorCode.E081` | 404         |
| Không tìm thấy Job (`GET /production-jobs/:jobId`)                                            | `ErrorCode.E082` | 404         |
| `.../approve` gọi trên một LSX không còn `PENDING` (đã `APPROVED` từ trước)                   | `ErrorCode.E083` | 409         |
| `PATCH /production-orders/:productionOrdersId` gọi trên một LSX không còn `PENDING`           | `ErrorCode.E084` | 409         |
| `start`/`report`/`hold`/`resume` gọi trên một Job không ở trạng thái hợp lệ cho hành động đó       | `ErrorCode.E087` | 409         |
| `report` mà `producedQty + rejectedQty` cộng dồn vượt `quantity` của Job                       | `ErrorCode.E088` | 400         |
| `report` mà cả `producedQty` lẫn `rejectedQty` đều không gửi hoặc đều bằng 0                    | `ErrorCode.E089` | 400         |
| Role của caller thiếu quyền mà route yêu cầu                                                  | `ErrorCode.E033` | 403         |
| Không gửi bearer token                                                                        | —                | 401         |

`E077`/`E079` không có nhánh nào throw qua `/production-orders*` — giữ trong `ErrorCode` như mã dự phòng, chưa có API nào dùng tới.

## Ngoài phạm vi

Huỷ duyệt LSX (đưa `APPROVED` quay lại `PENDING`) · Ghi nhận xuất kho khi duyệt LSX (`approveProductionOrder` sinh Job nhưng chưa lập phiếu xuất kho) · Kiểm tra tồn kho tổng hợp trước khi duyệt (ca 2 dòng PO khác nhau cùng sản phẩm cộng dồn "Lấy từ tồn" vượt tồn thực tế, xem "Sinh Job khi duyệt LSX") · làm mới `onHandQty`/`availableQty`/`orderQty` theo tồn hiện tại khi sửa số lượng hoặc khi đọc chi tiết (cả hai đều chỉ là snapshot tĩnh) · gắn công đoạn từ `routing_steps` (tiến độ theo từng công đoạn, không chỉ ở mức Job) · nhập kho thành phẩm tự động khi Job hoàn thành (vẫn lập phiếu tay như hiện tại) · phiếu lãnh/xuất vật tư theo Job (mở khoá "Đã giữ"/"Có thể xuất" ở màn tồn kho vật tư, xem `docs/features/inventory.md`) · tự động chuyển `orders.status → COMPLETED` khi mọi Job của một LSX xong · xoá một LSX/Job, hoặc sửa từng dòng quyết định của một LSX `APPROVED` · Job cho bán thành phẩm (WIP) / nổ BOM xuống vật tư · gán tổ/máy/nhân công cho Job · báo cáo sản lượng/hiệu suất · note riêng cho LSX · cập nhật `GET /orders/stats` theo bộ trạng thái mới (xem `orders.md`) · thêm lại một trạng thái kết thúc cho Job.

Theo dõi tiến độ Job ở **mức Job** (vòng đời `status` + `producedQty`/`rejectedQty`) đã được xây, xem "Vòng đời Job + báo sản lượng"; theo từng công đoạn vẫn ngoài phạm vi.

## Thay đổi phá vỡ gần nhất

Chỉ hợp đồng hiện hành cho FE — không phải chuỗi lịch sử thay đổi (xem `git log -- docs/features/production.md` nếu cần lịch sử đầy đủ).

- `GET /production-jobs` (list) và `GET /production-jobs/:jobId` + 4 route ghi (`start`/`report`/`hold`/`resume`, detail) trả **hai DTO khác nhau** — xem bảng field ở "Response list vs detail".
- `ProductionJobDetailResDto` chỉ còn đúng 12 cột của bảng `production_jobs`, không có field join (PO/khách hàng/sản phẩm) — FE lấy các field đó từ dòng tương ứng ở `GET /production-jobs`.
- Không có route đọc lịch sử thao tác Job (`GET /production-jobs/:jobId/logs` không tồn tại) — LSX vẫn có (`GET /production-orders/:productionOrdersId/logs`).
- `POST /production-jobs/:jobId/hold` không nhận body. `ReportProductionJobReqDto` chỉ có `producedQty?`/`rejectedQty?`.
- `production_jobs.status` chỉ có 3 giá trị (`PENDING`/`IN_PROGRESS`/`WAITING`), không có điểm kết thúc — không có route nào đánh dấu Job "đã xong".

## Xem thêm

- `orders` — nguồn PO/`order_items`; điều kiện duyệt và luồng trạng thái đầy đủ ở `docs/features/orders.md`.
- `inventory` — nguồn `onHand`/`reserved`; xem `docs/features/inventory.md`.
- `docs/architecture.md` — thứ tự ghi qua nhiều module khi duyệt PO/duyệt LSX.
