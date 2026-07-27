# Tính năng: Orders (Đơn hàng)

## Mục đích

Quản lý đơn hàng bán ("Sales Order") — chứng từ ghi nhận một đơn đặt hàng của khách: khách hàng, người liên hệ, nhân viên kinh doanh phụ trách, ngày đặt/ngày giao yêu cầu, danh sách dòng sản phẩm, và khối tổng tiền (chiết khấu đơn, VAT, phí vận chuyển). Đây là bước mở rộng thứ hai của module — bản đầu (2026-07-24) chỉ có một bảng header không dòng sản phẩm; bản này (2026-07-27) khôi phục khách hàng/NVKD/ngày đặt và bổ sung dòng sản phẩm, tiền tệ/tỷ giá, chiết khấu/VAT/phí vận chuyển, đính kèm, và dashboard thống kê 6 thẻ. Đơn hàng được `CONFIRMED` ngay khi tạo — không có bước nháp/xác nhận riêng.

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

**Dòng ở trạng thái `CANCELLED` không cộng vào `subtotal`.** Đây là điểm khác với ảnh mock UI ban đầu (dòng "Đã hủy" trong mock vẫn được cộng) — quyết định nghiệp vụ khi build API là loại hẳn dòng đã huỷ khỏi tổng tiền, giữ ý nghĩa "Đã hủy" nhất quán với tên gọi.

### `clientId` tạm thời optional khi tạo đơn

`CreateOrderReqDto.clientId` đang là `UUIDFieldOptional` (nullable) — **tạm thời**, không phải quyết định nghiệp vụ lâu dài. `orders.client_id` ở schema cũng đã bỏ `NOT NULL` cho khớp; `OrdersService.createOrder` chỉ gọi `ensureClientExists`/ném `E059` khi `clientId` thực sự được gửi, giống cách `staffId` đã hoạt động từ trước. `OrderResDto.client` theo đó cũng nullable — FE phải tự xử lý ca "chưa gán khách hàng" khi hiển thị. `UpdateOrderReqDto.clientId` không đổi (vẫn optional, không nullable — không hỗ trợ gỡ khách hàng khỏi đơn đã tạo qua `PATCH`).

### Người liên hệ là snapshot, không phải tham chiếu

`contactName`/`contactPhone`/`contactEmail` là 3 cột văn bản trên `orders`, sao chép từ một `client_contacts` do FE chọn tại thời điểm tạo đơn — **không có** `clientContactId` FK. Lý do: `ClientsService.replaceContacts` xoá-rồi-chèn-lại toàn bộ liên hệ mỗi lần khách hàng được sửa, nên id của một dòng `client_contacts` không ổn định theo thời gian; một FK thẳng vào đó sẽ mất liên kết (hoặc bị set null) mỗi khi ai đó sửa thông tin khách hàng, kể cả khi không đụng gì tới đơn hàng. Snapshot khớp với cách một chứng từ thương mại nên hoạt động: đóng băng dữ liệu tại thời điểm lập.

### Không có bảng tiền tệ/tỷ giá/điều khoản thanh toán riêng

`currency` (pgEnum `VND`/`USD`/`EUR`/`JPY`/`CNY`/`KRW`, mặc định `VND`) và `exchangeRate` (numeric, mặc định `1`) là cột trực tiếp trên `orders` — không dựng bảng `currencies`/`exchange_rates`. `paymentTerm` tái dùng `paymentTermEnum` đã có sẵn cho `suppliers` (`IMMEDIATE`/`NET_15`/`NET_30`/`NET_60`), import thẳng từ `suppliers.ts` thay vì khai báo lại. `exchangeRate` chỉ lưu, **không** được dùng để quy đổi `total` sang VND ở bất kỳ đâu trong service — việc quy đổi (nếu cần báo cáo) là việc của một tính năng khác sau này.

### Sản phẩm không snapshot

Mỗi `order_items` chỉ lưu `productId`, số lượng/đơn giá/chiết khấu do NVKD nhập, và `lineTotal` tính ra. Tên, ảnh, đơn vị tính của sản phẩm **luôn đọc qua quan hệ `product`** tại thời điểm đọc — không sao chép tên/ảnh vào dòng đơn hàng. Vì `products` xoá mềm (không xoá cứng) và FK `order_items.productId` là `restrict`, một dòng đơn hàng cũ luôn còn sản phẩm để join tới, kể cả khi sản phẩm đã bị `PATCH` sang `INACTIVE`/xoá mềm.

