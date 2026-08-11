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
`receivedQuantity` (nối qua `inventory_receipt_items.purchaseOrderItemId`, phiếu `POSTED`) — cột đã
có nhưng `inventory-receipts` chưa route nào ghi, nên `COMPLETED` chưa thể xuất hiện thật. Không trả
tồn kho (`onHand`/`bomDemand`/`available`/`fromStock`) hay `remainingQuantity`/`pendingPurchaseSince`.

**Cảnh báo (vd "Chưa tạo PO"/"Cần xử lý gấp") không do BE tính** — cùng nguyên tắc với highlight
vàng/đỏ ở thiết kế đích: BE chỉ trả số thô (`orderedQuantity`, `neededDate`), FE tự so ngày lúc
render để cảnh báo luôn đúng theo giờ thực tế của người xem, không bị đứng lại theo thời điểm BE trả
response.

## Core concepts

**Bốn chứng từ, bốn vai trò khác nhau:**

```
purchase_requests / purchase_request_items      — đề xuất đã duyệt (nguồn của nhu cầu, đọc-only ở đây)
purchase_quotations / purchase_quotation_items   — báo giá (RFQ), mỗi dòng là MỘT vật tư
purchase_quotation_item_suppliers                — giá của một NCC hỏi giá cho một dòng vật tư
purchase_orders / purchase_order_items           — đơn mua, đặt với MỘT NCC, có thể không qua báo giá
```

Một báo giá/đơn mua gom nhiều dòng đề xuất **của nhiều đề xuất khác nhau** — không có FK
header-to-header nào giữa `purchase_quotations`/`purchase_orders` và `purchase_requests`, chỉ nối ở
mức dòng (`purchase_request_item_id`).

**`quantity` sống đúng một lần ở tầng vật tư (`purchase_quotation_items`), không phải ở tầng NCC.**
Đây không phải lựa chọn thẩm mỹ — sổ cái mua hàng (`quotedQuantitySubquery`) `SUM` thẳng cột này theo
`purchase_request_item_id`. Nếu SL nằm ở tầng NCC (một dòng/NCC như thiết kế cũ), một vật tư được hỏi
3 NCC sẽ làm `quotedQuantity` nhân ba. Giá/leadtime/ghi chú/NCC nằm ở bảng con
`purchase_quotation_item_suppliers` — một dòng/một NCC/một vật tư, số NCC không giới hạn, `quantity`
của vật tư không đổi theo số đó.

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
| `purchase_quotation_items` | Dòng vật tư của báo giá — `quantity` một lần/vật tư, `quantityAdjustmentReason` nếu chỉnh khác SL đề xuất |
| `purchase_quotation_item_suppliers` | Giá một NCC báo cho một dòng vật tư — `unitPrice`/`leadTimeDays`/`note`, `selectedAt` nếu thắng thầu |
| `purchase_orders` | Đơn mua — header, một NCC, vòng đời `DRAFT`/`ORDERED`/`CANCELLED`, `quotationId` tuỳ chọn trỏ RFQ sinh ra nó; `assignedUserId`/`paymentTerm`/`receiptWarehouseId` sửa được khi còn `DRAFT` |
| `purchase_order_items` | Dòng đơn mua — SL/giá đặt, `quantityAdjustmentReason` nếu chỉnh khác SL báo giá, `quotationItemSupplierId` tuỳ chọn trỏ dòng NCC đã chốt |

## Lifecycle

