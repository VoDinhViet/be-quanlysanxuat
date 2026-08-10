# Purchasing (Mua hàng)

## Purpose

Biến một đề xuất mua hàng **đã duyệt** (`docs/domains/purchase-requests.md`) thành hàng thật trong
kho: hỏi giá NCC (báo giá), chốt giá và đặt mua (đơn mua), rồi nhận hàng qua phiếu nhập
(`docs/domains/inventory.md`). Đảo ngược `docs/decisions/no-procurement.md` — xem lý do ở đầu file
đó.

**Sổ cái mua hàng** (`GET /purchase-ledger`) là màn hình tổng hợp, một dòng/một dòng đề xuất, thiết
kế để hiện đủ vòng đời từ đề xuất → nhận hàng. Nó không phải một chứng từ — không có bảng riêng, mọi
số đều tính lúc đọc từ bốn bảng gốc.

**Trạng thái hiện tại (chưa xong hết thiết kế dưới đây).** Module `purchase-quotations` đã có
`GET` list/detail + `POST` lập báo giá tay (chọn dòng ĐXMH `APPROVED` + một NCC) — không sinh tự động
ở bước duyệt ĐXMH. Module `purchase-orders` mới có `GET` list — **chưa có** route
tạo, nên list này rỗng trên dữ liệu thật tới khi có `POST /purchase-orders` (đợt sau, gom dòng báo giá
đã chốt giá thành đơn). `GET /purchase-ledger` đọc thẳng bốn bảng cho `quotedQuantity` (Σ `quantity`
mọi dòng báo giá chưa `CANCELLED`, không xét đã có giá hay chưa — "có RFQ" = đang báo giá) và
`orderedQuantity` (Σ `quantity` mọi đơn mua đã `ORDERED`, không đếm `DRAFT`) — `orderedQuantity` vẫn
**luôn ra 0** cho tới khi có route tạo PO. `status` hiện tại là **bản rút gọn 4 giá trị** của riêng
API này (`WAITING_TO_PURCHASE`/`QUOTING`/`ORDERED`/`COMPLETED`, xem `PurchaseLedgerService`) — **khác**
bộ 7 giá trị đầy đủ mô tả ở "Bảy trạng thái" dưới đây, vẫn là **thiết kế đích** cho khi RFQ/PO đủ route
(không dùng cho response hiện tại). `COMPLETED` cần `receivedQuantity` (nối qua
`inventory_receipt_items.purchaseOrderItemId`, phiếu `POSTED`) — cột đã có nhưng `inventory-receipts`
chưa route nào ghi, nên `COMPLETED` chưa thể xuất hiện thật. Không trả tồn kho
(`onHand`/`bomDemand`/`available`/`fromStock`) hay `remainingQuantity`/`pendingPurchaseSince`.

**Cảnh báo (vd "Chưa tạo PO"/"Cần xử lý gấp") không do BE tính** — cùng nguyên tắc với highlight
vàng/đỏ ở thiết kế đích: BE chỉ trả số thô (`orderedQuantity`, `neededDate`), FE tự so ngày lúc
render để cảnh báo luôn đúng theo giờ thực tế của người xem, không bị đứng lại theo thời điểm BE trả
response.

## Core concepts

**Ba chứng từ, ba vai trò khác nhau:**

```
purchase_requests / purchase_request_items   — đề xuất đã duyệt (nguồn của nhu cầu, đọc-only ở đây)
purchase_quotations / purchase_quotation_items — báo giá, hỏi MỘT NCC cho nhiều dòng đề xuất
purchase_orders / purchase_order_items         — đơn mua, đặt với MỘT NCC, có thể không qua báo giá
```

Một báo giá/đơn mua gom nhiều dòng đề xuất **của nhiều đề xuất khác nhau**, miễn cùng NCC — không
có FK header-to-header nào giữa `purchase_quotations`/`purchase_orders` và `purchase_requests`, chỉ
nối ở mức dòng (`purchase_request_item_id`).

**Đơn mua không bắt buộc qua báo giá.** `purchase_order_items.quotationItemId` tuỳ chọn — người mua
hàng có thể lập đơn mua thẳng khi đã biết giá (vd giá niêm yết), báo giá chỉ là một đường tới đó.

**Chốt giá là một bất biến do service giữ, không do DB.** `purchase_quotation_items.selectedAt` có
giá trị nghĩa là dòng này được chọn để mua. Một `purchaseRequestItemId` có thể xuất hiện ở nhiều báo
giá (nhiều NCC), nhưng chỉ được chốt (`selectedAt IS NOT NULL`) ở **tối đa một** dòng đang sống tại
một thời điểm — `select` ở báo giá khác phải bỏ chọn dòng cũ trước. DB không có unique index nào
enforce điều này vì "đang sống" phụ thuộc trạng thái báo giá (`CANCELLED` thì dòng của nó không tính).

