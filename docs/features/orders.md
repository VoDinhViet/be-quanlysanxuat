# Tính năng: Orders (Đơn hàng)

## Mục đích

Quản lý đơn hàng bán ("Sales Order") — chứng từ ghi nhận một đơn đặt hàng của khách: khách hàng, người liên hệ, nhân viên kinh doanh phụ trách, ngày đặt/ngày giao yêu cầu, danh sách dòng sản phẩm, và khối tổng tiền (chiết khấu đơn, VAT, phí vận chuyển). Đây là bước mở rộng thứ hai của module — bản đầu (2026-07-24) chỉ có một bảng header không dòng sản phẩm; bản 2026-07-27 khôi phục khách hàng/NVKD/ngày đặt và bổ sung dòng sản phẩm, tiền tệ/tỷ giá, chiết khấu/VAT/phí vận chuyển, đính kèm, và dashboard thống kê 6 thẻ. Bản 2026-07-29 dựng lại luồng duyệt: đơn tạo ra ở `DRAFT`, phải qua duyệt (quyền Giám đốc trở lên) mới sang `AWAITING_PRODUCTION` — chỗ dự kiến LSX (lệnh sản xuất, module riêng, chưa xây) đọc để kiểm tồn TP và ra quyết định sản xuất.

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

### Vòng đời trạng thái và luồng duyệt (2026-07-29)

`status` gồm `DRAFT | PENDING_CONFIRMATION | AWAITING_PRODUCTION | IN_PROGRESS | COMPLETED | CANCELLED`. Đơn tạo ra ở `DRAFT` (đảo ngược quyết định "no DRAFT" của 2026-07-27 — xem "Frontend integration notes" bên dưới):

```text
Tạo đơn → DRAFT (Nháp, sửa thoải mái)
   │ PATCH status=PENDING_CONFIRMATION (permission orders:update như mọi PATCH khác)
   ▼
PENDING_CONFIRMATION (Chờ xác nhận)
   │ POST .../approve (orders:approve)   │ POST .../reject (orders:approve, bắt buộc reason)
   ▼                                     ▼
AWAITING_PRODUCTION                   DRAFT (quay lại, kèm rejectionReason)
(Chờ sản xuất)
   │ POST /production-orders/:orderId/issue ("Tạo LSX" — xem docs/features/production.md)
   ▼
IN_PROGRESS → COMPLETED / CANCELLED (như cũ, qua PATCH)
```

**Chốt cứng duy nhất: `AWAITING_PRODUCTION` chỉ đạt được qua `POST /orders/:orderId/approve`.** `OrdersService.ensureStatusSettable` chặn `POST /orders`/`PATCH /orders/:orderId` set thẳng `status=AWAITING_PRODUCTION` (`E075`) — nếu không chặn, bất kỳ ai có quyền `orders:update` (không riêng Giám đốc) đều bỏ qua được bước duyệt. Mọi transition khác (kể cả `DRAFT → PENDING_CONFIRMATION`, và Huỷ từ bất kỳ trạng thái nào) vẫn lỏng như trước — không có state machine chi tiết cho các bước đó, xem "Ngoài phạm vi". **`AWAITING_PRODUCTION → IN_PROGRESS` không còn qua `PATCH`** (2026-07-29, cùng ngày module LSX được xây) — chỉ đạt được qua "Tạo LSX", xem `docs/features/production.md`.

