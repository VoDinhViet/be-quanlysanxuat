# Tính năng: Production (Lệnh sản xuất — LSX) & Job

## Mục đích

Nối tiếp luồng duyệt PO (`docs/features/orders.md`): một PO đã được Giám đốc duyệt (`AWAITING_PRODUCTION`) cần được kiểm tra tồn thành phẩm và ra quyết định sản xuất trước khi thực sự sản xuất. Đây chính là phần "Module LSX" mà cả `orders.md` lẫn `inventory.md` đã ghi là khoảng trống ở giữa hai module đó.

Ba tầng dữ liệu đều được ghi (đảo từ mô hình 1-dòng-PO-1-LSX ban đầu, xem "Ba tầng dữ liệu" bên dưới):

```
1 đơn hàng (PO đã duyệt)  =  1 LSX                         (production_orders — header)
   └─ phần con "quyết định sản xuất": danh sách dòng PO     (production_order_items)
        └─ mỗi sản phẩm FG có SL cần SX > 0  =  1 Job       (production_jobs, sinh khi duyệt LSX)
```

Luồng hiện tại: **duyệt PO xong, hệ thống tự sinh sẵn LSX** (header `PENDING`) và các dòng quyết định sản xuất cho từng dòng PO, tính theo tồn thành phẩm hiện có tại thời điểm duyệt. Trong lúc còn `PENDING`, người dùng có thể **sửa số lượng sản xuất từng dòng** (`PATCH /production-orders/:productionOrdersId`, nhập tay, xem "Sửa số lượng sản xuất" bên dưới). Giám đốc/quản lý sản xuất sau đó **duyệt LSX** (`POST /production-orders/:productionOrdersId/approve`, `PENDING → APPROVED`, xem "Luồng duyệt LSX" bên dưới) — thay thế cho "Lưu lại"/"Tạo LSX" cũ đã bỏ 2026-07-30 (xem "Bỏ hai API ghi cũ"). `GET /production-orders/:productionOrdersId` vẫn đọc lại được header + các dòng này, nhưng chỉ là **snapshot đã ghi lúc duyệt PO** (hoặc lúc sửa số lượng gần nhất) — không tính lại live qua `InventoryService` như bản Tab2 cũ (xem "Đọc lại chi tiết bằng snapshot").

Phạm vi hiện tại: sinh dữ liệu LSX khi duyệt PO + sửa số lượng sản xuất (khi còn `PENDING`) + duyệt LSX (đồng thời sinh Job) + log lịch sử thao tác (`GET .../logs`) + `GET /production-orders` (list) + `GET /production-orders/:productionOrdersId` (snapshot chi tiết) + `GET /production-jobs*` (đọc Job). Huỷ duyệt LSX, ghi nhận xuất kho khi duyệt LSX, kiểm tra tồn kho tổng hợp trước khi duyệt, theo dõi tiến độ Job, gắn công đoạn (`routing_steps`), báo cáo sản lượng, refresh tồn kho khi sửa số lượng là việc của một tính năng sau.

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

Công thức chỉ còn chạy ở **một chỗ** kể từ 2026-07-30: `ProductionOrdersService.getInitialPlanItems`, gọi lúc duyệt PO (không có override — khái niệm "quyết định đã lưu để đọc lại" gắn với "Lưu lại"/Tab2, cả hai đã bỏ cùng ngày). Cả `getInitialPlanItems` lẫn phần ghi (`seedPlan`) đều nằm trong `ProductionOrdersService`, chỉ được `OrdersService.approveOrder` gọi cross-module — không còn nơi nào khác tính lại công thức này.

`max(0, ...)` chặn đề xuất về âm khi tồn đã dư hơn PO.

**Hai dòng PO khác nhau cùng một SP tính đề xuất độc lập trên cùng con số Khả dụng** tại thời điểm duyệt — có thể cùng "xí" một lượng tồn nếu cả hai đều có "Lấy từ tồn" > 0. Bản trước đây có một chốt chặn ở bước phát hành cho ca này; bước đó đã bỏ (xem "Bỏ hai API ghi cũ" bên dưới) và không được `approveProductionOrder` khôi phục — hàm này chỉ đổi status/mã, không tính lại hay kiểm tra lại tồn — nên hiện không còn chốt chặn nào ở tầng ứng dụng cho việc này.

### LSX + quyết định sản xuất tự sinh khi duyệt PO

`POST /orders/:orderId/approve` (đã có, xem `orders.md`) vẫn **đồng thời**:

1. Tạo 1 header `production_orders` (`status = PENDING`) cho PO đó.
2. Ghi sẵn các dòng `production_order_items`, một dòng cho mỗi dòng PO `NORMAL`, với Đề xuất SX tính theo công thức trên tại thời điểm duyệt.

Cả hai chạy cùng một transaction với việc chuyển PO sang `AWAITING_PRODUCTION`. Người dùng có thể sửa số lượng từng dòng sau khi ghi, miễn LSX còn `PENDING` (`PATCH /production-orders/:productionOrdersId`, xem "Sửa số lượng sản xuất" ngay dưới đây), rồi mới duyệt cả LSX (xem "Luồng duyệt LSX"). `GET /production-orders/:productionOrdersId` đọc lại được đúng những gì đã ghi ở bước này (hoặc đã sửa sau đó), không hơn (xem "Đọc lại chi tiết bằng snapshot" bên dưới).

Một PO bị từ chối (`POST .../reject`, quay về `DRAFT`) rồi sửa và duyệt lại sẽ ghi đè hoàn toàn header + dòng quyết định cũ (replace-all theo `orderId`) — không cộng dồn, không giữ lịch sử các lần duyệt trước.

### Sửa số lượng sản xuất (2026-07-30)