**`purchase_orders` chỉ 3 trạng thái lưu cột — "Đang nhận"/"Hoàn tất" luôn derived.**
`DRAFT → ORDERED → CANCELLED`, không có `RECEIVING`/`COMPLETED` trên `status`. Tiến độ nhận tính lúc
đọc, so `orderedQuantity` (Σ dòng đơn mua chưa hủy) với `receivedQuantity` (Σ dòng phiếu nhập `POSTED`
nối qua `purchase_order_item_id`) — để `inventory-receipts` không phải ghi ngược vào `purchase_orders`
mỗi lần `post`/`cancel` một phiếu nhập.

**Bảy trạng thái của một dòng sổ cái là derived, tính trong `GET /purchase-ledger`, không lưu cột
nào.** Đánh giá theo đúng thứ tự, dừng ở nhánh khớp đầu tiên:

| # | Giá trị | Nhãn FE | Điều kiện |
| --- | --- | --- | --- |
| 1 | `CANCELLED` | Hủy | dòng bị hủy tay (`purchase_request_items.cancelledAt`), hoặc mọi đơn mua chứa nó đều `CANCELLED` |
| 2 | `COMPLETED` | Hoàn tất | `orderedQuantity > 0` và `receivedQuantity >= orderedQuantity` |
| 3 | `RECEIVING` | Đang nhận | `0 < receivedQuantity < orderedQuantity` |
| 4 | `PURCHASED` | Đã mua | `orderedQuantity > 0`, `receivedQuantity = 0` |
| 5 | `PENDING_PURCHASE` | Chờ mua | có dòng báo giá đã chốt (`selectedAt` không null, báo giá chưa hủy), chưa có đơn mua sống |
| 6 | `QUOTED` | Đã báo giá | có dòng báo giá đã có `unitPrice` (báo giá chưa hủy), chưa chốt |
| 7 | `NOT_QUOTED` | Chưa báo giá | còn lại — kể cả khi đã có báo giá `DRAFT`/`SENT` (hỏi rồi nhưng NCC chưa trả giá) |