- **`orders:approve` là permission riêng**, tách khỏi `orders:update` — đúng yêu cầu "duyệt/từ chối là quyền Giám đốc trở lên". `POST .../approve`/`POST .../reject` chỉ hợp lệ khi đơn đang `PENDING_CONFIRMATION`, nếu không ném `E074`.
- **Từ chối bắt buộc lý do** (`RejectOrderReqDto.reason`), lưu vào `orders.rejectionReason` cùng `rejectedBy`/`rejectedAt` — chỉ giữ lần từ chối gần nhất, không phải bảng lịch sử. Tương tự, duyệt ghi `approvedBy`/`approvedAt` (cũng chỉ lần gần nhất).
- **`approveOrder` đồng thời sinh sẵn LSX** — 1 header `production_orders` (`status = PENDING`) + các dòng quyết định sản xuất `production_order_items` (một dòng mỗi dòng PO `NORMAL`) — trong cùng transaction với việc chuyển status — xem `docs/features/production.md`. Đây là hồ sơ quyết định ban đầu cho màn LSX, không phải dữ liệu hiển thị (LSX luôn tính lại tồn/khả dụng live).
- **Sửa/xoá được ở mọi trạng thái trừ `COMPLETED`/`CANCELLED`** — với một ngoại lệ mới: `PATCH` đổi `items` bị chặn (`E080`) nếu LSX (`production_orders`, header) của đơn đã `ISSUED`, vì FK `restrict` sẽ nổ 500 nếu không chặn ở tầng service (LSX chỉ đang `PENDING`, chưa phát hành, thì không chặn — `updateOrder` tự xoá header đó, cascade dọn `production_order_items`, trước khi thay `items`). `PATCH`/`DELETE` trên một đơn đã ở trạng thái kết thúc vẫn trả `E065` (409) như cũ — logic này giữ nguyên y hệt trước 2026-07-29, chỉ đổi tập giá trị enum đứng sau nó (`DRAFT`/`PENDING_CONFIRMATION`/`AWAITING_PRODUCTION`/`IN_PROGRESS` đều sửa/xoá được).

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
| GET | `/orders/:orderId` | `orders:read` | — | `200` + `OrderResDto` (kèm `items`, `attachments`) |
| POST | `/orders` | `orders:create` | `CreateOrderReqDto` — `orderDate`*, `dueDate`*, `clientId` (tạm thời optional, xem quy tắc), `contactName`, `contactPhone`, `contactEmail`, `staffId`, `deliveryAddress`, `paymentTerm`, `currency`, `exchangeRate`, `discountType`, `discountValue`, `vatPercent`, `shippingFee`, `status` (không nhận `AWAITING_PRODUCTION`, `E075`; mặc định `DRAFT`), `note`, `internalNote`, `items[]`, `attachmentFileIds[]` | `201` + `OrderResDto` |
| PATCH | `/orders/:orderId` | `orders:update` | `UpdateOrderReqDto` — như trên trừ `code` (bất biến), tất cả tuỳ chọn; chặn khi đơn đã `COMPLETED`/`CANCELLED`; `status` không nhận `AWAITING_PRODUCTION` (`E075`) | `200` + `OrderResDto` |
| DELETE | `/orders/:orderId` | `orders:delete` | — | `204`, không có body; chặn khi đơn đã `COMPLETED`/`CANCELLED` |
| POST | `/orders/:orderId/approve` | `orders:approve` | — | `200` + `OrderResDto`; chỉ hợp lệ khi đơn `PENDING_CONFIRMATION` (`E074`) |
| POST | `/orders/:orderId/reject` | `orders:approve` | `RejectOrderReqDto` — `reason*` | `200` + `OrderResDto`; chỉ hợp lệ khi đơn `PENDING_CONFIRMATION` (`E074`) |

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
| `POST .../approve`/`POST .../reject` trên đơn không ở `PENDING_CONFIRMATION` | `ErrorCode.E074` | 409 |
| `POST /orders`/`PATCH /orders/:orderId` cố set `status=AWAITING_PRODUCTION` trực tiếp (phải qua `POST .../approve`) | `ErrorCode.E075` | 400 |
| `PATCH /orders/:orderId` đổi `items` trên đơn đã có dòng phát hành LSX | `ErrorCode.E080` | 409 |
| Role của caller thiếu quyền mà route yêu cầu | `ErrorCode.E033` | 403 |
| Không gửi bearer token | — | 401 |

`E066` (`order.error.no_items`) từng gắn với `POST /orders/:id/confirm` — endpoint đó đã bị gỡ cùng với `DRAFT` (2026-07-27), mã này để trống không tái sử dụng (xem comment tại `ErrorCode.E066` trong `error-code.constant.ts`).