`PATCH /production-orders/:productionOrdersId` (quyền `production:update`) — sửa số lượng sản xuất (Đề xuất SX) từng dòng, **nhập tay**, chỉ hợp lệ khi LSX còn `PENDING` (`ErrorCode.E084` nếu đã `APPROVED`). Không phải phục hồi "Lưu lại" cũ (xem "Bỏ hai API ghi cũ") — khác cả khoá tra cứu (`production_orders.id`, không phải `orders.id`) lẫn semantics:

- **Partial, không replace-all**: body `{ items: [{ orderItemId, quantity }] }` — chỉ dòng có mặt trong `items` bị ghi, dòng không gửi giữ nguyên. `items: []` là no-op hợp lệ (không throw), khác bản "Lưu lại" cũ bắt buộc gửi đủ mọi dòng NORMAL.
- `orderItemId` phải thuộc chính LSX này, nếu không → `ErrorCode.E078` (400).
- Chỉ **tính lại `fromStockQty`** (= `max(0, orderQty − quantity mới)`, dùng `orderQty` snapshot đã lưu) — `orderQty`/`onHandQty`/`availableQty` giữ nguyên, **không** gọi lại `InventoryService` để refresh tồn kho hiện tại (vẫn ngoài phạm vi, xem "Ngoài phạm vi").
- Trả về `ProductionOrderDetailResDto` đầy đủ (gọi lại `getProductionOrdersById` sau khi ghi) — cùng shape response với `GET`/`.../approve`.

### Luồng duyệt LSX (2026-07-30)

Thay cho "Tạo LSX" cũ đã bỏ (xem "Bỏ hai API ghi cũ" bên dưới): `POST /production-orders/:productionOrdersId/approve` (quyền `production:approve`) — chỉ hợp lệ khi LSX đang `PENDING` **và** PO gốc vẫn `AWAITING_PRODUCTION` (`ErrorCode.E076` nếu không). Chốt LSX: `status → APPROVED`, sinh mã `LSXxxxx` (đếm số LSX `APPROVED`, cùng khuôn `OrdersService.generateOrderCode`), ghi `approvedBy`/`approvedAt`; đẩy PO gốc `orders.status → IN_PROGRESS`; và sinh Job (xem "Sinh Job khi duyệt LSX" ngay dưới đây) — tất cả trong cùng transaction. **Vẫn không** lập phiếu xuất kho — khác "Tạo LSX" cũ ở điểm này. Trả về `ProductionOrderDetailResDto` (gọi lại `getProductionOrdersById` sau khi transaction commit).

Một chiều: `APPROVED` là điểm cuối, chưa có route đưa LSX quay lại `PENDING` — xem "Ngoài phạm vi".

### Sinh Job khi duyệt LSX (2026-07-30)

`ProductionJobsService.createJobs`, gọi từ trong transaction của `approveProductionOrder` — sinh lại đúng phần Job của "Tạo LSX" cũ, nhưng gắn vào bước duyệt thay vì phát hành:

- Gộp mọi dòng `production_order_items` của LSX theo `productId`, chỉ giữ sản phẩm có tổng SL > 0 (khớp `chk_production_jobs_quantity`) — số liệu dùng đúng bản đã lưu tại thời điểm duyệt, kể cả đã sửa tay qua `updateProductionOrder`, không tính lại gì thêm.
- Mỗi sản phẩm giữ lại sinh đúng 1 dòng `production_jobs`, mã `JOBxxxx` (đếm toàn bảng `production_jobs`, không lọc theo LSX — cùng khuôn generator cũ trước 2026-07-30).
- Không có sản phẩm nào SL > 0 (LSX 0 dòng, hoặc mọi dòng đã sửa về 0) → không tạo Job nào, không lỗi.
- **Không** lập phiếu xuất kho `OUT`/`DELIVERY` cho "Lấy từ tồn" — khác "Tạo LSX" cũ, vẫn ngoài phạm vi (xem "Ngoài phạm vi").
- **Không** kiểm tra tồn kho tổng hợp trước khi duyệt (ca 2 dòng PO khác nhau cùng sản phẩm cộng dồn "Lấy từ tồn" vượt tồn thực tế) — cân nhắc lúc thiết kế, chủ động để ngoài phạm vi đợt này (xem "Ngoài phạm vi").

### Log LSX (2026-07-30)

`production_order_logs` — lịch sử thao tác trên một LSX: thời gian (`createdAt`), người thực hiện (`performedBy`), nội dung (`content`, mô tả tiếng Việt sẵn để hiển thị). `ProductionOrdersService.logAction` là nơi ghi duy nhất, luôn gọi **trong cùng transaction** với hành động đang log — không có route ghi log trực tiếp, không tách rời khỏi hành động (log và hành động cùng commit hoặc cùng rollback):

- `seedPlan` → `CREATED`, nội dung `"Tạo LSX (N dòng quyết định sản xuất)"`.
- `updateProductionOrder` → `QUANTITY_UPDATED`, chỉ ghi khi thực sự có dòng đổi (`items: []` không log gì) — nội dung liệt kê **từng dòng** đổi: `"Cập nhật SL sản xuất: <tên SP> <cũ> → <mới>; ..."` (cần 1 query `products` phụ để lấy tên). Route này nay nhận lại tham số `userId` (đã bỏ lúc mới thêm vì `production_order_items` không có `updatedBy` — nay cần để biết ai sửa).
- `approveProductionOrder` → `APPROVED`, nội dung `"Duyệt LSX <code>, sinh N Job"` (bỏ vế Job nếu N = 0).

Đọc qua `GET /production-orders/:productionOrdersId/logs` (phân trang, mới nhất trước), tái dùng quyền `production:read`, không cần `ErrorCode` mới (404 dùng lại `E081`).

