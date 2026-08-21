# Purchasing (Mua hàng)

## Purpose

Biến một đề xuất mua hàng **đã duyệt** (`docs/domains/purchase-requests.md`) thành hàng thật trong
kho: lấy báo giá NCC (RFQ), duyệt chọn NCC thắng thầu, đặt mua (đơn mua), rồi nhận hàng qua phiếu
nhập (`docs/domains/inventory.md`). Đảo ngược `docs/decisions/no-procurement.md` — xem lý do ở đầu
file đó.

**Sổ cái mua hàng** (`GET /purchase-ledger`) là màn hình tổng hợp, một dòng/một dòng đề xuất, thiết
kế để hiện đủ vòng đời từ đề xuất → nhận hàng. Nó không phải một chứng từ — không có bảng riêng, mọi
số đều tính lúc đọc từ bốn bảng gốc.

**Trạng thái hiện tại (chưa xong hết thiết kế dưới đây).** Module `purchase-quotations` có đủ vòng
đời RFQ: tạo/sửa/xoá tay, gửi duyệt, duyệt (chọn NCC thắng thầu từng vật tư), từ chối, yêu cầu chỉnh
sửa, thu hồi. **Duyệt RFQ tự sinh PO Draft** — đây là đường ghi **duy nhất** hiện có vào
`purchase_orders`/`purchase_order_items`; module `purchase-orders` vẫn chưa có `POST` tay để lập PO
không qua RFQ (đợt sau), nhưng đã có `confirm`/`cancel` chuyển trạng thái PO Draft đã sinh.
`GET /purchase-ledger` đọc thẳng bốn bảng cho `quotedQuantity` (Σ `quantity` mọi dòng **vật tư** báo
giá chưa `CANCELLED`, một lần/vật tư — không nhân theo số NCC được hỏi, xem "quantity sống ở tầng
vật tư" bên dưới) và `orderedQuantity` (Σ `quantity` mọi đơn mua đã `ORDERED`, không đếm `DRAFT`) —
từ khi có `POST /purchase-orders/:id/confirm`, `orderedQuantity` lên số thật sau khi PO được xác
nhận đặt hàng. `status` hiện tại là
**bản rút gọn 4 giá trị** của riêng API này (`WAITING_TO_PURCHASE`/`QUOTING`/`ORDERED`/`COMPLETED`,
xem `PurchaseLedgerService`) — **khác** bộ 7 giá trị đầy đủ mô tả ở "Bảy trạng thái" dưới đây, vẫn là
**thiết kế đích** cho khi RFQ/PO đủ route (không dùng cho response hiện tại). `COMPLETED` cần
`receivedQuantity` (nối qua `inventory_receipt_items.purchaseOrderItemId`, phiếu `POSTED`) —
`inventory-receipts` đã có route ghi cột này khi tạo/sửa phiếu (`purchaseOrderId`/
`purchaseOrderItemId`, validate PO phải `ORDERED`), nên `COMPLETED` xuất hiện thật khi đã nhập đủ.
Không trả tồn kho (`onHand`/`bomDemand`/`available`/`fromStock`) hay
`remainingQuantity`/`pendingPurchaseSince`.

**Cảnh báo (vd "Chưa tạo PO"/"Cần xử lý gấp") không do BE tính** — cùng nguyên tắc với highlight
vàng/đỏ ở thiết kế đích: BE chỉ trả số thô (`orderedQuantity`, `neededDate`), FE tự so ngày lúc
render để cảnh báo luôn đúng theo giờ thực tế của người xem, không bị đứng lại theo thời điểm BE trả
response.

## Core concepts

**Bốn chứng từ, bốn vai trò khác nhau:**

```
purchase_requests / purchase_request_items       — đề xuất đã duyệt (nguồn của nhu cầu, đọc-only ở đây)
purchase_quotations / purchase_quotation_items    — báo giá (RFQ), mỗi dòng là MỘT vật tư (itemId)
purchase_quotation_item_allocations               — phân bổ SL báo giá về từng dòng ĐXMH nguồn đã gộp
purchase_quotation_item_suppliers                 — giá của một NCC hỏi giá cho một dòng vật tư
purchase_orders / purchase_order_items            — đơn mua, đặt với MỘT NCC, có thể không qua báo giá
```

Một báo giá/đơn mua gom nhiều dòng đề xuất **của nhiều đề xuất khác nhau** — không có FK
header-to-header nào giữa `purchase_quotations`/`purchase_orders` và `purchase_requests`, chỉ nối ở
mức dòng. Ở báo giá, mối nối đó đi qua `purchase_quotation_item_allocations` (không phải FK trực
tiếp trên `purchase_quotation_items` — xem ngay dưới); ở đơn mua vẫn là FK trực tiếp
`purchase_order_items.purchase_request_item_id`, không đổi.

**Một dòng báo giá (`purchase_quotation_items`) là một vật tư, có thể gộp nhiều dòng ĐXMH nguồn cùng
vật tư đó** (kể cả từ nhiều phiếu đề xuất khác nhau) — `createQuotation`/`updateQuotation` tự gộp
các dòng payload cùng `itemId` thành một dòng vật tư trước khi ghi (`mergeItemsByItemId`), DB chỉ
còn giữ `uq_purchase_quotation_items_quotation_item` làm chốt chặn cuối. `purchase_quotation_items`
bản thân **không giữ SL** — SL báo giá của
một vật tư là `SUM(purchase_quotation_item_allocations.quantity)` của các phân bổ thuộc nó, tính lúc
đọc, để SL chỉ sống một chỗ. Không phải lựa chọn thẩm mỹ: sổ cái mua hàng
(`quotedQuantitySubquery`) `SUM` thẳng cột `quantity` của bảng phân bổ theo `purchase_request_item_id`
— nếu SL nằm ở tầng NCC (một dòng/NCC như thiết kế cũ hơn), một vật tư được hỏi 3 NCC sẽ làm
`quotedQuantity` nhân ba. Giá/leadtime/ghi chú/NCC nằm ở bảng con `purchase_quotation_item_suppliers`
— một dòng/một NCC/một vật tư, số NCC không giới hạn, SL của vật tư không đổi theo số đó.

Duyệt báo giá (`approveQuotation`) fan-out theo **phân bổ**, không theo dòng vật tư: một dòng báo
giá gộp N phân bổ (N dòng ĐXMH nguồn) sinh đúng N dòng `purchase_order_items` khi duyệt, mỗi dòng
lấy SL của đúng phân bổ đó — `purchase_order_items` vẫn 1:1 với một dòng ĐXMH như trước, không đổi
schema, không đổi bất biến "PO item trace về đúng 1 dòng ĐXMH" (`docs/workflows/rfq-approval.md`).

**Đơn mua không bắt buộc qua báo giá.** `purchase_order_items.quotationItemSupplierId` tuỳ chọn, trỏ
**dòng NCC đã chốt** (`purchase_quotation_item_suppliers`), không trỏ dòng vật tư — đó là nơi duy
nhất giữ đồng thời NCC + giá đã thoả thuận, nên trace về đó mới trả lời được "mua theo giá nào của
NCC nào". Người mua hàng vẫn lập đơn mua thẳng khi đã biết giá (vd giá niêm yết); RFQ chỉ là một
đường tới đó, và hiện là đường **duy nhất** vì `purchase-orders` chưa có `POST` tay.

**Thắng thầu là một bất biến DB giữ ở tầng vật tư, không chỉ service.**
`purchase_quotation_item_suppliers.selectedAt` có giá trị nghĩa là NCC này thắng thầu cho vật tư đó.
Unique index từng phần trên `quotation_item_id` (`WHERE selected_at IS NOT NULL`) chặn **hơn một**
NCC thắng thầu cho cùng một dòng vật tư ở tầng DB. `approve` (duyệt RFQ) chỉ chạy khi *mọi* dòng vật
tư của báo giá đã có đúng một NCC thắng thầu (`E132`) — không duyệt được một phần.

**`purchase_orders` chỉ 3 trạng thái lưu cột — "Đang nhận"/"Hoàn tất" luôn derived.**
`DRAFT → ORDERED → CANCELLED`, không có `RECEIVING`/`COMPLETED` trên `status`. Tiến độ nhận tính lúc
đọc, so `orderedQuantity` (Σ dòng đơn mua chưa hủy) với `receivedQuantity` (Σ dòng phiếu nhập `POSTED`
nối qua `purchase_order_item_id`) — để `inventory-receipts` không phải ghi ngược vào `purchase_orders`
mỗi lần `post`/`cancel` một phiếu nhập. `purchase_orders.quotationId` (tuỳ chọn) trỏ ngược về RFQ đã
sinh ra PO đó — chỉ có giá trị cho PO tự sinh từ `approve`, `null` nếu (khi có route) lập tay.

**`GET /purchase-orders` lọc được "còn hàng chưa nhập đủ"** qua `hasRemainingReceipt=true` —
`status = ORDERED and (orderedQuantity = 0 or receivedQuantity < orderedQuantity)`, tức hợp của
`progress=ORDERED` (chưa nhận gì) và `progress=RECEIVING` (nhận dở), loại `COMPLETED`. Độc lập với
`progress` — gửi cả hai thì `AND` lại, không loại trừ nhau. Chỉ đếm phiếu nhập `POSTED`, giống hệt
`orderedQuantity`/`receivedQuantity` ở trên — không đổi cách tính, chỉ thêm một điều kiện lọc.
`GET /purchase-orders/:id` trả thêm `receivedQuantity` **theo từng dòng** (`purchase_order_items`),
cùng nguồn tính, số thô không kèm `remainingQuantity` — FE tự trừ (cùng nguyên tắc "BE trả số thô"
ở dưới).

**Bảy trạng thái của một dòng sổ cái là derived, tính trong `GET /purchase-ledger`, không lưu cột
nào.** Đánh giá theo đúng thứ tự, dừng ở nhánh khớp đầu tiên:

| # | Giá trị | Nhãn FE | Điều kiện |
| --- | --- | --- | --- |
| 1 | `CANCELLED` | Hủy | dòng bị hủy tay (`purchase_request_items.cancelledAt`), hoặc mọi đơn mua chứa nó đều `CANCELLED` |
| 2 | `COMPLETED` | Hoàn tất | `orderedQuantity > 0` và `receivedQuantity >= orderedQuantity` |
| 3 | `RECEIVING` | Đang nhận | `0 < receivedQuantity < orderedQuantity` |
| 4 | `PURCHASED` | Đã mua | `orderedQuantity > 0`, `receivedQuantity = 0` |
| 5 | `PENDING_PURCHASE` | Chờ mua | có dòng NCC thắng thầu (`purchase_quotation_item_suppliers.selectedAt` không null, báo giá header chưa `CANCELLED`), chưa có đơn mua sống |
| 6 | `QUOTED` | Đã báo giá | có dòng NCC đã có `unitPrice` (`purchase_quotation_item_suppliers`, báo giá header chưa `CANCELLED`), chưa chốt |
| 7 | `NOT_QUOTED` | Chưa báo giá | còn lại — kể cả khi báo giá đang `DRAFT`/`PENDING_APPROVAL` nhưng chưa NCC nào được nhập giá |

"Đã báo giá" (#6) nghĩa là **đã có NCC được nhập giá** (`unitPrice` có giá trị ở ít nhất một dòng
NCC của vật tư đó), không phải "đã tạo RFQ" — RFQ mới tạo, chưa điền giá nào vẫn cho dòng ở
`NOT_QUOTED`.

`pendingPurchaseSince` (chỉ có giá trị ở trạng thái #5) là `selectedAt` của dòng NCC đã thắng thầu —
nguồn duy nhất của highlight vàng (< 24h)/đỏ (≥ 24h) trên FE. BE không tính/trả màu.

**Bốn số lượng của một dòng sổ cái:**

```
quantity          = purchase_request_items.quantity                          (SL đề xuất, cố định)
orderedQuantity   = Σ purchase_order_items.quantity của đơn KHÔNG CANCELLED
receivedQuantity  = Σ inventory_receipt_items.quantity nối qua purchaseOrderItemId,
                     CHỈ phiếu nhập POSTED
remainingQuantity = orderedQuantity − receivedQuantity                        (không phải quantity − orderedQuantity)
```

Không chặn `orderedQuantity > quantity` — mua dư là hợp lệ, sổ cái không ẩn dữ liệu.

**Tồn khả dụng/tồn thực tế trên sổ cái dùng công thức chung với `inventory`/`purchase-requests`**
(`item-stock.query.ts`, xem `docs/domains/inventory.md` khối "Bốn số khác"), nhưng qua hai subquery
riêng (`jobMaterialDemandByJobSubquery`/`jobMaterialDemandByOrderSubquery`) vì mỗi dòng sổ cái thuộc
một đề xuất khác nhau — không có một scope Job/LSX cố định để truyền vào `jobMaterialDemandSubquery`
như `inventory-receipts`/`purchase-requests` detail đang dùng.

## Entities

| Entity | Vai trò |
| --- | --- |
| `purchase_quotations` | Báo giá (RFQ) — header, không mang NCC/giá, vòng đời `DRAFT`/`PENDING_APPROVAL`/`APPROVED`/`CANCELLED` |
| `purchase_quotation_items` | Dòng vật tư của báo giá — chỉ `itemId`, không giữ SL |
| `purchase_quotation_item_allocations` | Phân bổ SL báo giá về từng dòng ĐXMH nguồn đã gộp — `quantity`, `quantityAdjustmentReason` nếu chỉnh khác SL đề xuất của dòng đó |
| `purchase_quotation_item_suppliers` | Giá một NCC báo cho một dòng vật tư — `unitPrice`/`leadTimeDays`/`note`, `selectedAt` nếu thắng thầu |
| `purchase_orders` | Đơn mua — header, một NCC, vòng đời `DRAFT`/`ORDERED`/`CANCELLED`, `quotationId` tuỳ chọn trỏ RFQ sinh ra nó; `assignedUserId`/`paymentTerm`/`receiptWarehouseId` sửa được khi còn `DRAFT` |
| `purchase_order_items` | Dòng đơn mua — SL/giá đặt, `quantityAdjustmentReason` nếu chỉnh khác SL báo giá, `quotationItemSupplierId` tuỳ chọn trỏ dòng NCC đã chốt |
| `payment_requests` | Yêu cầu thanh toán — header phẳng, 1 dòng = đúng 1 PO (`purchaseOrderId` unique), không có bảng con item (đọc lại `purchase_order_items` của PO đó); tự sinh khi PO đạt `COMPLETED`, vòng đời `PENDING`/`PAID`/`CANCELLED` |

## Lifecycle

```
Báo giá:  DRAFT ──send (E131/E130/E120)──────────> PENDING_APPROVAL
          PENDING_APPROVAL ──approve (mọi vật tư đã chọn đúng 1 NCC thắng thầu, E132)──> APPROVED
          PENDING_APPROVAL ──reject────────────────> CANCELLED
          APPROVED ──recall (chưa PO nào ORDERED, E133)──> DRAFT

Đơn mua:  DRAFT ──confirm (đủ expectedDate + kho nhận + paymentTerm + mọi dòng có unitPrice, E134/E155/E156/E135)──> ORDERED
          DRAFT ──cancel (lý do bắt buộc)──> CANCELLED
          ORDERED ──cancel (chưa có phiếu nhập POSTED nối tới, E124)──> CANCELLED
```

`CANCELLED` là điểm cuối cho báo giá — "Từ chối" đưa về đây, phân biệt với "Thu hồi" (từ `APPROVED`
về `DRAFT`, chỉ hợp lệ khi PO Draft đã sinh **chưa** `ORDERED`). Chưa có route đưa `PENDING_APPROVAL`
về lại `DRAFT` để sửa rồi gửi lại ("yêu cầu chỉnh sửa") — đợt sau.

`approve` không chỉ đổi trạng thái — cùng một transaction: set `selectedAt`/`selectedBy` cho từng
dòng NCC thắng thầu, update header `APPROVED`, rồi gom các dòng thắng thầu theo `supplierId` (một
NCC nhiều vật tư → một PO) và gọi sang `PurchaseOrdersService` sinh PO Draft. Đây là đường ghi tự
động **duy nhất** vào `purchase_orders`/`purchase_order_items` hiện có. Mỗi PO Draft nhận
`expectedDate = orderDate + leadTimeDays lớn nhất` trong nhóm dòng cùng NCC (một PO chỉ có một ngày
giao, lấy dòng chờ lâu nhất); `null` nếu không dòng nào có `leadTimeDays`. `recall` làm ngược lại: xoá
các PO Draft đã sinh (cascade dòng), bỏ mọi `selectedAt`/`selectedBy`, header về `DRAFT`.

PO Draft sinh ra sửa được qua `PATCH /purchase-orders/:id` (`expectedDate`/`assignedUserId`/
`paymentTerm`/`receiptWarehouseId`/`note`) và `PATCH .../items/:id` (`quantity`/`unitPrice`/
`quantityAdjustmentReason`) — chỉ khi còn `DRAFT` (`E122`). `supplierId` không có route sửa, cố định
từ NCC thắng thầu lúc `approve`.

`POST /purchase-orders/:id/confirm` xác nhận đặt hàng — `DRAFT → ORDERED`, chặn nếu chưa có
`expectedDate` (`E134`), chưa chọn `receiptWarehouseId` (`E155`), chưa chọn `paymentTerm` (`E156`
— cần để tính hạn thanh toán khi tự sinh yêu cầu thanh toán, xem mục "Yêu cầu thanh toán" bên
dưới), hoặc còn dòng thiếu `unitPrice` (`E135`); `quantity` luôn > 0 sẵn (`CHECK` ở DB).
`POST /purchase-orders/:id/cancel` huỷ — hợp lệ
từ cả `DRAFT` lẫn `ORDERED`, lý do bắt buộc, chặn nếu đã có phiếu nhập `POSTED` nối tới (`E124`).

Duyệt ĐXMH (`purchase-requests:approve`) vẫn không sinh chứng từ nào ở domain này — cả `DRAFT` báo
giá lẫn từng bước tiếp theo đều do người mua hàng thao tác tay qua route của chính domain này.

**Một dòng đề xuất** (`purchase_request_items`) hủy tay được khi **chưa có đơn mua sống** — hủy đơn
mua chứa nó, hoặc `POST /purchase-ledger/:id/cancel`, đều lật dòng sổ cái sang `CANCELLED`; `restore`
gỡ hủy tay (không gỡ được hủy-do-đơn-mua, phải lập đơn mua khác).

### Yêu cầu thanh toán

```
              (PO đạt progress COMPLETED, tự sinh) ──> PENDING
              PENDING ──mark-paid (purchasing:approve)──> PAID
              PENDING ──cancel (purchasing:approve)──────> CANCELLED
```

`payment_requests` **không có route tạo tay** — sinh duy nhất qua
`PaymentRequestsService.createIfOrderCompleted(tx, purchaseOrderId)`, gọi từ
`InventoryReceiptsService.postInventoryReceipt` cùng transaction mỗi lần một phiếu nhập gắn PO được
`post` (đúng khuôn `IqcService.createInspectionsFromReceipt`). Idempotent — gọi lại nhiều lần
(PO nhận qua nhiều phiếu) không tạo trùng, chỉ tạo đúng một lần khi `receivedQuantity` vừa chạm
`orderedQuantity`. `requestValue` = snapshot Σ `quantity*unitPrice` của PO lúc tạo (PO đã `ORDERED`
nên items bất biến); `dueDate` = `orderDate + paymentTerm` (map ngày: `IMMEDIATE`=0/`NET_15`=15/
`NET_30`=30/`NET_60`=60) — vì vậy `confirm` PO bắt buộc có `paymentTerm` (`E156`, xem trên). Nếu PO
đã `confirm` từ trước khi có gate `E156` (không có `paymentTerm`), `createIfOrderCompleted` bỏ qua,
không tạo bù — **giới hạn đã biết**, không có route tạo tay để vá các PO cũ này.
`PENDING → PAID`/`CANCELLED` là chuyển trạng thái cuối, không rollback; cả hai đều `purchasing:approve`
(không tách quyền riêng). Xem `docs/decisions/no-procurement.md` — đây là phần "thanh toán" đã đảo
một phần, **không** phải công nợ/thanh toán/kế toán thật.

## Business rules

- Phân bổ báo giá (`purchase_quotation_item_allocations`)/`purchase_order_items` chỉ nhận
  `purchaseRequestItemId` thuộc phiếu `APPROVED` và **chưa hủy tay** (`E125`).
- Một báo giá không được chứa hai dòng ĐXMH nguồn trùng nhau trong **toàn payload**, kể cả ở hai dòng
  vật tư khác nhau (`E128`, `PurchaseQuotationsService.validateAllocations`) — trùng sẽ nhân đôi
  `quotedQuantity` của dòng đó trên sổ cái.
- Một dòng ĐXMH được phân bổ vào một dòng vật tư phải đúng `itemId` của dòng đó (`E149`) — phân bổ
  không tự suy ra vật tư, phải khớp tường minh.
- Một dòng vật tư trong payload phải có ≥1 phân bổ (`E150`) — không có dòng vật tư "rỗng".
- Hai dòng payload cùng `itemId` được **BE tự gộp** thành một dòng vật tư
  (`PurchaseQuotationsService.mergeItemsByItemId`): nối `allocations`, union NCC theo `supplierId`
  — đây là cơ chế "gộp vật tư trùng nhau", DB chỉ còn giữ
  `uq_purchase_quotation_items_quotation_item` làm chốt chặn cuối.
- Một vật tư **sau khi gộp** không được có hai NCC trùng `supplierId` với
  `unitPrice`/`leadTimeDays`/`note` khác nhau (`E129`, `mergeSuppliers`) — trùng khít (mọi field
  giống hệt) thì gộp im lặng thành một dòng.
- `send` (gửi duyệt) chặn nếu: RFQ không có vật tư nào (`E131`); có vật tư chưa có NCC nào
  (`E130`); có dòng NCC nào (đã thêm) còn thiếu `unitPrice` (`E120`) — mọi NCC đã liệt kê phải có
  giá trước khi trình duyệt, không chỉ cần một NCC có giá.
- `approve` (duyệt) chặn nếu còn vật tư chưa chọn đúng một NCC thắng thầu (`E132`) — không duyệt
  từng phần. Set `selectedAt`/`selectedBy` cho dòng thắng, sinh PO Draft cùng transaction (xem
  `docs/workflows/rfq-approval.md`).
- `recall` (thu hồi RFQ đã duyệt) chặn nếu có PO do RFQ đó sinh ra đã `ORDERED` (`E133`) — hàng đã
  đặt thật không thể âm thầm rút RFQ, phải huỷ PO trước ở domain `purchase-orders`.
- `cancel` đơn mua chặn nếu đã có phiếu nhập `POSTED` nối tới (`E124`) — đơn đã có hàng về không hủy
  được, phải xử lý ở phiếu nhập trước. Chặn thêm nếu đã `CANCELLED` (`E122`) — huỷ hai lần không hợp
  lệ, nhưng `DRAFT` và `ORDERED` đều huỷ được (khác `PATCH`, chỉ sửa được khi `DRAFT`).
- Sửa PO Draft (`PATCH /purchase-orders/:id`, `PATCH .../items/:id`) chặn nếu PO không còn `DRAFT`
  (`E122`) — đã `ORDERED`/`CANCELLED` thì SL/giá/ngày giao đã chốt, không sửa tay được nữa.
- `confirm` (xác nhận đặt hàng) chặn nếu PO không còn `DRAFT` (`E122`), chưa có `expectedDate`
  (`E134`), chưa chọn `receiptWarehouseId` (`E155`), chưa chọn `paymentTerm` (`E156`), hoặc còn dòng
  thiếu `unitPrice` (`E135`).
- `PATCH` với `assignedUserId`/`receiptWarehouseId` kiểm tồn tại trước khi ghi — `E136` (người phụ
  trách không tồn tại), `E092`/`E094` (kho không tồn tại/không `ACTIVE`, tái dùng từ domain
  `warehouses`).
- `POST /purchase-ledger/:id/cancel` chặn nếu dòng đã có đơn mua sống (`E126`) — muốn hủy phải hủy
  đơn mua trước.
- `mark-paid`/`cancel` một yêu cầu thanh toán chặn nếu không còn `PENDING` (`E158`) — cả hai chuyển
  trạng thái đều cuối, không đổi lại được.
- Mã (`purchase_quotations.code` tiền tố `RFQ`, `purchase_orders.code` tiền tố `PO`) bất biến, unique
  toàn bảng, cấp qua bảng đếm dùng chung `document_sequences` (`docs/architecture.md`, mục "Bất biến
  xuyên module") — số + pad, không tách năm.

## Cross-domain dependencies

- **← Purchase Requests**: đọc `purchase_request_items` của phiếu `APPROVED`; không ghi ngược —
  đề xuất chỉ đổi trạng thái qua route của chính nó.
- **← Partners**: `supplierId` (NCC) bắt buộc — ở dòng cho báo giá
  (`purchase_quotation_item_suppliers`), ở header cho đơn mua (`purchase_orders`).
- **→ Purchase Orders (nội bộ domain)**: `approveQuotation` gọi
  `PurchaseOrdersService.createDraftOrdersFromQuotation(tx, ...)` trong cùng transaction — đường ghi
  duy nhất hiện có vào `purchase_orders`/`purchase_order_items`. `PurchaseOrdersModule` không import
  ngược `PurchaseQuotationsModule`, không vòng phụ thuộc.
- **→ Inventory**: `inventory_receipts.purchaseOrderId`/`inventory_receipt_items.purchaseOrderItemId`
  là chỗ nối duy nhất — phiếu nhập trace về đơn mua, validate mức cơ bản lúc tạo/sửa/`confirm` phiếu
  (PO phải tồn tại + đang `ORDERED`, dòng phải thuộc đúng PO đó, SL cộng dồn các phiếu đã `confirm`
  không vượt SL đặt của dòng; `E121`/`E145`/`E123`/`E127`/`E154`), không đọc ngược gì khác
  (`InventoryPostingService` không đổi, xem `docs/domains/inventory.md`). Chiều ngược lại:
  `orderReceivedQuantitySubquery` (dùng cho `progress`/`hasRemainingReceipt` và `receivedQuantity`
  trên dòng detail) đọc `inventory_receipt_items` join `inventory_receipts` lọc `POSTED`;
  `cancelPurchaseOrder` đọc thẳng `inventory_receipts` (không qua service) để chặn huỷ khi đã có
  phiếu `POSTED` nối tới (`E124`). Chiều ngược lại: `InventoryReceiptsService.postInventoryReceipt`
  gọi `PaymentRequestsService.createIfOrderCompleted(tx, purchaseOrderId)` cùng transaction —
  `InventoryReceiptsModule` import `PaymentRequestsModule` (không vòng phụ thuộc, `purchasing` không
  import ngược `inventory-receipts`).
- **→ Warehouses**: `purchase_orders.receiptWarehouseId` — tuỳ chọn lúc `DRAFT`, bắt buộc trước khi
  `confirm` (`E155`); kho dự kiến nhập hàng về khi PO hoàn tất, chỉ để tham chiếu/mặc định cho
  phiếu nhập sau này, chưa có logic đọc lại. `PurchaseOrdersModule` import `WarehousesModule` để
  validate qua `WarehousesService.ensureWarehouseActive` (`E092`/`E094`).
- **→ Product Structure**: dòng báo giá (`purchase_quotation_items.itemId`) trỏ thẳng `items` bằng FK
  riêng; dòng đơn mua vẫn trỏ gián tiếp qua `purchase_request_items.itemId`, không có FK riêng.

## Common mistakes

1. **Tưởng `purchase_orders.status` có `RECEIVING`/`COMPLETED`.** Không — chỉ 3 giá trị lưu cột,
   tiến độ nhận luôn derived từ phiếu nhập, đọc ở sổ cái hoặc `GET /purchase-orders/:id`.
2. **Tưởng thêm một NCC vào một vật tư là thêm một dòng vật tư mới.** Không — SL sống ở
   `purchase_quotation_item_allocations` (tổng theo vật tư, không nhân theo NCC); thêm NCC chỉ thêm
   một dòng `purchase_quotation_item_suppliers`. Nhầm hai thứ này sẽ nhân `quotedQuantity` trên sổ cái.
3. **Tưởng gửi hai dòng vật tư trùng `itemId` sẽ tạo hai dòng báo giá hoặc lỗi.** Không — BE tự gộp
   (`mergeItemsByItemId`) thành một dòng trước khi ghi, DB chỉ còn là chốt chặn cuối. FE vẫn gộp sẵn
   lúc tick chọn (không phải vì BE bắt buộc) vì UI Bước 2 cần dòng đã gộp để sửa SL từng phân bổ
   riêng — hai lớp gộp độc lập, không lớp nào thay được lớp kia.
4. **Trừ `orderedQuantity` cho `quantity` để tính "còn thiếu".** Không cộng/trừ được — `quantity` là
   SL đề xuất cố định, `orderedQuantity` có thể lớn hơn (mua dư) hoặc nhỏ hơn (mua từng phần).
   `remainingQuantity` đã là số đúng cho "còn phải nhận", tính từ `orderedQuantity − receivedQuantity`.
5. **Tưởng hủy đơn mua thì dòng đề xuất tự "mở lại" để báo giá/đặt mua lại ngay.** Đúng là dòng về
   `CANCELLED` trên sổ cái, nhưng đó là hủy **do đơn mua**, không tự khôi phục — phải lập đơn mua
   khác (dòng đề xuất vẫn còn, chỉ đơn mua cũ chết).
6. **Đi tìm route `POST /purchase-orders` để lập PO tay.** Chưa có — PO hiện tại chỉ sinh tự động
   từ `approve` một RFQ, đợt sau mới có lập tay.
7. **Tưởng lập một PO `DRAFT` là dòng sổ cái đã "đặt hàng".** `orderedQuantity` chỉ đếm PO đã
   `ORDERED` — PO Draft (kể cả PO tự sinh từ duyệt RFQ) không tính, dòng sổ cái vẫn
   `QUOTING`/`WAITING_TO_PURCHASE` tuỳ đã có RFQ hay chưa.
8. **Tưởng bị từ chối thì sửa lại gửi duyệt tiếp được.** Không — `CANCELLED` là điểm cuối, `reject`
   không có đường lùi về `DRAFT`; muốn sửa và gửi lại phải tạo RFQ mới (chưa có route "yêu cầu chỉnh
   sửa" riêng, đợt sau).
9. **Tưởng nhận hàng vượt SL đặt của PO vẫn luôn hợp lệ.** Đã đảo ngược — nhập kho qua phiếu (không
   phải đặt mua qua PO) giờ chặn ở `E154` khi tổng SL các phiếu đã `confirm` cho một dòng PO vượt SL
   đặt dòng đó (`docs/domains/inventory.md`). Mua dư (`orderedQuantity > quantity` đề xuất) không
   đổi, vẫn hợp lệ như cũ — hai chuyện khác nhau.
10. **Tưởng `progress=ORDERED` đã bao gồm cả PO nhận dở.** Không — `ORDERED` nghĩa là
    `receivedQuantity = 0` (chưa nhận gì), PO nhận dở nằm ở `RECEIVING`. Muốn "còn hàng chưa nhập
    đủ" (cả hai) thì dùng `hasRemainingReceipt=true`, không lọc `progress=ORDERED` một mình.

## Related docs

- `docs/decisions/no-procurement.md` — vì sao domain này tồn tại, đảo ngược quyết định gì.
- `docs/domains/purchase-requests.md` — nguồn nhu cầu (`APPROVED`), không phải nơi domain này ghi vào.
- `docs/workflows/rfq-approval.md` — trình tự đầy đủ gửi duyệt → duyệt chọn thắng thầu → sinh PO Draft.
- `docs/domains/inventory.md` — nơi phiếu nhập tiêu thụ `purchase_order_items`, khối "Bốn số khác"
  (công thức tồn/nhu cầu dùng chung).
- `docs/domains/partners.md` — nơi `suppliers` sống.