Thứ tự kiểm khi `POST`: mã trùng (`E058`) → khách hàng tồn tại (`E059`) → NVKD tồn tại nếu gửi (`E060`) → mọi sản phẩm trong `items` tồn tại (`E061`, một truy vấn `inArray` cho cả danh sách) → `status` không phải `AWAITING_PRODUCTION` (`E075`) → file đính kèm hợp lệ (`E042`). Khi `PATCH`: đơn tồn tại (`E057`) → đơn chưa `COMPLETED`/`CANCELLED` (`E065`) → các kiểm còn lại như `POST` cho những trường thực sự được gửi, gồm cả `E075`. Khi `DELETE`: tồn tại (`E057`) → chưa `COMPLETED`/`CANCELLED` (`E065`). Khi `POST .../approve`/`.../reject`: tồn tại (`E057`) → đang `PENDING_CONFIRMATION` (`E074`).

## Ngoài phạm vi

- `IN_PROGRESS → COMPLETED` bằng một endpoint riêng (gắn với sản xuất/giao hàng thực tế) — chưa có API chuyên dụng, vẫn qua `PATCH /orders/:orderId` với `status` tường minh. (`AWAITING_PRODUCTION → IN_PROGRESS` đã có API riêng — "Tạo LSX", xem `docs/features/production.md`.)
- Giới hạn Huỷ (`CANCELLED`) chỉ đạt được từ một số trạng thái nhất định — hiện `PATCH status=CANCELLED` tự do từ mọi trạng thái không phải `COMPLETED`/`CANCELLED`, không có luật riêng.
- Bảng lịch sử duyệt/từ chối — `approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt`/`rejectionReason` chỉ giữ **lần gần nhất**; một đơn bị từ chối, sửa, rồi từ chối lần hai sẽ ghi đè lý do lần đầu.
- **`GET /orders/stats` chưa cập nhật theo bộ trạng thái mới** — 6 thẻ dashboard vẫn tính trên `CONFIRMED`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED` kiểu cũ (trong đó `CONFIRMED` không còn là giá trị hợp lệ của `status`), không có thẻ riêng cho `DRAFT`/`PENDING_CONFIRMATION`/`AWAITING_PRODUCTION`. Cần một lượt sửa riêng.
- Quy đổi `total` sang VND theo `exchangeRate` ở bất kỳ báo cáo/API nào — trường chỉ được lưu.
- Bảng `currencies`/`exchange_rates`/`payment_terms` độc lập — cố ý dùng enum + cột số thay vì master data.
- Cột "Revision" trên dòng sản phẩm — không có ở tầng dữ liệu lẫn API.
- FK trực tiếp tới `client_contacts` — người liên hệ luôn là snapshot.
- Đánh số lại `sortOrder` tự động khi xoá một dòng ở giữa — client tự quản lý số thứ tự.
- Xuất PDF/in đơn hàng.
- Bảng giao hàng/DO thật — `completedValue` ("Đã giao") ở `GET /orders/stats` là proxy tạm dùng `status = COMPLETED`.
- Lịch sử đổi trạng thái đầy đủ (mọi lần chuyển, không chỉ duyệt/từ chối) — không có bảng audit trạng thái, nên `expiredTrendCount` ở `GET /orders/stats` chỉ là xấp xỉ (xem mục thống kê ở trên).

## Xem thêm

- `production` — module LSX đọc PO đã duyệt (`AWAITING_PRODUCTION`/`IN_PROGRESS`), quyết định "Tạo LSX" là nơi duy nhất chuyển `AWAITING_PRODUCTION → IN_PROGRESS`; xem `docs/features/production.md`.
- `clients` — nguồn `clientId`/liên hệ tại thời điểm chọn (không FK bền tới liên hệ, xem trên).
- `products` — nguồn `productId` mỗi dòng; `products.md` mô tả `type`/`unitId`/vòng đời sản phẩm.
- `users` — nguồn `staffId` (Nhân viên kinh doanh); khác các FK "người thực hiện" khác trong hệ thống vốn trỏ `credentials.id`, đây là FK nghiệp vụ đầu tiên trỏ thẳng `users.id`.
- `files` — registry lưu tài liệu đính kèm (`attachmentFileIds`, `UploadType.ORDER_DOCUMENT`).
- `suppliers` — nơi `paymentTermEnum` được khai báo gốc, `orders` chỉ import lại.

## Frontend integration notes

**2026-07-29 (tối) — module LSX (`production-orders` + `production-jobs`), additive.** Không phải breaking change — mọi route/DTO/field hiện có của `orders` giữ nguyên. Ảnh hưởng FE cần biết:

- `POST /orders/:orderId/approve` nay đồng thời sinh sẵn LSX cho đơn (header + dòng quyết định sản xuất) — response `OrderResDto` không đổi, nhưng ngay sau đó `GET /production-orders/:orderId` đã có dữ liệu (không cần chờ một bước "tạo kế hoạch" riêng).
- `AWAITING_PRODUCTION → IN_PROGRESS` nay **chỉ** đạt được qua `POST /production-orders/:orderId/issue` ("Tạo LSX") — `PATCH /orders/:orderId` với `status=IN_PROGRESS` trên một đơn đang `AWAITING_PRODUCTION` không còn là đường đi được thiết kế cho luồng LSX (endpoint đó vẫn kỹ thuật tồn tại, nhưng FE nên chuyển màn LSX qua route mới).
- `PATCH /orders/:orderId` với `items` trên một đơn đã có LSX phát hành nay trả `E080` (409) thay vì áp dụng thay đổi — FE nên ẩn/khoá phần sửa dòng sản phẩm trên màn chi tiết đơn khi đơn đã "Đã tạo LSX".
- Toàn bộ API mới nằm ở 2 module riêng: `/production-orders*` (màn chính LSX, theo PO) và `/production-jobs*` (menu "Quản lý sản xuất", theo Job — **1 sản phẩm = 1 Job**, gộp mọi dòng PO cùng sản phẩm trong một LSX). Bảng lỗi/công thức tính "Đề xuất SX" nằm ở `docs/features/production.md`.

**2026-07-29 — dựng lại luồng duyệt, `DRAFT` quay lại.** Breaking change:

- `OrderStatus` đổi hẳn: `CONFIRMED` **bị xoá**, thay bằng `DRAFT | PENDING_CONFIRMATION | AWAITING_PRODUCTION`. Enum đầy đủ nay là `DRAFT | PENDING_CONFIRMATION | AWAITING_PRODUCTION | IN_PROGRESS | COMPLETED | CANCELLED`.
- `POST /orders` không gửi `status` giờ mặc định `DRAFT` (trước đây `CONFIRMED`).
- **Toàn bộ đơn cũ đang `CONFIRMED` trên DB dev sẽ đọc lên thành `PENDING_CONFIRMATION` sau migration** (backfill 1-lần, xem `OrdersService`/migration liên quan) — không phải `DRAFT`, vì các đơn đó về nghiệp vụ đã được "gửi đi" rồi, chỉ là chưa có bước duyệt tường minh để gắn nhãn đúng.
- 2 route mới, đều yêu cầu quyền `orders:approve` (Giám đốc trở lên, không phải `orders:update`): `POST /orders/:orderId/approve` (không body) và `POST /orders/:orderId/reject` (body `{ reason }`, bắt buộc). Cả hai chỉ dùng được khi đơn đang `PENDING_CONFIRMATION`, ngược lại trả `E074`.
- `OrderResDto` thêm 5 field: `approver`/`approvedAt`/`rejecter`/`rejectedAt`/`rejectionReason` (đều nullable) — FE dùng `rejectionReason` để hiển thị lý do từ chối trên màn hình chi tiết đơn.
- `PATCH /orders/:orderId` (và `POST /orders`) **không cho set `status=AWAITING_PRODUCTION` trực tiếp** — gửi giá trị này sẽ nhận `E075`. FE chỉ chuyển đơn sang trạng thái đó qua nút "Duyệt", gọi `POST .../approve`.
- **`GET /orders/stats` chưa cập nhật** — vẫn đọc theo enum cũ, sẽ cần một bản vá riêng để phản ánh đúng `DRAFT`/`PENDING_CONFIRMATION`/`AWAITING_PRODUCTION`.

**2026-07-27 (tối) — `clientId` tạm thời optional khi tạo đơn.** Không phải breaking change (nới lỏng, không siết): `POST /orders` giờ chấp nhận bỏ trống `clientId`. Ảnh hưởng FE cần biết:

- `OrderResDto.client` giờ có thể là `null` — màn hình chi tiết/danh sách đơn hàng phải tự xử lý ca chưa gán khách hàng thay vì giả định `client` luôn có object.
- `PATCH /orders/:orderId` **không đổi** — `clientId` vẫn optional nhưng không nullable, không dùng để gỡ khách hàng khỏi một đơn đã có.

**2026-07-27 (chiều) — bỏ `DRAFT`, thiết kế lại `GET /orders/stats` theo dashboard 6 thẻ.** Breaking change tiếp theo, cùng ngày với bản mở rộng buổi sáng bên dưới:

- `OrderStatus` **không còn `DRAFT`** — chỉ còn `CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED`. `POST /orders` không gửi `status` sẽ mặc định `CONFIRMED` (trước đây mặc định `DRAFT`).
- **`POST /orders/:id/confirm` đã bị gỡ** — không còn bước "xác nhận" riêng vì không còn trạng thái nháp để xác nhận từ đó. FE bỏ hẳn lệnh gọi này khỏi wizard.
- Luật khoá sửa/xoá đổi hẳn: trước đây chỉ `DRAFT` mới sửa/xoá được; nay `CONFIRMED`/`IN_PROGRESS` sửa/xoá được, chỉ khoá khi `COMPLETED`/`CANCELLED` (vẫn mã lỗi `E065`/409, nhưng điều kiện kích hoạt đã đổi).
- `GET /orders/stats` **đổi hẳn shape response** — 8 field cũ (`totalOrders`, `totalValue`, `overdue`, `draft`, `confirmed`, `inProgress`, `completed`, `cancelled`) thay bằng 12 field mới khớp 6 thẻ dashboard (`totalOrders`, `totalOrdersTrendPercent`, `totalValue`, `totalValueTrendPercent`, `completedValue`, `completedValuePercentOfTotal`, `inProgress`, `inProgressPercentOfTotal`, `expired`, `expiredTrendCount`, `completed`, `completedPercentOfTotal`) — xem mục "`GET /orders/stats`" ở trên. Lưu ý `completedValue`/`expiredTrendCount` là xấp xỉ, đọc kỹ ghi chú trước khi hiển thị số tuyệt đối cho người dùng.

**2026-07-27 (sáng) — mở rộng đầy đủ theo màn hình "Tạo đơn hàng".** Breaking change so với bản 2026-07-24:

- `POST /orders`/`PATCH /orders/:orderId` nay **bắt buộc** `clientId`, `orderDate`, `dueDate` — trước đây không có các trường này.
- `total` (và mọi số tiền khác) **không còn nhận từ client** — trước đây `total` là số client tự gửi (`NumberFieldOptional`), nay hoàn toàn do server tính từ `items[]`/chiết khấu/VAT/phí vận chuyển. Bất kỳ giá trị nào FE gửi cho các trường tính-ra sẽ bị bỏ qua lặng lẽ.
- `PATCH /orders/:orderId` **đã có lại** (bị gỡ 2026-07-27 buổi sáng sớm, phục hồi cùng ngày với ngữ nghĩa mới).
- Mới: `items[]` (dòng sản phẩm) và `attachmentFileIds[]` (tài liệu đính kèm) trên cả `POST` và `PATCH`.
- FE **không** hiển thị cột "Revision" trên bảng dòng sản phẩm — không có hỗ trợ ở API.