### Không có khái niệm "revision" trên dòng sản phẩm

Module `product-revisions` đã bị xoá khỏi dự án (2026-07-24) — versioning sản phẩm hiện là clone toàn bộ sản phẩm (`POST /products/:id/copy`), không phải một sub-resource lịch sử phiên bản. `OrderItemReqDto`/`OrderItemResDto` không có trường nào liên quan tới revision; nếu UI cần hiển thị "phiên bản sản phẩm nào", nó phải tự suy ra từ `product.sourceProductId`/`product.code`, không có hỗ trợ riêng ở tầng đơn hàng.

### Vòng đời trạng thái và tính bất biến khi đã hoàn thành/huỷ

`status` gồm `CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED` — **không có `DRAFT`**. Một đơn hàng được coi là `CONFIRMED` ngay khi tạo, không có bước "nháp" giữ trước khi gửi khách (bỏ khỏi enum 2026-07-27; xem "Frontend integration notes" bên dưới).

- **Sửa/xoá được ở `CONFIRMED` và `IN_PROGRESS`; khoá ở `COMPLETED` và `CANCELLED`.** `PATCH`/`DELETE` trên một đơn đã ở trạng thái kết thúc (`COMPLETED`/`CANCELLED`) trả `E065` (409) — khớp thực tế nghiệp vụ: một khi đơn đã hoàn thành hoặc bị huỷ, số liệu coi như chốt, không tự do sửa nữa.
- Việc chuyển `CONFIRMED → IN_PROGRESS → COMPLETED` (gắn với luồng sản xuất/giao hàng) **nằm ngoài phạm vi** bản này — hiện chưa có API nào set các trạng thái đó ngoài giá trị mặc định `CONFIRMED` của cột; chuyển trạng thái phải làm qua `PATCH /orders/:id` với `status` tường minh.

### Dòng sản phẩm: replace-all, có `sortOrder`

`items` trên `PATCH` theo ngữ nghĩa **replace-all** giống `attachmentFileIds`/`contacts` ở các module khác: gửi mảng mới (kể cả `[]`, xoá sạch dòng) thay hoàn toàn bộ dòng cũ; bỏ trống trường này thì giữ nguyên dòng hiện có. `sortOrder` là số nguyên client tự gán khi kéo-thả trên UI — service không tự đánh số lại, chỉ lưu nguyên giá trị gửi lên (mặc định `0`).

### Tài liệu đính kèm

`attachmentFileIds` cùng cơ chế replace-all và cùng bước `FilesService.linkFiles` chạy **trước** transaction, giống hệt `materials`/`suppliers`. `UploadType` có thêm giá trị `ORDER_DOCUMENT` (kind `DOCUMENT`) cho `POST /files?type=ORDER_DOCUMENT`.

**Định dạng thực nhận hẹp hơn mock UI ban đầu (PDF/DOC/DOCX/XLS/XLSX/JPG/PNG).** `FilesService` chỉ chấp nhận những mimetype mà `file-type` xác thực được bằng magic-byte, theo đúng giới hạn đã áp dụng cho mọi `UploadType` kind `DOCUMENT` khác (`materials`, `products`, `suppliers`, `bom_items`) — xem comment trên `FilesService.DOCUMENT_MIME_TYPES`: **PDF, DOCX, XLSX**. `.doc`/`.xls` (OLE2 nhị phân cũ) bị loại vì không có chữ ký magic-byte đáng tin để phân biệt file thật với file giả mạo đổi đuôi; ảnh JPG/PNG không nằm trong allowlist của kind `DOCUMENT`. Đây là giới hạn chung toàn hệ thống, không phải riêng cho `orders` — không nới lỏng ở đây để giữ nguyên bất biến bảo mật đó cho mọi module khác đang dùng chung `DOCUMENT_MIME_TYPES`.

### Toàn bộ route yêu cầu bearer token

Không đổi so với bản gốc: khác phần lớn module master-data, **mọi** route `/orders*` — kể cả các route đọc — đòi hỏi token hợp lệ (không có route nào `@Public()`/`@ApiPublic()`).

## API contract

