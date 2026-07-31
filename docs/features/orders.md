# Tính năng: Orders (Đơn hàng)

Bối cảnh nghiệp vụ, vòng đời và bất biến: `docs/domains/orders.md`. File này là chi tiết mức module: quy tắc cụ thể, ngữ nghĩa endpoint, error code.

## Mục đích

Quản lý đơn hàng bán ("Sales Order") — chứng từ ghi nhận một đơn đặt hàng của khách: khách hàng, người liên hệ, nhân viên kinh doanh phụ trách, ngày đặt/ngày giao yêu cầu, danh sách dòng sản phẩm, và khối tổng tiền (chiết khấu đơn, VAT, phí vận chuyển). Đơn tạo ra ở `DRAFT`, phải qua duyệt (quyền Giám đốc trở lên) mới sang `AWAITING_PRODUCTION` — chỗ module `production` (LSX) đọc để kiểm tồn TP và ra quyết định sản xuất, xem `docs/features/production.md`.

## Quy tắc nghiệp vụ

### Mọi số tiền do server tính, không nhận từ client

`CreateOrderReqDto`/`UpdateOrderReqDto`/`OrderItemReqDto` **không có** trường `lineTotal`, `subtotal`, `discountAmount`, `vatAmount`, `total`. Client chỉ gửi các số đầu vào (`quantity`, `unitPrice`, `discountPercent` mỗi dòng; `discountType`/`discountValue`, `vatPercent`, `shippingFee` ở header) — mọi giá trị suy ra được tính lại trong Postgres bởi `OrdersService.recalculateTotals`, chạy ngay sau khi ghi xong dòng sản phẩm, trong cùng transaction với lần ghi đó. Client gửi kèm các trường này (nếu có) sẽ bị `ValidationPipe` loại bỏ (`whitelist: true`) — không lỗi, chỉ đơn giản là bị bỏ qua.

Công thức:

```
lineTotal      = round(quantity * unitPrice * (1 - discountPercent/100), 2)
subtotal       = sum(lineTotal) của các dòng status <> CANCELLED
discountAmount = discountType = PERCENT ? round(subtotal * discountValue/100, 2) : discountValue
vatAmount      = round((subtotal - discountAmount) * vatPercent/100, 2)
total          = subtotal - discountAmount + vatAmount + shippingFee
```

**Dòng ở trạng thái `CANCELLED` không cộng vào `subtotal`** — giữ ý nghĩa "Đã hủy" nhất quán với tên gọi.

### `clientId` tạm thời optional khi tạo đơn

`CreateOrderReqDto.clientId` là `UUIDFieldOptional` (nullable) — **tạm thời**, không phải quyết định nghiệp vụ lâu dài. `orders.client_id` ở schema cũng không có `NOT NULL`; `OrdersService.createOrder` chỉ gọi `ensureClientExists`/ném `E059` khi `clientId` thực sự được gửi, giống cách `staffId` hoạt động. `OrderResDto.client` theo đó cũng nullable — FE phải tự xử lý ca "chưa gán khách hàng" khi hiển thị. `UpdateOrderReqDto.clientId` không nullable — không hỗ trợ gỡ khách hàng khỏi đơn đã tạo qua `PATCH`.

### Người liên hệ là snapshot, không phải tham chiếu

`contactName`/`contactPhone`/`contactEmail` là 3 cột văn bản trên `orders`, sao chép từ một `client_contacts` do FE chọn tại thời điểm tạo đơn — **không có** `clientContactId` FK. Lý do: `ClientsService.replaceContacts` xoá-rồi-chèn-lại toàn bộ liên hệ mỗi lần khách hàng được sửa, nên id của một dòng `client_contacts` không ổn định theo thời gian — một FK thẳng vào đó sẽ mất liên kết mỗi khi ai đó sửa thông tin khách hàng, kể cả khi không đụng gì tới đơn hàng. Snapshot khớp với cách một chứng từ thương mại nên hoạt động: đóng băng dữ liệu tại thời điểm lập.