`content` là `varchar(1000)` — nội dung quá dài (nhiều dòng đổi cùng lúc, tên sản phẩm dài) bị cắt bớt (`.slice(0, 1000)`) ở tầng service trước khi ghi, tránh Postgres throw lỗi cột quá dài; chưa xử lý ellipsis đẹp cho ca này. `onDelete: 'cascade'` từ `production_orders` — khi header bị xoá để ghi đè (replace-all lúc `seedPlan`/`OrdersService.updateOrder` xoá LSX `PENDING`), log cũ mất theo, kế thừa đúng hành vi `production_order_items` đang có, không phải rủi ro mới.

### Bỏ hai API ghi cũ (2026-07-30)

Trước khi có route duyệt ở trên, hai route ghi gốc trên LSX đã bị bỏ hẳn trong cùng ngày:

- `PATCH /production-orders/:orderId` ("Lưu lại", replace-all mọi dòng NORMAL, khoá theo `orders.id`) — bỏ cùng `UpdateProductionOrderReqDto`/`UpdateProductionOrderItemReqDto` cũ. Cùng ngày, route `PATCH /production-orders/:productionOrdersId` **sống lại dưới tên method `updateProductionOrder`** nhưng khác khoá (`production_orders.id`) và khác semantics (partial, chỉ sửa `quantity`/`fromStockQty` — xem "Sửa số lượng sản xuất") — không phải phục hồi nguyên bản "Lưu lại".
- `POST /production-orders/:orderId/issue` ("Tạo LSX", phát hành) — bỏ cùng cơ chế nó từng làm: chốt lại dòng quyết định, gộp SL theo sản phẩm sinh **Job** (`ProductionJobsService.issueJobs`), lập phiếu xuất kho `OUT`/`DELIVERY` khi có "Lấy từ tồn", và chuyển PO sang `IN_PROGRESS`. `approveProductionOrder` ở trên chỉ khôi phục lại đúng phần đổi status + chuyển PO — **không** khôi phục sinh Job/xuất kho.

Hệ quả còn lại từ lần bỏ này (một phần đã được luồng duyệt mới lấp lại, ghi rõ ở từng gạch đầu dòng):

- ~~`production_jobs` sẽ không có dòng mới~~ — **đã lấp lại**: `createJobs` sinh Job ngay khi duyệt LSX (xem "Sinh Job khi duyệt LSX"), gắn vào bước duyệt thay vì phát hành.
- Không còn phiếu xuất kho `OUT`/`DELIVERY` nào được hệ thống tự lập cho LSX nữa. **Chưa được lấp lại** — vẫn ngoài phạm vi.
- ~~PO không còn đường nào rời `AWAITING_PRODUCTION`~~ — **đã lấp lại**: `approveProductionOrder` đẩy PO sang `IN_PROGRESS`.
- ~~`production_orders.status` sẽ luôn là `PENDING`~~ — **đã lấp lại**: nay đạt được `APPROVED` qua route duyệt mới (enum rút còn 2 giá trị, xem "Mô hình dữ liệu" — không còn `ISSUED`, và cũng không có `CANCELLED`).
- ~~`ErrorCode.E078` không có nhánh nào throw~~ — **đã sống lại**: `updateProductionOrder` throw khi `orderItemId` không thuộc LSX (xem "Sửa số lượng sản xuất"). `E077`/`E079` vẫn không có nhánh nào throw (gắn với "Tạo LSX" đã bỏ, không có API nào khôi phục ý nghĩa cũ của chúng) — giữ trong `ErrorCode` enum như mã dự phòng. `E076`/`E080` thì **đã sống lại** qua route duyệt mới (xem "API contract"/"Trường hợp lỗi").

### Đọc lại chi tiết bằng snapshot (2026-07-30)

`GET /production-orders/:orderId` từng đọc **live** (tính lại Đề xuất SX mỗi lần đọc qua `InventoryService`, gọi là Tab2) rồi bị bỏ cùng lúc với hai API ghi cũ ở trên. Cùng ngày, route được thêm lại dưới hình dạng đơn giản hơn và **đổi khoá tra cứu**: `GET /production-orders/:productionOrdersId` — path param giờ là `production_orders.id` (chính nó), không còn là `orders.id` như bản cũ. `ProductionOrdersService.getProductionOrdersById` chỉ **một** query Drizzle: `productionOrders.findFirst({ where: eq(productionOrders.id, ...), with: { order: {...}, items: {...} } })`, không query `orders` riêng, không gọi lại `InventoryService`/`computeLines`. Đây cũng là response chung cho `approveProductionOrder` (xem "Luồng duyệt LSX" ở trên).

Hệ quả khác với Tab2 cũ:

- Số liệu trả về (`quantity`/`onHandQty`/`availableQty`/`fromStockQty`) là snapshot tại thời điểm duyệt PO gần nhất (hoặc lúc sửa số lượng gần nhất qua `updateProductionOrder`, xem "Sửa số lượng sản xuất") — có thể lệch tồn kho thực tế nếu tồn đã đổi từ lúc đó, vì sửa số lượng không refresh `onHandQty`/`availableQty` và cũng không tính lại live qua `InventoryService`.
- Route tra theo `production_orders.id` nên điều kiện tồn tại chỉ còn một: có hay không có header đó (`E081`) — không kiểm tra `orders` riêng.
- **Shape response khác hẳn list**: `ProductionOrderResDto` (list) để phẳng `orderId`/`orderCode`/`client`/`orderDate`/`dueDate`/`note` vì query dùng `.select()` + join nên SQL đã trả sẵn dạng phẳng. `ProductionOrderDetailResDto` (detail) lồng toàn bộ phần đó vào một field `order: OrderRefResDto` (`src/api/orders/dto/order-ref.res.dto.ts`, `{ id, code, client, orderDate, dueDate, note }`) — vì query dùng Drizzle relational `with: { order: {...} }` nên kết quả vốn đã lồng sẵn theo shape đó; `plainToInstance` map thẳng, service không cần remap field nào bằng tay. Hai DTO **không** extends nhau (khác shape order, không dùng lại được).
- `ProductionOrderResDto` (list) có thêm field `id` (`production_orders.id`) để client lấy khoá tra cứu ngay từ dòng danh sách — **breaking change nhỏ cho response `GET /production-orders`**: thêm field `id`, không đổi/xoá field nào khác.