| Method | Path | Permission | Request | Response |
| ------ | ---- | ---------- | ------- | -------- |
| GET | `/orders` | `orders:read` | `GetOrdersReqDto` — `limit`, `page`, `q`, `order`, `status`, `clientId`, `staffId`, `fromDate`, `toDate` | `200` + `OrderResDto` phân trang |
| GET | `/orders/stats` | `orders:read` | — | `200` + `OrderStatsResDto` (6 thẻ dashboard, xem mục riêng bên dưới) |
| GET | `/orders/:id` | `orders:read` | — | `200` + `OrderResDto` (kèm `items`, `attachments`) |
| POST | `/orders` | `orders:create` | `CreateOrderReqDto` — `orderDate`*, `dueDate`*, `clientId` (tạm thời optional, xem quy tắc), `contactName`, `contactPhone`, `contactEmail`, `staffId`, `deliveryAddress`, `paymentTerm`, `currency`, `exchangeRate`, `discountType`, `discountValue`, `vatPercent`, `shippingFee`, `status`, `note`, `internalNote`, `items[]`, `attachmentFileIds[]` | `201` + `OrderResDto` |
| PATCH | `/orders/:id` | `orders:update` | `UpdateOrderReqDto` — như trên trừ `code` (bất biến), tất cả tuỳ chọn; chặn khi đơn đã `COMPLETED`/`CANCELLED` | `200` + `OrderResDto` |
| DELETE | `/orders/:id` | `orders:delete` | — | `204`, không có body; chặn khi đơn đã `COMPLETED`/`CANCELLED` |

(`*` = bắt buộc)

- `q` khớp mờ (`unaccent` ILIKE) `code`.
- Danh sách sắp xếp **mới nhất trước** (`created_at DESC`).
- `code` tự sinh dạng `SOxxxx` nếu không truyền lên khi tạo (`E058` nếu mã truyền lên đã tồn tại); bất biến sau khi tạo — `UpdateOrderReqDto` không có trường này.
- `OrderResDto.expired` vẫn là cờ suy ra tại thời điểm đọc (`dueDate < now()` và `status` chưa `COMPLETED`/`CANCELLED`), tính trong Postgres qua `extras`, không lưu cột — đổi tên từ `isOverdue` (bản gốc) sang `expired` cùng ngày.
- `items[]`/`attachments[]` chỉ có đầy đủ ở `GET .../:id` và ngay sau `POST`/`PATCH` — danh sách (`GET /orders`) không load hai quan hệ này.
- Sau mọi lệnh ghi, service đọc lại đơn bằng `getOrderDetail(id)` rồi mới map — response luôn phản ánh trạng thái đã lưu, bao gồm các số tiền vừa được Postgres tính lại.

### `GET /orders/stats` — 6 thẻ dashboard

Một câu truy vấn duy nhất (`OrdersService.getOrderStats`), mỗi field là một `count(*)`/`sum(*) filter (where ...)` hoặc `round(...)` riêng — Postgres tính hết trong một lượt, không gộp nhóm rồi rút gọn bằng JS.

| Field | Thẻ | Công thức |
| --- | --- | --- |
| `totalOrders` | Tổng đơn hàng | `count(*)` |
| `totalOrdersTrendPercent` | % so với tháng trước | `(số đơn tạo tháng này − số đơn tạo tháng trước) / số đơn tạo tháng trước × 100`, theo `createdAt`, khung tháng theo lịch (`date_trunc('month', now())`); `null` nếu tháng trước không có đơn nào |
| `totalValue` | Tổng giá trị | `sum(total)` |
| `totalValueTrendPercent` | % so với tháng trước | như trên, theo `sum(total)`; `null` nếu tháng trước = 0 |
| `completedValue` | Đã giao | `sum(total)` của các đơn `status = COMPLETED` |
| `completedValuePercentOfTotal` | % so với tổng giá trị | `completedValue / totalValue × 100`, `0` nếu `totalValue = 0` |
| `inProgress` | Đang thực hiện | `count(*) where status = IN_PROGRESS` |
| `inProgressPercentOfTotal` | % so với tổng số đơn | `inProgress / totalOrders × 100`, `0` nếu `totalOrders = 0` |
| `expired` | Trễ hạn | `dueDate < now() AND status NOT IN (COMPLETED, CANCELLED)` — công thức giống hệt `OrderResDto.expired` |
| `expiredTrendCount` | Số chênh so với tuần trước | `expired hiện tại − expired "tuần trước"` (xấp xỉ, xem bên dưới) |
| `completed` | Hoàn thành | `count(*) where status = COMPLETED` |
| `completedPercentOfTotal` | % so với tổng số đơn | `completed / totalOrders × 100`, `0` nếu `totalOrders = 0` |