### Không có bảng tiền tệ/tỷ giá/điều khoản thanh toán riêng

`currency` (pgEnum `VND`/`USD`/`EUR`/`JPY`/`CNY`/`KRW`, mặc định `VND`) và `exchangeRate` (numeric, mặc định `1`) là cột trực tiếp trên `orders` — không dựng bảng `currencies`/`exchange_rates`. `paymentTerm` tái dùng `paymentTermEnum` đã có sẵn cho `suppliers` (`IMMEDIATE`/`NET_15`/`NET_30`/`NET_60`), import thẳng từ `suppliers.ts`. `exchangeRate` chỉ lưu và được dùng để quy đổi sang VND khi tính `GET /orders/stats` (xem mục riêng) — **không** dùng ở bất kỳ chỗ nào khác.

### Sản phẩm không snapshot

Mỗi `order_items` chỉ lưu `productId`, số lượng/đơn giá/chiết khấu do NVKD nhập, và `lineTotal` tính ra. Tên, ảnh, đơn vị tính của sản phẩm **luôn đọc qua quan hệ `product`** tại thời điểm đọc — không sao chép tên/ảnh vào dòng đơn hàng. Vì `products` xoá mềm (không xoá cứng) và FK `order_items.productId` là `restrict`, một dòng đơn hàng cũ luôn còn sản phẩm để join tới, kể cả khi sản phẩm đã bị `PATCH` sang `INACTIVE`/xoá mềm.

### Không có khái niệm "revision" trên dòng sản phẩm

Versioning sản phẩm là clone toàn bộ sản phẩm (`POST /products/:id/copy`), không phải một sub-resource lịch sử phiên bản (`product-revisions` không tồn tại, xem `CLAUDE.md`). `OrderItemReqDto`/`OrderItemResDto` không có trường nào liên quan tới revision; nếu UI cần hiển thị "phiên bản sản phẩm nào", nó phải tự suy ra từ `product.sourceProductId`/`product.code`, không có hỗ trợ riêng ở tầng đơn hàng.

### Vòng đời trạng thái và luồng duyệt

`status` gồm `DRAFT | PENDING_CONFIRMATION | AWAITING_PRODUCTION | IN_PROGRESS | COMPLETED | CANCELLED` (đọc trực tiếp từ `src/database/schemas/orders.ts` nếu cần — đây là danh sách đầy đủ):

```text
Tạo đơn → DRAFT (Nháp, sửa thoải mái)
   │ PATCH status=PENDING_CONFIRMATION (permission orders:update như mọi PATCH khác)
   ▼
PENDING_CONFIRMATION (Chờ xác nhận)
   │ POST .../approve (orders:approve)   │ POST .../reject (orders:approve, bắt buộc reason)
   ▼                                     ▼
AWAITING_PRODUCTION                   DRAFT (quay lại, kèm rejectionReason)
(Chờ sản xuất, LSX sinh sẵn PENDING)
   │ POST /production-orders/:id/approve
   │ (module production, production:approve)
   ▼
IN_PROGRESS → COMPLETED / CANCELLED (như cũ, qua PATCH)
```

**Chốt cứng duy nhất: `AWAITING_PRODUCTION` chỉ đạt được qua `POST /orders/:orderId/approve`.** `OrdersService.ensureStatusSettable` chặn `POST /orders`/`PATCH /orders/:orderId` set thẳng `status=AWAITING_PRODUCTION` (`E075`) — nếu không chặn, bất kỳ ai có quyền `orders:update` (không riêng Giám đốc) đều bỏ qua được bước duyệt. Mọi transition khác (kể cả `DRAFT → PENDING_CONFIRMATION`, và Huỷ từ bất kỳ trạng thái nào) vẫn lỏng — không có state machine chi tiết cho các bước đó, xem "Ngoài phạm vi". **`AWAITING_PRODUCTION` chỉ rời đi qua đúng một route, thuộc module `production`**: `POST /production-orders/:productionOrdersId/approve` (→ `IN_PROGRESS`), xem `docs/features/production.md`.