### Ba tầng dữ liệu — đảo quyết định 2026-07-29

Bản dựng đầu tiên hiểu sai đơn vị "lệnh sản xuất": 1 bảng `production_orders` duy nhất, **1 dòng cho mỗi dòng PO**, mỗi dòng một mã `LSXxxxx` riêng — một PO 5 sản phẩm sinh ra 5 LSX. Cùng ngày, đã tách lại đúng nghĩa nghiệp vụ thành 3 tầng:

- `production_orders` — header, **1 đơn hàng = 1 LSX** (`orderId` unique).
- `production_order_items` — phần con "quyết định sản xuất", 1 dòng/dòng-PO (giữ 1-1 với `orderItemId` vì phiếu xuất kho cần khoá theo đó).
- `production_jobs` — **1 sản phẩm (FG) = 1 Job**, gộp mọi dòng cùng sản phẩm trong LSX. Trước 2026-07-30 chỉ sinh khi phát hành; đường ghi đó bị bỏ rồi sống lại cùng ngày dưới tên `createJobs`, gắn vào bước duyệt LSX thay vì phát hành (xem "Sinh Job khi duyệt LSX").

Trước đó cùng ngày cũng đã có một lần gộp 2 bảng (`production_plans`/`production_orders`) thành 1 bảng có cột `status` lưu trực tiếp thay vì suy ra bằng `EXISTS` — quyết định đó **vẫn giữ** ở tầng header (`production_orders.status`), chỉ không còn đúng ở tầng "mỗi dòng PO một LSX" nữa.

### Không có xoá/sửa/huỷ duyệt LSX đã duyệt

Bản này không có endpoint xoá một LSX hay một Job. Sửa số lượng sản xuất (`updateProductionOrder`, xem "Sửa số lượng sản xuất") chỉ hợp lệ khi LSX còn `PENDING` — một LSX đã `APPROVED` không sửa được từng dòng nữa (`E084`), và cũng chưa có cách huỷ duyệt (đưa về lại `PENDING`) — xem "Ngoài phạm vi". `production_order_items.orderItemId` là FK `restrict` (bảo vệ dòng đã gắn với một LSX `APPROVED` khỏi mất liên kết) — hệ quả:

- Sửa dòng PO nguồn (`PATCH /orders/:orderId` với `items`) sau khi LSX của đơn đó đã `APPROVED` bị chặn ở tầng service (`E080`, 409), tránh nổ 500 thô từ constraint. Nhánh này sống lại cùng luồng duyệt mới (trước đó kiểm tra `ISSUED`, một trạng thái không còn ai ghi — xem "Bỏ hai API ghi cũ").
- Một LSX đang `PENDING` (kế hoạch, chưa duyệt) **không** chặn sửa `items` — `OrdersService.updateOrder` tự xoá header `production_orders` của đơn đó ngay trong transaction (cascade dọn `production_order_items`), trước khi `order_items` bị replace-all. Hệ quả: sửa `items` của một PO đang ở trạng thái này xoá sạch hồ sơ LSX đã lưu; duyệt lại (nếu PO quay về được `PENDING_CONFIRMATION`) sẽ tính lại Đề xuất SX từ đầu cho bộ dòng mới.

Vẫn không có endpoint **xoá** một LSX hay một Job — nhưng một Job giờ có vòng đời riêng để đóng lại (`cancelJob`, xem ngay dưới đây), không còn là "chỉ đọc" như trước 2026-07-30.

### Vòng đời Job + báo sản lượng (2026-07-30)

Trước ngày này, `production_jobs` chỉ đọc được — sinh ra khi duyệt LSX (`createJobs`) rồi không có đường ghi nào khác. Đợt này lấp khoảng trống "theo dõi tiến độ Job" ở **mức Job** (chưa chia theo công đoạn `routing_steps` — xem "Ngoài phạm vi"): `ProductionJobsService` thêm 6 route ghi + 1 route đọc log, tất cả dưới `/production-jobs/:jobId/*`.

Chuyển trạng thái hợp lệ (`E087` nếu gọi sai):

| Từ | Hành động | Sang | Ghi thêm |
| --- | --- | --- | --- |
| `PENDING` | `start` | `IN_PROGRESS` | `startedBy`/`startedAt` |
| `IN_PROGRESS` | `report` | `IN_PROGRESS` (không đổi status) | cộng dồn `producedQty`/`rejectedQty` |
| `IN_PROGRESS` | `pause` | `PAUSED` | — |
| `PAUSED` | `resume` | `IN_PROGRESS` | — |
| `IN_PROGRESS`/`PAUSED` | `complete` | `COMPLETED` | `completedBy`/`completedAt` |
| `PENDING`/`IN_PROGRESS`/`PAUSED` | `cancel` | `CANCELLED` | `cancelledBy`/`cancelledAt`/`cancelReason` |

`COMPLETED`/`CANCELLED` là điểm cuối — không có route đưa Job quay lại từ hai trạng thái này.