```
Báo giá:  DRAFT ──send (E131/E130/E120)──────────> PENDING_APPROVAL
          PENDING_APPROVAL ──approve (mọi vật tư đã chọn đúng 1 NCC thắng thầu, E132)──> APPROVED
          PENDING_APPROVAL ──reject────────────────> CANCELLED
          APPROVED ──recall (chưa PO nào ORDERED, E133)──> DRAFT

Đơn mua:  DRAFT ──confirm (đủ expectedDate + mọi dòng có unitPrice, E134/E135)──> ORDERED
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
`expectedDate` (`E134`) hoặc còn dòng thiếu `unitPrice` (`E135`); `quantity` luôn > 0 sẵn (`CHECK` ở
DB). `POST /purchase-orders/:id/cancel` huỷ — hợp lệ từ cả `DRAFT` lẫn `ORDERED`, lý do bắt buộc,
chặn nếu đã có phiếu nhập `POSTED` nối tới (`E124`).

Duyệt ĐXMH (`purchase-requests:approve`) vẫn không sinh chứng từ nào ở domain này — cả `DRAFT` báo
giá lẫn từng bước tiếp theo đều do người mua hàng thao tác tay qua route của chính domain này.

**Một dòng đề xuất** (`purchase_request_items`) hủy tay được khi **chưa có đơn mua sống** — hủy đơn
mua chứa nó, hoặc `POST /purchase-ledger/:id/cancel`, đều lật dòng sổ cái sang `CANCELLED`; `restore`
gỡ hủy tay (không gỡ được hủy-do-đơn-mua, phải lập đơn mua khác).

## Business rules

- `purchase_quotation_items`/`purchase_order_items` chỉ nhận `purchaseRequestItemId` thuộc phiếu
  `APPROVED` và **chưa hủy tay** (`E125`).
- Một báo giá không được chứa hai dòng vật tư cùng `purchaseRequestItemId` (`E128`,
  `PurchaseQuotationsService`) — DB giữ qua `uq_purchase_quotation_items_quotation_request_item`;
  trùng sẽ nhân đôi `quotedQuantity` của dòng đó trên sổ cái.
- Một dòng vật tư không được chứa hai NCC trùng `supplierId` (`E129`) — DB giữ qua
  `unique(quotationItemId, supplierId)` trên `purchase_quotation_item_suppliers`.
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
  (`E134`), hoặc còn dòng thiếu `unitPrice` (`E135`).
- `PATCH` với `assignedUserId`/`receiptWarehouseId` kiểm tồn tại trước khi ghi — `E136` (người phụ
  trách không tồn tại), `E092`/`E094` (kho không tồn tại/không `ACTIVE`, tái dùng từ domain
  `warehouses`).
- `POST /purchase-ledger/:id/cancel` chặn nếu dòng đã có đơn mua sống (`E126`) — muốn hủy phải hủy
  đơn mua trước.
- Mã (`purchase_quotations.code` tiền tố `RFQ`, `purchase_orders.code` tiền tố `PO`) bất biến, unique
  toàn bảng, sinh theo khuôn `PurchaseRequestsService.generatePurchaseRequestCode` (đếm + pad, không
  tách năm).

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
  là chỗ nối duy nhất — phiếu nhập trace về đơn mua, không đọc ngược (`InventoryPostingService`
  không đổi, xem `docs/domains/inventory.md`). Chiều ngược lại: `cancelPurchaseOrder` đọc thẳng
  `inventory_receipts` (không qua service) để chặn huỷ khi đã có phiếu `POSTED` (`E124`) — luôn
  `false` cho tới khi `inventory-receipts` có route ghi `purchaseOrderId` thật.
- **→ Warehouses**: `purchase_orders.receiptWarehouseId` (tuỳ chọn) — kho dự kiến nhập hàng về khi PO
  hoàn tất, chỉ để tham chiếu/mặc định cho phiếu nhập sau này, chưa có logic đọc lại.
  `PurchaseOrdersModule` import `WarehousesModule` để validate qua
  `WarehousesService.ensureWarehouseActive` (`E092`/`E094`).
- **→ Product Structure**: dòng báo giá/đơn mua trỏ gián tiếp tới `items` qua
  `purchase_request_items.itemId`, không có FK riêng.

## Common mistakes

1. **Tưởng `purchase_orders.status` có `RECEIVING`/`COMPLETED`.** Không — chỉ 3 giá trị lưu cột,
   tiến độ nhận luôn derived từ phiếu nhập, đọc ở sổ cái hoặc `GET /purchase-orders/:id`.
2. **Tưởng thêm một NCC vào một vật tư là thêm một dòng vật tư mới.** Không — `quantity` sống ở
   `purchase_quotation_items` (một lần/vật tư); thêm NCC chỉ thêm một dòng
   `purchase_quotation_item_suppliers`. Nhầm hai thứ này sẽ nhân `quotedQuantity` trên sổ cái.
3. **Trừ `orderedQuantity` cho `quantity` để tính "còn thiếu".** Không cộng/trừ được — `quantity` là
   SL đề xuất cố định, `orderedQuantity` có thể lớn hơn (mua dư) hoặc nhỏ hơn (mua từng phần).
   `remainingQuantity` đã là số đúng cho "còn phải nhận", tính từ `orderedQuantity − receivedQuantity`.
4. **Tưởng hủy đơn mua thì dòng đề xuất tự "mở lại" để báo giá/đặt mua lại ngay.** Đúng là dòng về
   `CANCELLED` trên sổ cái, nhưng đó là hủy **do đơn mua**, không tự khôi phục — phải lập đơn mua
   khác (dòng đề xuất vẫn còn, chỉ đơn mua cũ chết).
5. **Đi tìm route `POST /purchase-orders` để lập PO tay.** Chưa có — PO hiện tại chỉ sinh tự động
   từ `approve` một RFQ, đợt sau mới có lập tay.
6. **Tưởng lập một PO `DRAFT` là dòng sổ cái đã "đặt hàng".** `orderedQuantity` chỉ đếm PO đã
   `ORDERED` — PO Draft (kể cả PO tự sinh từ duyệt RFQ) không tính, dòng sổ cái vẫn
   `QUOTING`/`WAITING_TO_PURCHASE` tuỳ đã có RFQ hay chưa.
7. **Tưởng bị từ chối thì sửa lại gửi duyệt tiếp được.** Không — `CANCELLED` là điểm cuối, `reject`
   không có đường lùi về `DRAFT`; muốn sửa và gửi lại phải tạo RFQ mới (chưa có route "yêu cầu chỉnh
   sửa" riêng, đợt sau).

## Related docs

- `docs/decisions/no-procurement.md` — vì sao domain này tồn tại, đảo ngược quyết định gì.
- `docs/domains/purchase-requests.md` — nguồn nhu cầu (`APPROVED`), không phải nơi domain này ghi vào.
- `docs/workflows/rfq-approval.md` — trình tự đầy đủ gửi duyệt → duyệt chọn thắng thầu → sinh PO Draft.
- `docs/domains/inventory.md` — nơi phiếu nhập tiêu thụ `purchase_order_items`, khối "Bốn số khác"
  (công thức tồn/nhu cầu dùng chung).
- `docs/domains/partners.md` — nơi `suppliers` sống.
