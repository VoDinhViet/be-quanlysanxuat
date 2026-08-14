# Gửi duyệt & duyệt báo giá (RFQ)

Chặng giữa của một RFQ: người mua hàng đã khai báo NCC + giá cho từng vật tư ở `DRAFT`, người duyệt
chọn NCC thắng thầu và chốt. Khái niệm hai tầng (vật tư → NCC) và bất biến ở
`docs/domains/purchasing.md`.

## Trigger

- `POST /purchase-quotations/:quotationId/send` — gửi duyệt *(một lần từ `DRAFT`)*.
- `POST /purchase-quotations/:quotationId/approve` — duyệt, chọn NCC thắng thầu từng vật tư *(một
  lần từ `PENDING_APPROVAL`)*.
- `POST /purchase-quotations/:quotationId/reject` — từ chối *(một lần từ `PENDING_APPROVAL`)*.
- `POST /purchase-quotations/:quotationId/recall` — thu hồi RFQ đã duyệt *(một lần từ `APPROVED`)*.

RFQ chỉ sinh từ `POST /purchase-quotations` (lập tay) — không route nào tự sinh RFQ. Chưa có route
đưa `PENDING_APPROVAL` về lại `DRAFT` để sửa rồi gửi lại ("yêu cầu chỉnh sửa") — đợt sau; bị từ chối
thì phải tạo RFQ mới.

## Actor

Gửi duyệt/thu hồi: `purchasing:update`. Duyệt/từ chối: `purchasing:approve` — tách quyền khỏi quyền
sửa, cùng khuôn `production:update`/`production:approve`.

## Preconditions

| Điều kiện | Gửi duyệt | Duyệt | Từ chối | Thu hồi |
| --- | --- | --- | --- | --- |
| RFQ tồn tại | `E117` | `E117` | `E117` | `E117` |
| Đúng trạng thái nguồn | `E118` (phải `DRAFT`) | `E118` (phải `PENDING_APPROVAL`) | `E118` (phải `PENDING_APPROVAL`) | `E118` (phải `APPROVED`) |
| RFQ có ≥ 1 vật tư | `E131` | — | — | — |
| Mỗi vật tư có ≥ 1 NCC | `E130` | — | — | — |
| Mọi dòng NCC đã có `unitPrice` | `E120` | — | — | — |
| Mỗi vật tư có đúng 1 NCC thắng thầu | — | `E132` | — | — |
| Chưa PO nào do RFQ này sinh đã `ORDERED` | — | — | — | `E133` |

## Flow

### Gửi duyệt (`send`)

1. Đọc RFQ kèm `items.suppliers`, kiểm `DRAFT` (`E118`).
2. Kiểm ba điều kiện ở bảng trên theo đúng thứ tự — dừng ở lỗi đầu tiên khớp.
3. Single-write: `status = PENDING_APPROVAL`, `sentBy`/`sentAt`. Không cần transaction (một bảng).

### Duyệt (`approve`)

1. Đọc RFQ kèm `items.suppliers`, kiểm `PENDING_APPROVAL` (`E118`).
2. Payload `winners: { quotationItemId, quotationItemSupplierId }[]` — kiểm **ngoài transaction**:
   đủ một winner cho mỗi vật tư của RFQ, và mỗi `quotationItemSupplierId` gửi lên đúng là một dòng
   NCC thuộc `quotationItemId` tương ứng (`E132` nếu thiếu hoặc lệch).
3. **Transaction**:
   - Với mỗi vật tư: `UPDATE purchase_quotation_item_suppliers SET selected_by, selected_at` cho
     dòng thắng; các dòng NCC còn lại của cùng vật tư giữ `NULL` (không cần `UPDATE` nếu vốn đã
     `NULL` — chỉ dòng thắng đổi).
   - Update header: `status = APPROVED`, `approvedBy`/`approvedAt`.
   - Gom các dòng thắng theo `supplierId` (một NCC nhiều vật tư → gom chung một nhóm).
   - Gọi `PurchaseOrdersService.createDraftOrdersFromQuotation(tx, quotationId, groups, userId)` —
     mỗi nhóm sinh 1 `purchase_orders` (`status = DRAFT`, `quotationId`, `supplierId`, mã `PO-xxxxx`,
     `expectedDate = orderDate + max(leadTimeDays)` của các dòng trong nhóm, `null` nếu không dòng
     nào có `leadTimeDays`) + N `purchase_order_items` — **N là tổng số phân bổ**
     (`purchase_quotation_item_allocations`) của các dòng vật tư NCC đó thắng, không phải số dòng vật
     tư: một dòng vật tư gộp nhiều dòng ĐXMH nguồn sinh từng đó dòng PO, mỗi dòng lấy
     `purchaseRequestItemId`/`quantity` từ đúng phân bổ đó (không phải SL cả dòng vật tư),
     `quotationItemSupplierId` trỏ đúng dòng NCC thắng, `unitPrice` từ dòng NCC thắng
     (`docs/domains/purchasing.md`).

Ba giá trị mặc định trên (`expectedDate`, `quantity`, `unitPrice`) sửa được sau đó qua
`PATCH /purchase-orders/:id` (header, chỉ `expectedDate`) và `PATCH .../items/:id` (dòng, chỉ
`quantity`/`unitPrice`) — cả hai chặn nếu PO không còn `DRAFT` (`E122`). `supplierId` không có route
sửa.