- **`orders:approve` là permission riêng**, tách khỏi `orders:update` — duyệt/từ chối là quyền Giám đốc trở lên. `POST .../approve`/`POST .../reject` chỉ hợp lệ khi đơn đang `PENDING_CONFIRMATION`, nếu không ném `E074`.
- **Từ chối bắt buộc lý do** (`RejectOrderReqDto.reason`), lưu vào `orders.rejectionReason` cùng `rejectedBy`/`rejectedAt` — chỉ giữ lần từ chối gần nhất, không phải bảng lịch sử. Tương tự, duyệt ghi `approvedBy`/`approvedAt` (cũng chỉ lần gần nhất).
- **`approveOrder` đồng thời sinh sẵn LSX** — 1 header `production_orders` (`status = PENDING`) + các dòng quyết định sản xuất `production_order_items` (một dòng mỗi dòng PO `NORMAL`) — trong cùng transaction với việc chuyển status, xem `docs/features/production.md`. Sửa được số lượng sản xuất từng dòng trong lúc LSX còn `PENDING`, rồi Giám đốc/quản lý sản xuất duyệt LSX đó ở bước tiếp theo — hiện chưa có cách huỷ duyệt nếu duyệt nhầm (tạm hoãn).
- **Sửa/xoá được ở mọi trạng thái trừ `COMPLETED`/`CANCELLED`** — với một ngoại lệ: `PATCH` đổi `items` bị chặn (`E080`) nếu LSX (`production_orders`, header) của đơn đã `APPROVED`, vì FK `restrict` sẽ nổ 500 nếu không chặn ở tầng service (LSX đang `PENDING` thì không chặn — `updateOrder` tự xoá header đó, cascade dọn `production_order_items`, trước khi thay `items`).

### Dòng sản phẩm: replace-all, có `sortOrder`

`items` trên `PATCH` theo ngữ nghĩa **replace-all** giống `attachmentFileIds`/`contacts` ở các module khác: gửi mảng mới (kể cả `[]`, xoá sạch dòng) thay hoàn toàn bộ dòng cũ; bỏ trống trường này thì giữ nguyên dòng hiện có. `sortOrder` là số nguyên client tự gán khi kéo-thả trên UI — service không tự đánh số lại, chỉ lưu nguyên giá trị gửi lên (mặc định `0`).

### Tài liệu đính kèm

`attachmentFileIds` cùng cơ chế replace-all và cùng bước `FilesService.linkFiles` chạy **trước** transaction, giống hệt `materials`/`suppliers`. `UploadType.ORDER_DOCUMENT` (kind `DOCUMENT`) cho `POST /files?type=ORDER_DOCUMENT`.

Định dạng chấp nhận cho kind `DOCUMENT` (chung toàn hệ thống, không riêng `orders`): **PDF, DOCX, XLSX** — `file-type` xác thực bằng magic-byte, `.doc`/`.xls` nhị phân cũ bị loại vì không có chữ ký đáng tin để phân biệt file thật với file giả mạo đổi đuôi. Xem `docs/features/files.md`.

### Toàn bộ route yêu cầu bearer token

Khác phần lớn module master-data, **mọi** route `/orders*` — kể cả các route đọc — đòi hỏi token hợp lệ (không có route nào `@Public()`/`@ApiPublic()`).

## API contract

Bảng route/DTO đầy đủ: Swagger UI ở `/api-docs` (tự sinh từ `@ApiAuth`/`@ApiPublic`, luôn khớp code). Dưới đây chỉ ghi ngữ nghĩa không đọc được từ signature.