- **Báo sản lượng cộng dồn, không ghi đè**: mỗi lần `report` cộng `producedQty`/`rejectedQty` thêm vào số đã có — hai lần báo `{producedQty: 10}` cho ra tổng `20`, không phải `10`. Phải gửi ít nhất một trong hai giá trị > 0 (`E089`); tổng cộng dồn sau khi cộng không được vượt `quantity` của Job (`E088`, kiểm ở service để ra 400 sạch thay vì để lộ lỗi constraint `chk_production_jobs_report_qty` 500 thô).
- **`complete` cho phép kết thúc sớm**: `producedQty < quantity` vẫn hoàn thành được — không bắt buộc phải báo đủ số. Số còn thiếu đơn giản là không được sản xuất, không phải lỗi.
- **Không tự động nhập kho thành phẩm khi `complete`.** Thủ kho vẫn tự `POST /stock-receipts` (`subject=FINISHED_GOOD`, `reason=PRODUCTION`) như hiện tại — tự động hoá việc này cân nhắc lúc thiết kế nhưng chủ động để ngoài phạm vi đợt này (rủi ro lệch số nếu `producedQty` báo sai rồi mới sửa), xem "Ngoài phạm vi".
- **Không tự động chuyển `orders.status → COMPLETED`** khi mọi Job của một LSX đều `COMPLETED`. `OrderStatus.COMPLETED` đang được `GET /orders/stats` dùng làm proxy cho "đã giao" (xem `docs/features/orders.md`) — sản xuất xong chưa phải giao xong, tự chuyển status ở đây sẽ làm proxy đó sai sớm hơn thực tế.
- **`cancel` dùng quyền `production:approve`**, khác 5 route còn lại (`production:update`) — huỷ một Job đã duyệt (đã tốn công sinh ra từ một LSX `APPROVED`) là quyết định cấp quản lý, cùng mức với duyệt LSX. `reason` bắt buộc, ghi vào cả `cancelReason` lẫn nội dung log.
- **Không có cột `pauseReason`** — tạm dừng lặp lại được (`pause`/`resume` nhiều lần) nên một cột sẽ bị ghi đè mất lịch sử các lần dừng trước; lý do tạm dừng chỉ nằm trong nội dung log (`production_job_logs`).
- **Log Job** (`ProductionJobsService.logAction`, cùng khuôn `ProductionOrdersService.logAction` của LSX) — mỗi hành động ở bảng trên ghi đúng 1 dòng `production_job_logs` trong cùng transaction (log và hành động cùng commit hoặc cùng rollback), đọc qua `GET /production-jobs/:jobId/logs`.

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

**`production_jobs`** — 1 sản phẩm (FG) = 1 Job trong một LSX, `onDelete: 'cascade'` từ `production_orders`, unique `(productionOrderId, productId)`, sinh qua `createJobs` khi duyệt LSX (xem "Sinh Job khi duyệt LSX"):

| Cột                                         | Ghi chú                                                         |
| -------------------------------------------- | --------------------------------------------------------------- |
| `code`                                      | `JOBxxxx`, notNull, unique                                      |
| `productionOrderId`, `productId`            |                                                                 |
| `quantity`                                  | Σ Đề xuất SX của SP đó trong LSX tại thời điểm duyệt (luôn > 0) |
| `status`                                    | `PENDING` (default) \| `IN_PROGRESS` \| `PAUSED` \| `COMPLETED` \| `CANCELLED` — thêm 2026-07-30, xem "Vòng đời Job + báo sản lượng" |
| `producedQty`, `rejectedQty`                | `numeric`, default `0` — cộng dồn qua từng lần `report`, thêm 2026-07-30 |
| `startedBy`/`startedAt`                     | nullable, ghi khi `start`                                       |
| `completedBy`/`completedAt`                 | nullable, ghi khi `complete`                                    |
| `cancelledBy`/`cancelledAt`, `cancelReason` | nullable, ghi khi `cancel`                                      |

CHECK `chk_production_jobs_quantity`: `quantity > 0`. CHECK `chk_production_jobs_report_qty` (thêm 2026-07-30): `produced_qty >= 0 AND rejected_qty >= 0 AND produced_qty + rejected_qty <= quantity`. CHECK `chk_production_jobs_status_fields` (thêm 2026-07-30): `PENDING` thì `started_at`/`completed_at`/`cancelled_at` đều NULL; `COMPLETED` thì `completed_at` NOT NULL; `CANCELLED` thì `cancelled_at` NOT NULL — không ràng buộc gì thêm cho `IN_PROGRESS`/`PAUSED` (đơn giản hoá có chủ đích).

**`production_job_logs`** (thêm 2026-07-30) — lịch sử thao tác trên một Job, cùng khuôn `production_order_logs` (append-only, không có `updatedAt`), `onDelete: 'cascade'` từ `production_jobs`. Ghi qua `ProductionJobsService.logAction`, đọc qua `GET /production-jobs/:jobId/logs`:

| Cột           | Ghi chú                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| `jobId`       |                                                                              |
| `action`      | `STARTED` \| `REPORTED` \| `PAUSED` \| `RESUMED` \| `COMPLETED` \| `CANCELLED` |
| `content`     | `varchar(1000)`, mô tả tiếng Việt sẵn để hiển thị, sinh lúc ghi             |
| `performedBy` | nullable (`set null` nếu credential bị xoá) — ai thực hiện hành động       |
| `createdAt`   | thời điểm thực hiện                                                         |

**`production_order_logs`** — lịch sử thao tác, `onDelete: 'cascade'` từ `production_orders`, append-only (không có `updatedAt`, cùng khuôn `order_attachments`/`client_contacts`). Ghi qua `ProductionOrdersService.logAction`, đọc qua `GET /production-orders/:productionOrdersId/logs` (xem "Log LSX"):

| Cột                 | Ghi chú                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `productionOrderId` |                                                                      |
| `action`            | `CREATED` \| `QUANTITY_UPDATED` \| `APPROVED`                        |
| `content`           | `varchar(1000)`, mô tả tiếng Việt sẵn để hiển thị, sinh lúc ghi      |
| `performedBy`       | nullable (`set null` nếu credential bị xoá) — ai thực hiện hành động |
| `createdAt`         | thời điểm thực hiện                                                  |