### Từ chối (`reject`)

Single-write, không transaction: `status = CANCELLED`, `cancelledBy`/`cancelledAt`/
`cancellationReason` (từ payload `reason`). Điểm cuối — không có đường lùi, muốn sửa và gửi lại
phải tạo RFQ mới.

### Thu hồi (`recall`)

1. Đọc RFQ, kiểm `APPROVED` (`E118`).
2. Đọc mọi `purchase_orders` có `quotationId = :id` (**ngoài transaction**) — nếu có PO nào
   `status = ORDERED` → `E133`, dừng lại.
3. **Transaction**:
   - Xoá các PO Draft đó (cascade `purchase_order_items`).
   - Với mọi dòng `purchase_quotation_item_suppliers` thuộc RFQ: clear `selectedBy`/`selectedAt`.
   - Update header: `status = DRAFT`, clear `approvedBy`/`approvedAt` — một RFQ đang `DRAFT` không
     được mang dấu duyệt giả. Lịch sử lần duyệt trước không lưu lại; cần thì mở bảng log riêng, không
     nhét vào header.

## State changes

| Entity | Trước (`approve`) | Sau (`approve`) |
| --- | --- | --- |
| `purchase_quotations` | `PENDING_APPROVAL` | `APPROVED`, có `approvedBy`/`approvedAt` |
| `purchase_quotation_item_suppliers` (dòng thắng) | `selectedAt` NULL | có `selectedBy`/`selectedAt` |
| `purchase_orders` | *(chưa có, hoặc còn từ lần duyệt trước nếu vừa `recall`)* | 1 dòng `DRAFT`/NCC thắng thầu |
| `purchase_order_items` | *(chưa có)* | N dòng/PO (N = tổng số phân bổ của các dòng vật tư NCC đó thắng, ≥ số vật tư) |

## Side effects

- Số PO Draft sinh ra = số NCC **phân biệt** thắng thầu trong RFQ, không phải số vật tư — một NCC
  thắng nhiều vật tư vẫn chỉ một PO.
- `recall` xoá cứng PO Draft (không phải soft-delete/`CANCELLED`) — bảng `purchase_order_items`
  không có cột `deletedAt` (`.claude/rules/database.md`, chỉ 7 bảng có soft delete và không bảng nào
  thuộc domain này).

## Transaction boundary

`approve` mở transaction bao **hai bảng của domain này + hai bảng của `purchase-orders`**
(`purchase_quotations`, `purchase_quotation_item_suppliers`, `purchase_orders`,
`purchase_order_items`) — lý do `createDraftOrdersFromQuotation` bắt buộc nhận `tx`, không tự mở
transaction (`.claude/rules/transactions.md`). `recall` mở transaction tương tự nhưng theo chiều
ngược (xoá thay vì tạo).

Sinh mã PO nằm **trong** transaction, cùng giới hạn đếm-rồi-cộng-1 đã chấp nhận chung trong repo
(`PurchaseRequestsService.generatePurchaseRequestCode`) — hai lượt duyệt song song có thể trùng mã,
unique constraint là chốt chặn thật.

## Failure cases

| Tình huống | Mã | Kết quả |
| --- | --- | --- |
| RFQ không tồn tại | `E117` | 404 |
| Sai trạng thái nguồn cho hành động | `E118` | 409 |
| Gửi duyệt khi RFQ không có vật tư | `E131` | 400 |
| Gửi duyệt khi có vật tư chưa có NCC | `E130` | 400 |
| Gửi duyệt khi còn dòng NCC thiếu giá | `E120` | 400 |
| Duyệt khi còn vật tư chưa chọn thắng thầu | `E132` | 409, **transaction không mở** |
| Thu hồi khi đã có PO `ORDERED` | `E133` | 409 |
| Trùng mã `RFQ-xxxxx`/`PO-xxxxx` | — | 500 thô, rollback |

## Business rules

- Vì sao SL báo giá sống ở bảng phân bổ (không ở tầng vật tư/NCC), vì sao thắng thầu là unique index
  từng phần → `docs/domains/purchasing.md`, mục Core concepts.
- Vì sao PO chỉ sinh tự động, chưa có lập tay → cùng file, mục "Trạng thái hiện tại".

## Related domains

`purchase-quotations` → `purchase-orders` (một chiều, chỉ lúc `approve`/`recall`). Không đụng
`inventory` ở bước này — phiếu nhập chỉ xuất hiện khi PO chuyển `ORDERED` rồi có người nhập hàng
(ngoài phạm vi domain này).

Bước trước: RFQ được lập tay (`POST /purchase-quotations`, không có workflow riêng — một write đơn
giản, xem `docs/domains/purchasing.md`). Bước sau: đặt mua thật (`docs/domains/purchasing.md`, mục
"Đi tìm route `POST /purchase-orders`" — chưa có, PO Draft phải chuyển `ORDERED` tay đợt sau).

Code: `PurchaseQuotationsService.sendQuotation`/`approveQuotation`/`rejectQuotation`/
`recallQuotation`, `PurchaseOrdersService.createDraftOrdersFromQuotation`.