"Đã báo giá" (#6) nghĩa là **NCC đã trả giá** (`unitPrice` có giá trị), không phải "đã đi hỏi" — báo
giá mới tạo/mới gửi vẫn cho dòng ở `NOT_QUOTED`.

`pendingPurchaseSince` (chỉ có giá trị ở trạng thái #5) là `selectedAt` của dòng báo giá đã chốt —
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
| `purchase_quotations` | Báo giá — header, một NCC, vòng đời `DRAFT`/`SENT`/`RECEIVED`/`CANCELLED` |
| `purchase_quotation_items` | Dòng báo giá — giá NCC cho một dòng đề xuất, `selectedAt` nếu được chốt |
| `purchase_orders` | Đơn mua — header, một NCC, vòng đời `DRAFT`/`ORDERED`/`CANCELLED` |
| `purchase_order_items` | Dòng đơn mua — SL/giá đặt, `quotationItemId` tuỳ chọn để trace |

## Lifecycle

```
Báo giá:  DRAFT ──send──> SENT ──receive (đủ unitPrice, E120)──> RECEIVED ──select──> (chốt giá)
          DRAFT/SENT ──cancel──> CANCELLED

Đơn mua:  DRAFT ──order──> ORDERED
          DRAFT ──cancel──> CANCELLED
          ORDERED ──cancel (chưa có phiếu nhập POSTED nối tới, E124)──> CANCELLED
```

Không có đường lùi ở cả hai — `CANCELLED` là điểm cuối, `RECEIVED`/`ORDERED` không quay lại
`SENT`/`DRAFT`.

Cả `DRAFT` báo giá lẫn `DRAFT` đơn mua đều do người mua hàng **lập tay** qua `POST` — duyệt ĐXMH
(`purchase-requests:approve`) không sinh chứng từ nào ở domain này, chỉ lật trạng thái phiếu của
chính nó.

**Một dòng đề xuất** (`purchase_request_items`) hủy tay được khi **chưa có đơn mua sống** — hủy đơn
mua chứa nó, hoặc `POST /purchase-ledger/:id/cancel`, đều lật dòng sổ cái sang `CANCELLED`; `restore`
gỡ hủy tay (không gỡ được hủy-do-đơn-mua, phải lập đơn mua khác).

## Business rules

- `purchase_quotation_items`/`purchase_order_items` chỉ nhận `purchaseRequestItemId` thuộc phiếu
  `APPROVED` và **chưa hủy tay** (`E125`).
- Một báo giá không được chứa hai dòng cùng `purchaseRequestItemId` (`E128`,
  `PurchaseQuotationsService.createQuotation`) — trùng sẽ nhân đôi `quotedQuantity` của dòng đó trên
  sổ cái.
- `receive` (báo giá) chặn nếu còn dòng thiếu `unitPrice` (`E120`) — không cho chốt giá dòng chưa có
  giá.
- `select` chạy trong transaction: bỏ `selectedAt` ở mọi dòng báo giá khác cùng
  `purchaseRequestItemId` trước, rồi mới set — giữ bất biến "tối đa một giá được chốt".
- `cancel` đơn mua chặn nếu đã có phiếu nhập `POSTED` nối tới (`E124`) — đơn đã có hàng về không hủy
  được, phải xử lý ở phiếu nhập trước.
- `POST /purchase-ledger/:id/cancel` chặn nếu dòng đã có đơn mua sống (`E126`) — muốn hủy phải hủy
  đơn mua trước.
- Mã (`purchase_quotations.code` tiền tố `RFQ`, `purchase_orders.code` tiền tố `PO`) bất biến, unique
  toàn bảng, sinh theo khuôn `PurchaseRequestsService.generatePurchaseRequestCode` (đếm + pad, không
  tách năm).

## Cross-domain dependencies

- **← Purchase Requests**: đọc `purchase_request_items` của phiếu `APPROVED`; không ghi ngược —
  đề xuất chỉ đổi trạng thái qua route của chính nó.
- **← Partners**: `supplierId` (NCC) bắt buộc trên cả báo giá và đơn mua.
- **→ Inventory**: `inventory_receipts.purchaseOrderId`/`inventory_receipt_items.purchaseOrderItemId`
  là chỗ nối duy nhất — phiếu nhập trace về đơn mua, không đọc ngược (`InventoryPostingService`
  không đổi, xem `docs/domains/inventory.md`).
- **→ Product Structure**: dòng báo giá/đơn mua trỏ gián tiếp tới `items` qua
  `purchase_request_items.itemId`, không có FK riêng.

## Common mistakes

1. **Tưởng `purchase_orders.status` có `RECEIVING`/`COMPLETED`.** Không — chỉ 3 giá trị lưu cột,
   tiến độ nhận luôn derived từ phiếu nhập, đọc ở sổ cái hoặc `GET /purchase-orders/:id`.
2. **Tưởng một dòng đề xuất chỉ được báo giá một lần.** Có thể xuất hiện ở nhiều báo giá (nhiều NCC)
   cùng lúc — chỉ **chốt** (`selectedAt`) được ở tối đa một dòng.
3. **Trừ `orderedQuantity` cho `quantity` để tính "còn thiếu".** Không cộng/trừ được — `quantity` là
   SL đề xuất cố định, `orderedQuantity` có thể lớn hơn (mua dư) hoặc nhỏ hơn (mua từng phần).
   `remainingQuantity` đã là số đúng cho "còn phải nhận", tính từ `orderedQuantity − receivedQuantity`.
4. **Tưởng hủy đơn mua thì dòng đề xuất tự "mở lại" để báo giá/đặt mua lại ngay.** Đúng là dòng về
   `CANCELLED` trên sổ cái, nhưng đó là hủy **do đơn mua**, không tự khôi phục — phải lập đơn mua
   khác (dòng đề xuất vẫn còn, chỉ đơn mua cũ chết).
5. **Đi tìm cột duyệt đơn mua.** Chưa có — `DRAFT → ORDERED` là thao tác của người mua hàng, không
   qua Giám đốc (khác `purchase-requests:approve`).
6. **Tưởng lập một PO `DRAFT` là dòng sổ cái đã "đặt hàng".** `orderedQuantity` chỉ đếm PO đã
   `ORDERED` — PO đang soạn không tính, dòng sổ cái vẫn `QUOTING`/`WAITING_TO_PURCHASE` tuỳ đã có RFQ
   hay chưa.

## Related docs

- `docs/decisions/no-procurement.md` — vì sao domain này tồn tại, đảo ngược quyết định gì.
- `docs/domains/purchase-requests.md` — nguồn nhu cầu (`APPROVED`), không phải nơi domain này ghi vào.
- `docs/domains/inventory.md` — nơi phiếu nhập tiêu thụ `purchase_order_items`, khối "Bốn số khác"
  (công thức tồn/nhu cầu dùng chung).
- `docs/domains/partners.md` — nơi `suppliers` sống.