Không có cột `stockReceiptId` ở đâu — đường nối LSX ↔ phiếu xuất kho (khi còn cơ chế phát hành) là qua `stock_receipt_items.orderItemId = production_order_items.orderItemId`.

## Module

Hai module tách biệt (đảo từ "1 module duy nhất" của bản gộp `production_orders`/`production_plans` trước đó — Job là một khái niệm/vòng đời khác, "Quản lý sản xuất" là màn hình việc-làm-thực-tế của xưởng, không phải một hình dạng đọc khác của cùng LSX):

- **`ProductionOrdersController`/`Service`** (`src/api/production-orders/`) — phía đọc: `getProductionOrders` (list, `GET /production-orders`), `getProductionOrdersById` (snapshot chi tiết, `GET /production-orders/:productionOrdersId`, xem "Đọc lại chi tiết bằng snapshot"), `getProductionOrderLogs` (lịch sử thao tác, `GET .../logs`, xem "Log LSX"); phía ghi: `updateProductionOrder` (xem "Sửa số lượng sản xuất") và `approveProductionOrder` (xem "Luồng duyệt LSX") — cả hai cùng `seedPlan` đều gọi `logAction` (private) để ghi log; cộng 2 method public chỉ phục vụ `OrdersService.approveOrder` khi duyệt PO: `getInitialPlanItems` (tính Đề xuất SX ban đầu) rồi `seedPlan` (ghi header + dòng quyết định + log `CREATED`). `issueProductionOrders` (route `.../issue` cũ) đã bỏ, không quay lại dưới tên đó (xem "Bỏ hai API ghi cũ").
- **`ProductionJobsController`/`Service`** (`src/api/production-jobs/`) — "Quản lý sản xuất" (theo Job): `getProductionJobs`/`getProductionJobDetail`/`getProductionJobLogs` (đọc) + `createJobs` (tạo mới, chỉ gọi được từ transaction duyệt LSX của `ProductionOrdersService.approveProductionOrder` — không có route tạo Job riêng) + `startJob`/`reportJob`/`pauseJob`/`resumeJob`/`completeJob`/`cancelJob` (vòng đời sau khi Job đã tồn tại, **có** route riêng ở `/production-jobs/:jobId/*`, thêm 2026-07-30 — xem "Vòng đời Job + báo sản lượng").

`ProductionOrdersModule` từng không import `ProductionJobsModule` (tách 2026-07-30 lúc "Tạo LSX" bị bỏ) — import lại cùng ngày để `approveProductionOrder` gọi được `createJobs`.

## API contract