**Hai field là xấp xỉ**, vì hệ thống không lưu lịch sử đổi trạng thái (chỉ có trạng thái *hiện tại* của mỗi dòng):
- **`completedValue`** ("Đã giao"): chưa có bảng giao hàng/DO thật, tạm coi mọi đơn `COMPLETED` là "đã giao".
- **`expiredTrendCount`**: "trễ hạn tuần trước" được tính lại bằng `dueDate < now() - interval '7 days' AND status NOT IN (COMPLETED, CANCELLED)`, dùng **trạng thái hiện tại** chứ không phải trạng thái thật tại thời điểm 7 ngày trước. Một đơn từng trễ hạn nhưng sau đó chuyển `CANCELLED` sẽ không được tính vào "tuần trước", dù thực tế lúc đó nó đang trễ hạn.

`totalOrdersTrendPercent`/`totalValueTrendPercent` map qua một `.mapWith` riêng (không phải `.mapWith(Number)` mặc định) để giữ `null` thay vì bị ép về `0` khi chưa có tháng trước để so sánh — `Number(null) === 0` trong JS, dễ đọc nhầm thành "không đổi".

## Trường hợp lỗi

| Trường hợp | ErrorCode | HTTP status |
| ---------- | --------- | ----------- |
| Không tìm thấy đơn hàng | `ErrorCode.E057` | 404 |
| `code` đã tồn tại (chỉ khi tạo, `code` truyền lên) | `ErrorCode.E058` | 409 |
| Khách hàng (`clientId`) không tồn tại — chỉ kiểm khi `clientId` được gửi | `ErrorCode.E059` | 404 |
| Nhân viên kinh doanh (`staffId`) không tồn tại | `ErrorCode.E060` | 404 |
| Một `productId` trong `items` không tồn tại | `ErrorCode.E061` | 404 |
| `PATCH`/`DELETE` trên đơn đã `COMPLETED`/`CANCELLED` | `ErrorCode.E065` | 409 |
| File đính kèm không tồn tại trong registry | `ErrorCode.E042` | 404 |
| Role của caller thiếu quyền mà route yêu cầu | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

`E066` (`order.error.no_items`) từng gắn với `POST /orders/:id/confirm` — endpoint đó đã bị gỡ cùng với `DRAFT` (2026-07-27), mã này để trống không tái sử dụng (xem comment tại `ErrorCode.E066` trong `error-code.constant.ts`).

Thứ tự kiểm khi `POST`: mã trùng (`E058`) → khách hàng tồn tại (`E059`) → NVKD tồn tại nếu gửi (`E060`) → mọi sản phẩm trong `items` tồn tại (`E061`, một truy vấn `inArray` cho cả danh sách) → file đính kèm hợp lệ (`E042`). Khi `PATCH`: đơn tồn tại (`E057`) → đơn chưa `COMPLETED`/`CANCELLED` (`E065`) → các kiểm còn lại như `POST` cho những trường thực sự được gửi. Khi `DELETE`: tồn tại (`E057`) → chưa `COMPLETED`/`CANCELLED` (`E065`).

## Ngoài phạm vi

- Chuyển trạng thái `CONFIRMED → IN_PROGRESS → COMPLETED` bằng một endpoint riêng (gắn với sản xuất/giao hàng) — chưa có API chuyên dụng, phải qua `PATCH /orders/:id` với `status` tường minh.
- Quy đổi `total` sang VND theo `exchangeRate` ở bất kỳ báo cáo/API nào — trường chỉ được lưu.
- Bảng `currencies`/`exchange_rates`/`payment_terms` độc lập — cố ý dùng enum + cột số thay vì master data.
- Cột "Revision" trên dòng sản phẩm — không có ở tầng dữ liệu lẫn API.
- FK trực tiếp tới `client_contacts` — người liên hệ luôn là snapshot.
- Đánh số lại `sortOrder` tự động khi xoá một dòng ở giữa — client tự quản lý số thứ tự.
- Xuất PDF/in đơn hàng.
- Bảng giao hàng/DO thật — `completedValue` ("Đã giao") ở `GET /orders/stats` là proxy tạm dùng `status = COMPLETED`.
- Lịch sử đổi trạng thái — không có bảng audit trạng thái, nên `expiredTrendCount` ở `GET /orders/stats` chỉ là xấp xỉ (xem mục thống kê ở trên).