- `q` khớp mờ (`unaccent` ILIKE) `code`.
- Danh sách sắp xếp **mới nhất trước** (`created_at DESC`).
- `code` tự sinh dạng `SOxxxx` nếu không truyền lên khi tạo (`E058` nếu mã truyền lên đã tồn tại); bất biến sau khi tạo — `UpdateOrderReqDto` không có trường này.
- `OrderResDto.expired` là cờ suy ra tại thời điểm đọc (`dueDate < now()` và `status` chưa `COMPLETED`/`CANCELLED`), tính trong Postgres qua `extras`, không lưu cột.
- `items[]`/`attachments[]` chỉ có đầy đủ ở `GET .../:id` và ngay sau `POST`/`PATCH` — danh sách (`GET /orders`) không load hai quan hệ này.
- Sau mọi lệnh ghi, service đọc lại đơn bằng `getOrderDetail(id)` rồi mới map — response luôn phản ánh trạng thái đã lưu, bao gồm các số tiền vừa được Postgres tính lại.

### `GET /orders/stats` — 6 thẻ dashboard

Một câu truy vấn duy nhất (`OrdersService.getOrderStats`), mỗi field là một `count(*)`/`sum(*) filter (where ...)` hoặc `round(...)` riêng — Postgres tính hết trong một lượt, không gộp nhóm rồi rút gọn bằng JS. `totalValue`/`completedValue` quy đổi mỗi đơn sang VND theo `exchangeRate` trước khi cộng, tránh gộp trực tiếp một đơn USD với một đơn VND.

**Hai field là xấp xỉ**, vì hệ thống không lưu lịch sử đổi trạng thái (chỉ có trạng thái _hiện tại_ của mỗi dòng):

- **`completedValue`** ("Đã giao"): chưa có bảng giao hàng/DO thật, tạm coi mọi đơn `COMPLETED` là "đã giao".
- **`expiredTrendCount`**: "trễ hạn tuần trước" được tính lại bằng `dueDate < now() - interval '7 days' AND status NOT IN (COMPLETED, CANCELLED)`, dùng **trạng thái hiện tại** chứ không phải trạng thái thật tại thời điểm 7 ngày trước. Một đơn từng trễ hạn nhưng sau đó chuyển `CANCELLED` sẽ không được tính vào "tuần trước", dù thực tế lúc đó nó đang trễ hạn.

`totalOrdersTrendPercent`/`totalValueTrendPercent` map qua một `.mapWith` riêng (không phải `.mapWith(Number)` mặc định) để giữ `null` thay vì bị ép về `0` khi chưa có tháng trước để so sánh — `Number(null) === 0` trong JS, dễ đọc nhầm thành "không đổi".

## Trường hợp lỗi

| Trường hợp                                                                                                          | ErrorCode        | HTTP status |
| ------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| Không tìm thấy đơn hàng                                                                                             | `ErrorCode.E057` | 404         |
| `code` đã tồn tại (chỉ khi tạo, `code` truyền lên)                                                                  | `ErrorCode.E058` | 409         |
| Khách hàng (`clientId`) không tồn tại — chỉ kiểm khi `clientId` được gửi                                            | `ErrorCode.E059` | 404         |
| Nhân viên kinh doanh (`staffId`) không tồn tại                                                                      | `ErrorCode.E060` | 404         |
| Một `productId` trong `items` không tồn tại                                                                         | `ErrorCode.E061` | 404         |
| `PATCH`/`DELETE` trên đơn đã `COMPLETED`/`CANCELLED`                                                                | `ErrorCode.E065` | 409         |
| File đính kèm không tồn tại trong registry                                                                          | `ErrorCode.E042` | 404         |
| `POST .../approve`/`POST .../reject` trên đơn không ở `PENDING_CONFIRMATION`                                        | `ErrorCode.E074` | 409         |
| `POST /orders`/`PATCH /orders/:orderId` cố set `status=AWAITING_PRODUCTION` trực tiếp (phải qua `POST .../approve`) | `ErrorCode.E075` | 400         |
| `PATCH /orders/:orderId` đổi `items` trên đơn có LSX đã duyệt (`APPROVED`)                                          | `ErrorCode.E080` | 409         |
| Role của caller thiếu quyền mà route yêu cầu                                                                        | `ErrorCode.E033` | 403         |
| Không gửi bearer token                                                                                              | —                | 401         |