| Method | Path                                             | Permission           | Request                                                                                                                                                                   | Response                                                                                                                                                           |
| ------ | ------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/production-orders`                             | `production:read`    | `GetProductionOrdersReqDto` — `limit`, `page`, `q` (khớp mờ mã PO/mã LSX), `status` (`PENDING`/`APPROVED`), `clientId`, `fromDate`/`toDate` (theo `dueDate`)              | `200` + `ProductionOrderResDto` phân trang — **màn hình chính LSX**, 1 dòng/PO                                                                                     |
| GET    | `/production-orders/:productionOrdersId`         | `production:read`    | —                                                                                                                                                                         | `200` + `ProductionOrderDetailResDto` — snapshot header + dòng quyết định sản xuất đã ghi lúc duyệt PO, không tính lại live (xem "Đọc lại chi tiết bằng snapshot") |
| PATCH  | `/production-orders/:productionOrdersId`         | `production:update`  | `UpdateProductionOrderReqDto` — `items` (partial, chỉ dòng cần sửa) `{ orderItemId, quantity }[]`, chỉ hợp lệ khi LSX còn `PENDING`                                       | `200` + `ProductionOrderDetailResDto` — sửa `quantity`/`fromStockQty` từng dòng (xem "Sửa số lượng sản xuất")                                                      |
| POST   | `/production-orders/:productionOrdersId/approve` | `production:approve` | —                                                                                                                                                                         | `200` + `ProductionOrderDetailResDto` — chốt LSX (`PENDING → APPROVED`), đẩy PO gốc sang `IN_PROGRESS`, sinh Job (xem "Luồng duyệt LSX"/"Sinh Job khi duyệt LSX")  |
| GET    | `/production-orders/:productionOrdersId/logs`    | `production:read`    | `GetProductionOrderLogsReqDto` — `limit`, `page`                                                                                                                          | `200` + `ProductionOrderLogResDto` phân trang — lịch sử thao tác, mới nhất trước (xem "Log LSX")                                                                   |
| GET    | `/production-jobs`                               | `production:read`    | `GetProductionJobsReqDto` — `limit`, `page`, `q` (khớp mờ mã Job/mã LSX/mã PO/mã-tên SP), `orderId`, `productId`, `status`, `clientId`, `fromDate`/`toDate` (theo `dueDate` của PO) | `200` + `ProductionJobResDto` phân trang — **"Quản lý sản xuất"**, 1 dòng/Job                                                                          |
| GET    | `/production-jobs/:jobId`                        | `production:read`    | —                                                                                                                                                                         | `200` + `ProductionJobResDto`                                                                                                                                      |
| POST   | `/production-jobs/:jobId/start`                  | `production:update`  | —                                                                                                                                                                         | `200` + `ProductionJobResDto` — `PENDING → IN_PROGRESS`                                                                                                            |
| POST   | `/production-jobs/:jobId/report`                 | `production:update`  | `ReportProductionJobReqDto` — `producedQty?`, `rejectedQty?`, `note?`                                                                                                     | `200` + `ProductionJobResDto` — cộng dồn `producedQty`/`rejectedQty`                                                                                                |
| POST   | `/production-jobs/:jobId/pause`                  | `production:update`  | `PauseProductionJobReqDto` — `reason?`                                                                                                                                    | `200` + `ProductionJobResDto` — `IN_PROGRESS → PAUSED`                                                                                                             |
| POST   | `/production-jobs/:jobId/resume`                 | `production:update`  | —                                                                                                                                                                         | `200` + `ProductionJobResDto` — `PAUSED → IN_PROGRESS`                                                                                                             |
| POST   | `/production-jobs/:jobId/complete`               | `production:update`  | —                                                                                                                                                                         | `200` + `ProductionJobResDto` — `IN_PROGRESS`/`PAUSED → COMPLETED`, cho phép kết thúc sớm                                                                          |
| POST   | `/production-jobs/:jobId/cancel`                 | `production:approve` | `CancelProductionJobReqDto` — `reason*`                                                                                                                                   | `200` + `ProductionJobResDto` — huỷ Job, quyết định cấp quản lý                                                                                                    |
| GET    | `/production-jobs/:jobId/logs`                   | `production:read`    | `GetProductionJobLogsReqDto` — `limit`, `page`                                                                                                                            | `200` + `ProductionJobLogResDto` phân trang — lịch sử thao tác Job, mới nhất trước                                                                                 |

(`*` = bắt buộc)

Đã bỏ 2026-07-30, không quay lại dưới tên đó (xem "Bỏ hai API ghi cũ"): `PATCH /production-orders/:orderId` ("Lưu lại", khoá theo `orders.id`), `POST /production-orders/:orderId/issue` ("Tạo LSX"). `PATCH /production-orders/:productionOrdersId` ở trên là route mới, khác khoá + semantics, không phải route cũ quay lại.

- `GET /production-orders` chỉ liệt kê PO có `status IN (AWAITING_PRODUCTION, IN_PROGRESS)` — PO chưa duyệt không thuộc phạm vi LSX.
- `GET /production-orders` sắp `dueDate` PO tăng dần rồi `createdAt` PO giảm dần; `GET /production-jobs` sắp `dueDate` PO tăng dần rồi `approvedAt` LSX giảm dần.

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
| `start`/`report`/`pause`/`resume`/`complete`/`cancel` gọi trên một Job không ở trạng thái hợp lệ cho hành động đó | `ErrorCode.E087` | 409 |
| `report` mà `producedQty + rejectedQty` cộng dồn vượt `quantity` của Job                       | `ErrorCode.E088` | 400         |
| `report` mà cả `producedQty` lẫn `rejectedQty` đều không gửi hoặc đều bằng 0                    | `ErrorCode.E089` | 400         |
| Role của caller thiếu quyền mà route yêu cầu                                                  | `ErrorCode.E033` | 403         |
| Không gửi bearer token                                                                        | —                | 401         |

`E077`/`E079` vẫn không có nhánh nào throw qua `/production-orders*` — gắn với "Tạo LSX" đã bỏ 2026-07-30, không có API nào khôi phục ý nghĩa cũ của chúng (xem "Bỏ hai API ghi cũ"). `E078` đã sống lại qua `updateProductionOrder` (xem "Sửa số lượng sản xuất").

## Ngoài phạm vi

Huỷ duyệt LSX (đưa `APPROVED` quay lại `PENDING`) — tạm hoãn đợt này, đã cân nhắc lúc thiết kế (không thêm cột DB riêng cho ca này để dễ bổ sung sau) nhưng chưa lộ route · Ghi nhận xuất kho khi duyệt LSX (khác "Tạo LSX" cũ đã bỏ 2026-07-30 — `approveProductionOrder` sinh Job nhưng chưa lập phiếu xuất kho) · Kiểm tra tồn kho tổng hợp trước khi duyệt (ca 2 dòng PO khác nhau cùng sản phẩm cộng dồn "Lấy từ tồn" vượt tồn thực tế — cân nhắc lúc thiết kế Job, chủ động để ngoài phạm vi, xem "Sinh Job khi duyệt LSX") · làm mới `onHandQty`/`availableQty`/`orderQty` theo tồn hiện tại khi sửa số lượng hoặc khi đọc chi tiết (cả hai đều chỉ là snapshot tĩnh, xem "Sửa số lượng sản xuất"/"Đọc lại chi tiết bằng snapshot") · gắn công đoạn từ `routing_steps` (tiến độ theo từng công đoạn, không chỉ ở mức Job) · nhập kho thành phẩm tự động khi Job hoàn thành (vẫn lập phiếu tay như hiện tại, xem "Vòng đời Job + báo sản lượng") · phiếu lãnh/xuất vật tư theo Job (mở khoá "Đã giữ"/"Có thể xuất" ở màn tồn kho vật tư, xem `docs/features/inventory.md`) · tự động chuyển `orders.status → COMPLETED` khi mọi Job của một LSX xong · xoá một LSX/Job, hoặc sửa từng dòng quyết định của một LSX `APPROVED` · Job cho bán thành phẩm (WIP) / nổ BOM xuống vật tư · gán tổ/máy/nhân công cho Job · báo cáo sản lượng/hiệu suất · note riêng cho LSX · cập nhật `GET /orders/stats` theo bộ trạng thái mới (đã là TODO riêng sẵn có, xem `orders.md`).

(Theo dõi tiến độ Job ở **mức Job** — vòng đời `status` + `producedQty`/`rejectedQty` — đã được xây 2026-07-30, xem "Vòng đời Job + báo sản lượng"; không còn nằm ngoài phạm vi. Phần còn lại — theo từng công đoạn — vẫn ngoài phạm vi, xem gạch đầu dòng trên.)

## Frontend integration notes

**2026-07-30 — bỏ hai route ghi gốc của LSX, breaking change:**

- `PATCH /production-orders/:orderId` (nút "Lưu lại") — xoá hẳn, gọi sẽ nhận 404 route-not-found.
- `POST /production-orders/:orderId/issue` (nút "Tạo LSX") — xoá hẳn, gọi sẽ nhận 404 route-not-found.

**2026-07-30 (cùng ngày, sau đợt trên) — `GET /production-orders/:orderId` quay lại dưới path param mới, đổi ý nghĩa dữ liệu:**

Route đổi thành `GET /production-orders/:productionOrdersId` (khoá theo `production_orders.id`, không còn `orders.id`) — **response DTO giữ nguyên shape cũ** (không cần đổi field mapping ở client), nhưng số liệu (`quantity`/`onHandQty`/`availableQty`/`fromStockQty`) là **snapshot tĩnh** tại thời điểm duyệt PO, không tính lại theo tồn kho hiện tại mỗi lần mở màn (khác hành vi Tab2 trước đây). Client cần bỏ mọi giả định "số liệu luôn mới nhất khi mở lại màn chi tiết".

**2026-07-30 (cùng ngày, sau hai đợt trên) — thêm route Duyệt LSX, breaking change trên `production_orders` fields + `production_jobs`:**

- Route mới: `POST /production-orders/:productionOrdersId/approve` (nút "Duyệt LSX"), quyền `production:approve`. Client cần thêm nút này lên màn chi tiết LSX khi `status = PENDING`. **Chưa có** nút/route "Huỷ duyệt" — LSX đã `APPROVED` hiện là điểm cuối, không sửa/huỷ được qua API (tạm hoãn, xem "Ngoài phạm vi").
- **`status` chỉ còn 2 giá trị: `PENDING`/`APPROVED`** — không có `CANCELLED`/`ISSUED`.
- `ProductionOrderDetailResDto`: field `issuedAt` đổi tên thành `approvedAt`.
- `ProductionJobResDto`: field `issuer` đổi tên thành `approver`, `issuedAt` đổi tên thành `approvedAt`. Tại thời điểm đổi tên, `production_jobs` chưa có đường ghi nào nên `GET /production-jobs*` còn rỗng — đường ghi được lấp lại cùng ngày, sau đó (xem mục Duyệt LSX sinh Job bên dưới), lúc đó field đã mang tên mới sẵn.

**2026-07-30 (cuối ngày) — thêm route Sửa số lượng sản xuất, additive:**

- Route mới: `PATCH /production-orders/:productionOrdersId`, quyền `production:update`. Client thêm ô nhập số lượng (nhập tay) từng dòng quyết định sản xuất, chỉ hiển thị/cho sửa khi `status = PENDING` — ẩn/khoá khi đã `APPROVED` (gọi vẫn được nhưng nhận `E084`).
- Body **partial**: chỉ gửi những dòng thực sự sửa (`{ items: [{ orderItemId, quantity }] }`), không cần gửi đủ mọi dòng NORMAL của LSX.
- Response trả về `ProductionOrderDetailResDto` đầy đủ (không chỉ dòng vừa sửa) — client có thể thay nguyên state màn chi tiết bằng response này, `fromStockQty` đã được server tính lại sẵn.

**2026-07-30 (cuối ngày, sau đợt trên) — Duyệt LSX nay đồng thời sinh Job, additive:**

- `POST /production-orders/:productionOrdersId/approve` không đổi request/response shape, nhưng sau khi gọi thành công, LSX đó có thể đã có 1+ Job mới ở `/production-jobs*` (1 Job/sản phẩm SL > 0). Gợi ý FE điều hướng hoặc thông báo sang màn "Quản lý sản xuất" ngay sau khi duyệt thành công.
- LSX 0 dòng, hoặc mọi dòng đã sửa về SL = 0, thì duyệt xong sẽ **không** có Job nào — không phải lỗi.

**2026-07-30 (cuối ngày, sau đợt trên) — thêm route Log LSX, additive:**

- Route mới: `GET /production-orders/:productionOrdersId/logs` (phân trang, mới nhất trước), quyền `production:read`. Gợi ý FE thêm tab/section "Lịch sử" trên màn chi tiết LSX, hiển thị `content` trực tiếp (đã là câu tiếng Việt sẵn, không cần FE tự dựng từ dữ liệu thô).
- Không đổi request/response shape của `PATCH`/`.../approve` — chỉ có thêm dữ liệu log phía sau, gọi các route đó như cũ.

**2026-07-30 (đợt riêng, sau tất cả các đợt trên) — Vòng đời Job + báo sản lượng, additive:**

- 7 route mới dưới `/production-jobs/:jobId/*`: `start`/`report`/`pause`/`resume`/`complete`/`cancel` (POST, ghi) và `logs` (GET, phân trang) — xem "API contract" và "Vòng đời Job + báo sản lượng". Gợi ý FE thêm các nút hành động lên màn chi tiết Job, hiện/ẩn theo `status` hiện tại (bảng chuyển trạng thái hợp lệ ở mục trên).
- `ProductionJobResDto` thêm 6 field: `status`, `producedQty`, `rejectedQty`, `remainingQty`, `startedAt`, `completedAt` — **additive**, không đổi/xoá field cũ nào (`GET /production-jobs`/`GET /production-jobs/:jobId` vẫn giữ nguyên shape trước đó, chỉ có thêm field).
- `GetProductionJobsReqDto` thêm filter `status?`.
- Job mới sinh ra khi duyệt LSX (`createJobs`) luôn ở `status: PENDING` — không đổi hành vi duyệt LSX, chỉ có thêm trạng thái ban đầu để client hiển thị đúng ngay từ đầu.
- Client cần tự quyết định khi nào gọi `complete` dù `producedQty < quantity` (kết thúc sớm hợp lệ) — server không cảnh báo, không chặn.

## Xem thêm

- `orders` — nguồn PO/`order_items`; điều kiện duyệt và luồng trạng thái đầy đủ ở `docs/features/orders.md`.
- `inventory` — nguồn `onHand`/`reserved`; xem `docs/features/inventory.md`.