## Xem thêm

- `clients` — nguồn `clientId`/liên hệ tại thời điểm chọn (không FK bền tới liên hệ, xem trên).
- `products` — nguồn `productId` mỗi dòng; `products.md` mô tả `type`/`unitId`/vòng đời sản phẩm.
- `users` — nguồn `staffId` (Nhân viên kinh doanh); khác các FK "người thực hiện" khác trong hệ thống vốn trỏ `credentials.id`, đây là FK nghiệp vụ đầu tiên trỏ thẳng `users.id`.
- `files` — registry lưu tài liệu đính kèm (`attachmentFileIds`, `UploadType.ORDER_DOCUMENT`).
- `suppliers` — nơi `paymentTermEnum` được khai báo gốc, `orders` chỉ import lại.

## Frontend integration notes

**2026-07-27 (tối) — `clientId` tạm thời optional khi tạo đơn.** Không phải breaking change (nới lỏng, không siết): `POST /orders` giờ chấp nhận bỏ trống `clientId`. Ảnh hưởng FE cần biết:

- `OrderResDto.client` giờ có thể là `null` — màn hình chi tiết/danh sách đơn hàng phải tự xử lý ca chưa gán khách hàng thay vì giả định `client` luôn có object.
- `PATCH /orders/:id` **không đổi** — `clientId` vẫn optional nhưng không nullable, không dùng để gỡ khách hàng khỏi một đơn đã có.

**2026-07-27 (chiều) — bỏ `DRAFT`, thiết kế lại `GET /orders/stats` theo dashboard 6 thẻ.** Breaking change tiếp theo, cùng ngày với bản mở rộng buổi sáng bên dưới:

- `OrderStatus` **không còn `DRAFT`** — chỉ còn `CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED`. `POST /orders` không gửi `status` sẽ mặc định `CONFIRMED` (trước đây mặc định `DRAFT`).
- **`POST /orders/:id/confirm` đã bị gỡ** — không còn bước "xác nhận" riêng vì không còn trạng thái nháp để xác nhận từ đó. FE bỏ hẳn lệnh gọi này khỏi wizard.
- Luật khoá sửa/xoá đổi hẳn: trước đây chỉ `DRAFT` mới sửa/xoá được; nay `CONFIRMED`/`IN_PROGRESS` sửa/xoá được, chỉ khoá khi `COMPLETED`/`CANCELLED` (vẫn mã lỗi `E065`/409, nhưng điều kiện kích hoạt đã đổi).
- `GET /orders/stats` **đổi hẳn shape response** — 8 field cũ (`totalOrders`, `totalValue`, `overdue`, `draft`, `confirmed`, `inProgress`, `completed`, `cancelled`) thay bằng 12 field mới khớp 6 thẻ dashboard (`totalOrders`, `totalOrdersTrendPercent`, `totalValue`, `totalValueTrendPercent`, `completedValue`, `completedValuePercentOfTotal`, `inProgress`, `inProgressPercentOfTotal`, `expired`, `expiredTrendCount`, `completed`, `completedPercentOfTotal`) — xem mục "`GET /orders/stats`" ở trên. Lưu ý `completedValue`/`expiredTrendCount` là xấp xỉ, đọc kỹ ghi chú trước khi hiển thị số tuyệt đối cho người dùng.

**2026-07-27 (sáng) — mở rộng đầy đủ theo màn hình "Tạo đơn hàng".** Breaking change so với bản 2026-07-24:

- `POST /orders`/`PATCH /orders/:id` nay **bắt buộc** `clientId`, `orderDate`, `dueDate` — trước đây không có các trường này.
- `total` (và mọi số tiền khác) **không còn nhận từ client** — trước đây `total` là số client tự gửi (`NumberFieldOptional`), nay hoàn toàn do server tính từ `items[]`/chiết khấu/VAT/phí vận chuyển. Bất kỳ giá trị nào FE gửi cho các trường tính-ra sẽ bị bỏ qua lặng lẽ.
- `PATCH /orders/:id` **đã có lại** (bị gỡ 2026-07-27 buổi sáng sớm, phục hồi cùng ngày với ngữ nghĩa mới).
- Mới: `items[]` (dòng sản phẩm) và `attachmentFileIds[]` (tài liệu đính kèm) trên cả `POST` và `PATCH`.
- FE **không** hiển thị cột "Revision" trên bảng dòng sản phẩm — không có hỗ trợ ở API.