`E066` (`order.error.no_items`) không có nhánh throw nào hiện tại — giữ trong `ErrorCode` như mã dự phòng, chưa dùng.

Thứ tự kiểm khi `POST`: mã trùng (`E058`) → khách hàng tồn tại (`E059`) → NVKD tồn tại nếu gửi (`E060`) → mọi sản phẩm trong `items` tồn tại (`E061`, một truy vấn `inArray` cho cả danh sách) → `status` không phải `AWAITING_PRODUCTION` (`E075`) → file đính kèm hợp lệ (`E042`). Khi `PATCH`: đơn tồn tại (`E057`) → đơn chưa `COMPLETED`/`CANCELLED` (`E065`) → các kiểm còn lại như `POST` cho những trường thực sự được gửi, gồm cả `E075`. Khi `DELETE`: tồn tại (`E057`) → chưa `COMPLETED`/`CANCELLED` (`E065`). Khi `POST .../approve`/`.../reject`: tồn tại (`E057`) → đang `PENDING_CONFIRMATION` (`E074`).

## Ngoài phạm vi

- `IN_PROGRESS → COMPLETED` bằng một endpoint riêng (gắn với sản xuất/giao hàng thực tế) — chưa có API chuyên dụng, vẫn qua `PATCH /orders/:orderId` với `status` tường minh.
- Giới hạn Huỷ (`CANCELLED`) chỉ đạt được từ một số trạng thái nhất định — hiện `PATCH status=CANCELLED` tự do từ mọi trạng thái không phải `COMPLETED`/`CANCELLED`, không có luật riêng.
- Bảng lịch sử duyệt/từ chối — `approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt`/`rejectionReason` chỉ giữ **lần gần nhất**; một đơn bị từ chối, sửa, rồi từ chối lần hai sẽ ghi đè lý do lần đầu.
- Bảng `currencies`/`exchange_rates`/`payment_terms` độc lập — cố ý dùng enum + cột số thay vì master data.
- Cột "Revision" trên dòng sản phẩm — không có ở tầng dữ liệu lẫn API.
- FK trực tiếp tới `client_contacts` — người liên hệ luôn là snapshot.
- Đánh số lại `sortOrder` tự động khi xoá một dòng ở giữa — client tự quản lý số thứ tự.
- Xuất PDF/in đơn hàng.
- Bảng giao hàng/DO thật — `completedValue` ("Đã giao") ở `GET /orders/stats` là proxy tạm dùng `status = COMPLETED`.
- Lịch sử đổi trạng thái đầy đủ (mọi lần chuyển, không chỉ duyệt/từ chối) — không có bảng audit trạng thái, nên `expiredTrendCount` ở `GET /orders/stats` chỉ là xấp xỉ (xem mục thống kê ở trên).

## Xem thêm

- `production` — module LSX đọc PO đã duyệt (`AWAITING_PRODUCTION`/`IN_PROGRESS`); duyệt LSX (`POST /production-orders/:id/approve`) là con đường duy nhất chuyển `AWAITING_PRODUCTION → IN_PROGRESS`; xem `docs/features/production.md`.
- `clients` — nguồn `clientId`/liên hệ tại thời điểm chọn (không FK bền tới liên hệ, xem trên).
- `products` — nguồn `productId` mỗi dòng; `products.md` mô tả `type`/`unitId`/vòng đời sản phẩm.
- `users` — nguồn `staffId` (Nhân viên kinh doanh); FK nghiệp vụ duy nhất trỏ thẳng `users.id` (mọi FK "người thực hiện" khác trong hệ thống trỏ `credentials.id`, xem `CLAUDE.md`).
- `files` — registry lưu tài liệu đính kèm (`attachmentFileIds`, `UploadType.ORDER_DOCUMENT`).
- `suppliers` — nơi `paymentTermEnum` được khai báo gốc, `orders` chỉ import lại.
