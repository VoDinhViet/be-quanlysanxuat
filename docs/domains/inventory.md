# Inventory (Kho)

## Purpose

Theo dõi tồn kho vật lý theo từng kho (`warehouses`), qua phiếu nhập/phiếu xuất có vòng đời và một
sổ cái ghi mọi biến động. Đảo ngược quyết định cũ "không lưu tồn ở đâu cả" — xem
`docs/decisions/stored-inventory-balances.md`.

## Core concepts

**Ba tầng, ba vai trò khác nhau:**

```
inventory_receipts / inventory_issues   — phiếu, có vòng đời DRAFT/POSTED/CANCELLED
inventory_transactions                  — sổ cái, append-only, nguồn sự thật
inventory_balances                      — tồn hiện tại, một dòng/(kho × mặt hàng), bản chiếu của sổ cái
```

`inventory_balances` **dựng lại được 100%** từ `inventory_transactions` — cộng dồn mọi bút toán
theo `(warehouseId, itemId)`. Bảng tồn không phải nguồn sự thật độc lập, chỉ là cache có thể build
lại.

**Chỉ `POSTED` mới đụng tồn kho.** Phiếu tạo ra luôn ở `DRAFT` — sửa/xoá tự do, không ảnh hưởng
`inventory_balances`/`inventory_transactions`. `POST .../post` mới sinh bút toán và cập nhật tồn;
sau đó phiếu **bất biến** (không sửa/xoá). Sai thì `cancel` (đảo bút toán) rồi lập phiếu mới.

**Phiếu nhập và phiếu xuất là hai bảng riêng**, không gộp qua một cột `type` như thiết kế cũ:

```
inventory_receipts  ── receiptType: PURCHASE | PRODUCTION | RETURN | ADJUSTMENT
inventory_issues    ── issueType:   PRODUCTION | SALES     | RETURN | ADJUSTMENT
```

Mỗi loại phiếu ánh xạ sang đúng một loại bút toán khi `post`:

| Phiếu | `receiptType`/`issueType` | Bút toán (`inventory_transactions.type`) |
| --- | --- | --- |
| Nhập | `PURCHASE`, `RETURN` | `RECEIPT` |
| Nhập | `PRODUCTION` | `PRODUCTION_IN` |
| Nhập | `ADJUSTMENT` | `ADJUSTMENT_IN` |
| Xuất | `SALES`, `RETURN` | `ISSUE` |
| Xuất | `PRODUCTION` | `PRODUCTION_OUT` |
| Xuất | `ADJUSTMENT` | `ADJUSTMENT_OUT` |

Gộp `PURCHASE`/`RETURN` vào cùng bút toán `RECEIPT` không mất thông tin — bút toán luôn giữ
`referenceId` trỏ về phiếu, và phiếu giữ đúng loại gốc. `TRANSFER_IN`/`TRANSFER_OUT` có trong enum
bút toán làm chỗ cắm cho chuyển kho, **chưa route nào phát ra** — không có phiếu chuyển kho ở giai
đoạn này.

`supplier_returns` (trả NCC) không có `type` phân loại riêng, và **không thêm bút toán mới cho từng
loại** — ánh xạ thẳng sang `ISSUE` (xuất) đã có sẵn, phân biệt nguồn qua
`inventory_transactions.referenceType = SUPPLIER_RETURN`. `outsourcing_orders`/`outsourcing_receipts`
(gia công ngoài) **không còn ghi bút toán nào nữa** — `OUTSOURCING_ORDER`/`OUTSOURCING_RECEIPT` vẫn
còn trong `referenceType` (pgEnum dùng chung, gỡ phải migrate) nhưng không nguồn nào phát sinh giá
trị mới, xem "Gia công ngoài" ở Entities và `docs/decisions/wip-not-stocked.md`.

**Mặt hàng là `items`, một bảng chung cho FG/WIP/RM — nhưng kho chỉ thật sự quản tồn FG/RM.**
`docs/decisions/wip-not-stocked.md`: bán thành phẩm (WIP) không có nguồn nào ghi
`inventory_balances`/`inventory_transactions`, tồn WIP luôn bằng 0. Mọi bảng đụng tới mặt hàng
(`inventory_receipt_items`, `inventory_issue_items`, `inventory_transactions`, `inventory_balances`)
chỉ mang một `itemId` NOT NULL — không còn discriminator, không còn CHECK "đúng một trong hai FK
khớp `itemType`" (xem `docs/decisions/items-merge.md`). Loại mặt hàng (FG/WIP/RM) suy từ join sang
`items.type` khi cần lọc — `GetInventoryReqDto`/`GetInventoryBalancesReqDto` bỏ trống `itemType` mặc
định lọc còn FG/RM (gửi tường minh `itemType=WIP` vẫn xem được, luôn rỗng);
`GetInventoryTransactionsReqDto` không đổi, bỏ trống vẫn trả cả ba loại. Service lọc bằng subquery
`inArray` trên `items`, không phải một cột thật trên các bảng kho.

**Loại kho không ràng buộc cứng loại hàng.** `warehouses.type` (`RM`/`FG`/`WIP`)
là nhãn phân loại/lọc — quyết định nghiệp vụ, không phải constraint kỹ thuật. Một kho `RM`
vẫn nhận được thành phẩm nếu người dùng chủ động lập phiếu như vậy.

**Bốn field trên `GET /inventory`, một công thức chung cho mọi loại item** (FG/WIP/RM — route này
không còn tách theo `type`, xem đoạn "Danh sách tồn kho" bên dưới). `bomDemand` ở đây là placeholder
`0`, **khác** `bomDemand` thật (từ `production_job_materials`) ở "Bốn số khác" ngay dưới đây — hai
field cùng tên nhưng hai nguồn số khác nhau, đừng nhầm:

```
onHand    = SUM(inventory_balances.quantity) gộp mọi kho          (thực tế đang có)
reserved  = phần chưa giao của các dòng đơn đã duyệt (đã hứa với khách)
bomDemand = 0 ở giai đoạn này — chỗ cắm sẵn cho lúc nổ BOM đa cấp
available = onHand − reserved − bomDemand                          (còn dùng được)
```

`reserved` chỉ tính đơn **đã được Giám đốc duyệt** (`AWAITING_PRODUCTION`/`IN_PROGRESS`), nguồn
"đã giao" đọc từ `inventory_transactions` qua `orderItemId` (dòng bút toán âm trên phiếu xuất) thay
vì `stock_receipt_items` cũ. `order_items.itemId` chỉ trỏ FG, nên `reserved` trên thực tế luôn `0`
với dòng WIP/RM — không phải một if/else theo `itemType`, chỉ là hệ quả của join không khớp dòng
nào.

**`reservedQuantity` trên `inventory_balances` có cột nhưng chưa ai ghi** — luôn `0` ở giai đoạn
này. Giữ hàng thật (ghi vào cột này, đổi luôn chốt chặn `InventoryPostingService.applyLine` dùng
chung mọi module xuất/nhập) vẫn ngoài phạm vi — module `outbound-orders` (Giao hàng) **chưa tính
"giữ chỗ" ở đâu cả**, chờ thiết kế lại.

**Popup "chọn PO/Job cần giao" của `outbound-orders`** (`GET
/outbound-orders/unfulfilled-order-items`) hiện là một listing thuần: mọi dòng `order_items` của
đơn `AWAITING_PRODUCTION`/`IN_PROGRESS` chưa xoá mềm, dòng chưa `CANCELLED` — không lọc theo SL đã
giao, không tính tồn/giữ chỗ. **`create` không resolve/validate dòng phía server** — client gửi
thẳng `itemId`/`productionJobId` lấy từ popup này, `E188`/`E190`-`E193` đều dự phòng (không còn
throw site), không còn gì chặn SL/trạng thái đơn/khách hàng ở tầng `outbound-orders`.

**Bốn số khác trên dòng chi tiết phiếu nhập** (`GET /inventory-receipts/:receiptId`) và dòng chi
tiết đề xuất mua (`GET /purchase-requests/:purchaseRequestId`, `docs/domains/purchase-requests.md`),
dùng chung công thức ở `item-stock.query.ts`:

```
onHand    = SUM(inventory_balances.quantity) gộp mọi kho              (giống trên)
bomDemand = SUM(production_job_materials.requiredQty) của Job liên kết với
            phiếu/đề xuất, hoặc mọi Job của LSX nếu không có Job cụ thể
available = onHand − bomDemand                                        (cố ý có thể âm)
fromStock = min(onHand, bomDemand)                                     (phần tồn bị LSX này chiếm)
```

`fromStock` không lưu ở đâu — không có bảng giữ chỗ vật tư theo LSX, tính lại mỗi lần đọc. Khác
`reserved`/`available` của FG ở trên: `bomDemand` là nhu cầu của **một LSX/Job cụ thể**, không gộp
mọi LSX đang mở.

## Entities

| Entity | Vai trò |
| --- | --- |
| `warehouses` | Danh mục kho — `code`/`name`/`type`/`status`, không soft delete |
| `inventory_receipts` | Phiếu nhập — header, vòng đời 5 trạng thái (`DRAFT`/`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`/`CANCELLED`, xem Lifecycle); `purchaseOrderId` tuỳ chọn trỏ đơn mua (`docs/domains/purchasing.md`), validate PO phải `ORDERED` lúc tạo/sửa; `requiresIqc` quyết định nhánh `confirm` đi qua `PENDING_IQC` hay `PENDING_RECEIPT`; `productionJobId` **bắt buộc** khi `receiptType = PRODUCTION` (`E179`) — `confirm` chặn nếu Job chưa qua hết OQC (`E196`) hoặc SL các dòng vượt `production_jobs.quantity` (`E197`), xem "Gate nhập kho thành phẩm" bên dưới |
| `inventory_receipt_items` | Dòng phiếu nhập — `itemId` + `quantity` + `unitPrice` tuỳ chọn; `purchaseOrderItemId` tuỳ chọn, phải thuộc đúng `purchaseOrderId` của header; SL cộng dồn qua các phiếu đã `confirm` không được vượt SL đặt của dòng PO đó (`E154`) |
| `inventory_issues` | Phiếu xuất — header, cùng vòng đời |
| `inventory_issue_items` | Dòng phiếu xuất — cùng khuôn dòng nhập, thêm `orderItemId` tuỳ chọn |
| `inventory_transactions` | Sổ cái — append-only, nguồn sự thật, `quantity` có dấu |
| `inventory_balances` | Tồn hiện tại — một dòng/(kho × mặt hàng), dựng lại được từ sổ cái |
| `supplier_returns` | Phiếu trả NCC — bảng phẳng (1 phiếu = 1 dòng vật tư), tái dùng `status` của phiếu nhập/xuất (chỉ `DRAFT`/`POSTED`/`CANCELLED` — 2 giá trị `PENDING_*` không bao giờ xuất hiện ở bảng này); **tự sinh** (`DRAFT`) từ `IqcService.confirmIqc` khi QC chọn `disposition = SORT`/`RETURN` (`docs/domains/quality.md`), `iqcId` trỏ ngược lại lần IQC đó; `post` (kho xác nhận xuất trả) trừ tồn + hoàn tất luôn IQC liên kết — **chưa có `cancel`** (huỷ một phiếu đã `POSTED` cần đường "un-complete" IQC, để đợt sau) |
| `outsourcing_orders` | Phiếu gửi gia công ngoài (OS-OUT) — header + nhiều dòng (`outsourcing_order_items`), `status` là enum riêng `outsourcing_order_status` (chỉ `POSTED`/`CANCELLED`, tách khỏi `inventory_document_status` — không còn nháp nên không cần 5 giá trị, `docs/decisions/outsourcing-no-draft.md`), **không đụng `inventory_balances`** (`docs/decisions/wip-not-stocked.md`); mỗi dòng gắn `productionJobOperationId` — đây là chỗ nối vào luồng sản xuất, xem "Gia công ngoài" bên dưới |
| `outsourcing_order_items` | Dòng OS-OUT — `itemId`/`quantity` + snapshot công đoạn (`operationCode`/`operationName`, NOT NULL), client gửi thẳng từ popup, server không resolve/validate lại (`docs/decisions/outsourcing-no-draft.md`) + `weight`(kg)/`area`(m²) tuỳ chọn, **không** tham gia tính tồn |
| `outsourcing_receipts` | Phiếu nhận gia công ngoài (OS-IN) — header + nhiều dòng (`outsourcing_receipt_items`), cũng không còn nháp, cũng không đụng `inventory_balances`; mỗi dòng trỏ đúng 1 `outsourcingOrderItemId`, **cho phép gộp dòng từ nhiều OS-OUT khác nhau miễn cùng một NCC** (`supplierId` ở header, bất biến 1 phiếu = 1 NCC, `E187`); một dòng OS-OUT nhận được nhiều lần (partial); `requiresIqc` tuỳ chọn tự sinh N dòng `iqc_inspections` (1/dòng phiếu) lúc `create` |
| `outsourcing_receipt_items` | Dòng OS-IN — `outsourcingOrderItemId` trỏ đúng 1 dòng OS-OUT nguồn, `itemId` denormalize từ dòng đó; `weight`/`area` mặc định copy từ dòng OS-OUT, sửa được |
| `outbound_orders` | Phiếu giao hàng (DO) — header, `POST` tạo nháp + `GET` list/detail + `POST :id/confirm` (`DRAFT → PENDING_DELIVERY`, chặn `E205` nếu còn Job nào chưa qua hết OQC, xem "Giao hàng" bên dưới); chưa có duyệt/xác nhận giao thật/trừ tồn; `status` khai đủ 5 giá trị `DRAFT`/`PENDING_APPROVAL`/`PENDING_DELIVERY`/`DELIVERED`/`CANCELLED`; `clientId` bắt buộc, bất biến "1 phiếu = 1 khách hàng" |
| `outbound_order_items` | Dòng DO — `orderItemId` trỏ dòng PO nguồn (**không** unique, một dòng PO được chọn ở nhiều phiếu DO khác nhau qua nhiều lần giao), `itemId` denormalize, `productionJobId` snapshot Job hiển thị (tuỳ chọn, `set null`) |

`orderItemId` trên dòng phiếu xuất (và bút toán sinh ra từ nó) là **chỗ nối duy nhất sang Orders** —
vừa là cơ sở tính `reserved`, vừa chính là delivery tracking mà Orders chưa có. Chỉ hợp lệ trên dòng
mà `itemId` trỏ tới một item `type = FG` (service-enforced, `InventoryIssuesService.ensureItemsValid`).

`outbound_order_items.orderItemId` là **một chỗ nối sang Orders khác, độc lập** với chỗ nối trên —
dùng cho popup chọn PO/Job, **không** phải bút toán và **không** đụng
`inventory_transactions`/`inventory_balances`. Phase sau, lúc DO có bước "Xác nhận giao", mới tự sinh
1 `inventory_issues` (`issueType = SALES`) và post nó — khi đó dòng OS mới thật sự nối vào chỗ nối
đầu tiên (`inventory_issue_items.orderItemId`). Hai chỗ nối này cố tình tách rời ở phase 1.

## Lifecycle

Phiếu xuất (`inventory_issues`) giữ nguyên vòng đời 3 trạng thái, một chiều:

```
DRAFT ──post──> POSTED ──cancel──> CANCELLED
DRAFT ──cancel────────────────────> CANCELLED
```

`post` với `issueType = PRODUCTION` chạy thêm gate IQC (`E203`) trước khi sinh bút toán — xem "Gate
xuất kho sản xuất" bên dưới.

Phiếu nhập (`inventory_receipts`) có thêm bước `confirm` xen giữa lập phiếu và `post`. Hai trạng
thái `PENDING_IQC`/`PENDING_RECEIPT` nằm chung enum `inventory_document_status` với phiếu xuất/
`supplier_returns` nhưng **chỉ phiếu nhập phát ra** — hai bảng còn lại không bao giờ mang hai giá
trị này. Không tách enum riêng cho phiếu nhập vì `inventory_document_status` đang được **3 bảng**
dùng chung (`inventory_receipts`, `inventory_issues`, `supplier_returns`) — đổi kiểu cột nghĩa là
migrate cả 3 bảng, trong khi chỉ một bảng cần 2 giá trị mới; đánh đổi (không tách enum) đã cân nhắc
và chọn khi thêm `confirm`, xem `docs/workflows/receipt-confirmation.md`. `outsourcing_orders`/
`outsourcing_receipts` **không còn dùng chung enum này** — đã tách riêng
`outsourcing_order_status`/`outsourcing_receipt_status` (2 giá trị `POSTED`/`CANCELLED`), xem mục
"Gia công ngoài" bên dưới và `docs/decisions/outsourcing-no-draft.md`:

```
DRAFT ──confirm (requiresIqc=false)──> PENDING_RECEIPT ──post──────────────────────> POSTED
DRAFT ──confirm (requiresIqc=true)───> PENDING_IQC ──post (mọi IQC đã COMPLETED)────> POSTED
{DRAFT, PENDING_IQC, PENDING_RECEIPT, POSTED} ──cancel──> CANCELLED
```

- `DRAFT`: sửa (replace-all items)/xoá tự do, không đụng tồn kho.
- `confirm` (`POST /inventory-receipts/:id/confirm`, chỉ phiếu nhập): `DRAFT → PENDING_RECEIPT`
  hoặc `DRAFT → PENDING_IQC` tuỳ cờ `requiresIqc`. Rỗng dòng thì chặn (`E151`). Khi
  `requiresIqc = true`, cùng transaction sinh một dòng `iqc_inspections` (`NOT_INSPECTED`) cho mỗi
  dòng phiếu — đường ghi tự động duy nhất vào `iqc_inspections`, xem `docs/domains/quality.md`.
  `supplierId` của các dòng IQC đó suy từ `receipt.supplierId ?? purchaseOrder.supplierId`; không
  suy ra được thì chặn (`E152`). Không đụng tồn kho, không sinh bút toán ở bước này. Nếu
  `receiptType = PRODUCTION`, cùng bước `confirm` còn chạy gate OQC (`E107`/`E196`/`E197`, xem "Gate
  nhập kho thành phẩm" bên dưới) — chốt ở đây, không phải ở `post`.
- `post`: sinh bút toán + cập nhật `inventory_balances` trong cùng transaction, sau đó phiếu
  **bất biến** — không `PATCH`/`DELETE`.
  - Phiếu xuất: vẫn nhận thẳng từ `DRAFT` như trước.
  - Phiếu nhập: **không còn nhận thẳng từ `DRAFT`** (khác thiết kế cũ) — chỉ nhận từ
    `PENDING_RECEIPT`, hoặc từ `PENDING_IQC` khi **mọi** phiếu IQC gắn với phiếu nhập đó đã
    `COMPLETED`; thiếu điều kiện này (kể cả khi chưa có phiếu IQC nào) → `E153`.
- `cancel` từ `DRAFT`/`PENDING_IQC`/`PENDING_RECEIPT`: chỉ đổi `status`, không sinh bút toán (chưa
  từng post thì chưa có gì để đảo).
- `cancel` từ `POSTED`: sinh bút toán **đảo dấu** cho từng dòng đã post (append-only — không xoá
  bút toán cũ), trả `inventory_balances` về như trước khi post.

Không có đường `CANCELLED → *` cho bất kỳ trạng thái nào — huỷ là điểm cuối. Không có đường tự động
`PENDING_IQC → PENDING_RECEIPT` khi IQC xong — cổng kiểm nằm ở `post`, không phải một transition
riêng.

`supplier_returns` tái dùng cùng cột `status`/enum nhưng đi vòng đời **riêng, đơn giản hơn** —
không bao giờ ở `PENDING_IQC`/`PENDING_RECEIPT` (2 giá trị đó chỉ phiếu nhập dùng):

```
(tự sinh, IqcService.confirmIqc) ──> DRAFT ──post──> POSTED
```

- Tự sinh **DRAFT**, không có route tạo tay — `SupplierReturnsService.createFromIqcDisposition`
  chạy trong transaction của `IqcService.confirmIqc` khi một dòng IQC chuyển `WAITING_RETURN`
  (`docs/domains/quality.md`). `warehouseId` suy từ phiếu nhập liên quan trước, PO liên quan sau
  (`receipt.warehouseId ?? purchaseOrder.receiptWarehouseId`); không suy được → `E163`, chặn cả
  việc `confirm` IQC. `quantity` = cả lô (`RETURN`) hoặc phần NG đã tách (`SORT`, `sortNgQty`).
- **`post`** (`POST /supplier-returns/:id/post`, kho xác nhận đã thật sự xuất hàng): trừ tồn qua
  `InventoryPostingService` **chỉ khi** phiếu nhập gốc (nếu có) đã `POSTED` — xem "Bù trừ SL đã
  trả" ở Business rules. Cùng transaction, gọi `completeIqcAfterSupplierReturn` hoàn tất luôn dòng
  IQC liên kết (`WAITING_RETURN → COMPLETED`).
- **Chưa có `cancel`** — huỷ một phiếu đã `POSTED` cần đường "un-complete" IQC
  (`COMPLETED → WAITING_RETURN`), trong khi phiếu nhập gốc rất có thể đã `post` dựa trên đó rồi; để
  đợt sau. Xem `docs/workflows/supplier-return.md`.

**`outsourcing_orders`/`outsourcing_receipts` (gia công ngoài)** **không có bước nháp** — `create`
là `POSTED` ngay, có `cancel`, **không còn `PATCH`/`DELETE`** (đã xoá hẳn — 2 route đó chỉ chạy được
lúc còn `DRAFT`, mà `create` không bao giờ để lại `DRAFT` nữa; xem
`docs/decisions/outsourcing-no-draft.md`):

```
(tạo tay, POSTED ngay) ──cancel──> CANCELLED
```

**Không đụng `inventory_balances`/`inventory_transactions`** — mặt hàng gửi gia công ngoài luôn là
WIP, kho không quản tồn WIP (`docs/decisions/wip-not-stocked.md`). `create` chỉ ghi
`outsourcing_orders`/`outsourcing_order_items` (hoặc `outsourcing_receipts`/
`outsourcing_receipt_items`), không gọi `InventoryPostingService` ở bất kỳ đâu trong luồng này.

- `outsourcing_orders` (OS-OUT) tạo tay, header + nhiều dòng; mỗi dòng bắt buộc
  `productionJobOperationId` của một Job đang `IN_PROGRESS`, công đoạn snapshot `type = OUTSOURCE`
  — validate ở `create`, chạy trước khi mở transaction, không kiểm lại trong transaction, không
  phải DB CHECK. `cancel` từ `POSTED` chặn (`E169`) nếu còn `outsourcing_receipts` nào chưa
  `CANCELLED` trỏ tới bất kỳ dòng nào của phiếu — phải huỷ hết OS-IN con trước.
- `outsourcing_receipts` (OS-IN) tạo tay, header + nhiều dòng; mỗi dòng trỏ đúng 1 dòng OS-OUT
  thuộc phiếu đã `POSTED`, **mọi dòng OS-OUT được chọn phải cùng NCC với header** (`E187`) — cho
  phép gộp nhiều OS-OUT khác nhau vào một OS-IN, miễn cùng một NCC. **Một dòng OS-OUT nhận được
  nhiều lần** (partial) — SL cộng dồn theo `outsourcingOrderItemId` không được vượt SL gửi của dòng
  đó (`E172`, validate trước khi mở transaction, chỉ tính `POSTED`). Nếu `requiresIqc = true` thì
  sau đó sinh **N** dòng `iqc_inspections` (`NOT_INSPECTED`,
  1 dòng IQC / 1 dòng phiếu) — **khác** phiếu nhập mua, IQC ở đây **không** gate `create` (hàng đã
  về nhà máy vật lý ngay khi lập OS-IN, không phải chờ IQC mới ghi nhận). `cancel` từ `POSTED` chặn
  (`E173`) nếu đã có dòng `iqc_inspections` trỏ vào — cùng lý do `supplier_returns` chưa có `cancel`.

Xem `docs/workflows/outsourcing-round-trip.md`.

**Gate nhập kho thành phẩm (OQC)** — `inventory_receipts` với `receiptType = PRODUCTION` là phiếu
chịu thêm 3 kiểm tra tại `confirm` (không phải `post`), cùng chỗ `E154` đã chạy:

1. `productionJobId` **bắt buộc** (`E179`) — không còn tuỳ chọn-không-ép như trước; và mọi dòng
   phiếu phải có `itemId = job.itemId` (`E107`, tái dùng — cùng ngữ nghĩa `inventory_issues` dùng
   cho `orderItemId` lệch item).
2. Job phải có ≥1 phiếu OQC, và không còn phiếu nào chưa `COMPLETED` — vượt thì `E196`
   (`getJobOqcClearance`, `src/api/oqc/oqc.query.ts`). **Không còn so số lượng** như thiết kế cũ
   (`E180`, khai tử) — OQC giờ ở đơn vị part theo công đoạn (`docs/domains/quality.md`), so trực
   tiếp với SL nhập kho (đơn vị FG) là sai đơn vị; xem `docs/decisions/oqc-per-operation.md`.
3. Tổng `quantity` các dòng phiếu này, cộng dồn mọi phiếu `PRODUCTION` khác đã `confirm`
   (`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`) cùng `productionJobId`, không được vượt
   `production_jobs.quantity` (SL kế hoạch) — vượt thì `E197`.

**Gate xuất kho sản xuất (IQC)** — `inventory_issues` với `issueType = PRODUCTION` chịu 1 kiểm tra
tại `post` (không phải `create`, vì `post` mới là lúc hàng thật rời kho): còn ≥1 phiếu IQC chưa
`COMPLETED` của cùng `(itemId, warehouseId)` với dòng đang xuất → `E203`
(`hasPendingIqcForItems`, `src/api/iqc/iqc.query.ts`). Suy kho qua `inventoryReceipt.warehouseId` —
IQC không suy được kho (tạo tay/từ OS-IN) thì bỏ qua, không chặn.

Lý do gốc từng cho rằng gate này thừa ("hàng NG chưa từng vào tồn, `E153` đã chặn từ đầu vào")
**không còn đúng hoàn toàn** — 3 lỗ hổng thật đã xác minh: phiếu `requiresIqc = false` không qua
`E153`; IQC tạo tay hậu kiểm trên hàng đã vào tồn; IQC từ OS-IN không gate `create`. Xem
`docs/decisions/qc-gates-on-stock-moves.md`. Xem `docs/domains/quality.md`,
`docs/workflows/final-qc.md`, `docs/workflows/stock-movement.md`.

## Business rules

- `code` bất biến, unique toàn bảng, sinh theo năm: `PNK-{năm}-{đếm trong năm + 1, pad 5}` (nhập),
  `PXK-{năm}-{...}` (xuất), `PTNCC-{năm}-{...}` (trả NCC).
- **`shouldPostStock` bỏ qua trừ tồn ở 2 ca, còn lại luôn trừ** (`postSupplierReturn`):
  1. **Bù trừ SL đã trả trước khi ghi bút toán `RECEIPT`**: một IQC `FAIL` chạy **trước** khi phiếu
     nhập gốc `post` (cổng IQC nằm ở `confirm`, xem Lifecycle), nên tại thời điểm `disposition` ra
     `SORT`/`RETURN`, hàng chưa từng thật sự vào `inventory_balances` — nếu `postSupplierReturn` cứ
     trừ tồn ngay thì trừ vào tồn chưa từng có (`E106` giả, hoặc tệ hơn là trừ nhầm tồn của lô khác).
     Giải: `postSupplierReturn` chỉ trừ tồn khi phiếu nhập gốc đã `POSTED`; ngược lại bỏ qua — phiếu
     trả tự nó không tạo bút toán, chỉ là chứng từ + liên kết `iqcId`. Bù lại, `postInventoryReceipt`
     tự trừ SL đã trả **`POSTED`** khỏi từng dòng trước khi ghi `RECEIPT`
     (`buildReceiptPostingLines`/`getReturnedQuantityByReceiptItemId`) — dòng bị bù về 0 thì bỏ hẳn
     khỏi bút toán. Đúng đắn vì trình tự bị ép buộc: phiếu nhập chỉ `post` được sau khi **mọi** IQC
     liên quan `COMPLETED`, và một IQC `WAITING_RETURN` chỉ `COMPLETED` sau khi phiếu trả của nó đã
     `POSTED` — nên tại thời điểm `postInventoryReceipt` chạy, mọi phiếu trả liên quan chắc chắn đã
     `POSTED`, hàm bù trừ luôn thấy đúng số. Xem `docs/workflows/supplier-return.md`.
  2. **Phiếu trả sinh từ IQC của OS-IN** (`outsourcingReceiptId` có giá trị) — hàng gia công ngoài
     chưa từng vào tồn (`docs/decisions/wip-not-stocked.md`), trừ ra cũng ra âm giả. Không có phiếu
     nhập nào để "bù trừ" bù lại ở đây — phiếu trả này không có `inventoryReceiptId`, đơn giản là
     không bao giờ trừ tồn.
- **Chặn tồn âm ở tầng DB**: CHECK `chk_inventory_balances_quantity_non_negative`
  (`quantity >= 0`), không chỉ kiểm ở service. `post` khoá đúng dòng balance bằng
  `SELECT … FOR UPDATE` trong transaction trước khi cộng/trừ — hai phiếu xuất post song song cùng
  một mặt hàng không còn race, khác giới hạn đã biết ở thiết kế cũ.
- Dấu bút toán luôn khớp `type`: CHECK `chk_inventory_transactions_quantity_sign` — `RECEIPT`/
  `TRANSFER_IN`/`PRODUCTION_IN`/`ADJUSTMENT_IN` dương, còn lại âm. Dòng phiếu (`quantity` trên
  `inventory_receipt_items`/`inventory_issue_items`) luôn dương — dấu chỉ xuất hiện ở bút toán,
  không ở dòng phiếu.
- `items` trên `PATCH` phiếu `DRAFT` là **replace-all**.
- Danh sách tồn kho (`GET /inventory`, một route cho mọi loại item, lọc tuỳ chọn qua `itemType`)
  chạy trên **danh mục**, không phải trên phiếu — một sản phẩm chưa từng nhập kho vẫn hiện với
  `onHand: 0`. Bỏ trống `itemType` trả FG/RM (kho không quản tồn WIP,
  `docs/decisions/wip-not-stocked.md`) — gửi tường minh `itemType=WIP` vẫn xem được, luôn `onHand:
  0`. `GET /inventory/balances` cùng quy tắc; `GET /inventory/transactions` **không đổi**, bỏ trống
  vẫn trả cả ba loại.
- `asOfDate` của `GET /inventory` không đọc `inventory_balances` được (bảng đó là tồn **hiện tại**)
  — nhánh này cộng lại từ `inventory_transactions` với `transactionDate <= asOfDate`, đúng cách
  phiếu cũ từng làm.
- **Chặn nhận vượt SL đặt ở tầng dòng PO** (`E154`) — tính lúc `create`/`update`/`confirm` phiếu
  nhập: `Σ quantity` mọi dòng phiếu nhập đã `confirm` (`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`,
  không tính `DRAFT`/`CANCELLED`) trỏ cùng một `purchaseOrderItemId`, cộng SL của payload đang xét,
  không được vượt `purchaseOrderItems.quantity` của dòng đó. Đảo ngược quyết định cũ "không chặn" —
  xem Common mistakes.
- **Chặn nhận vượt SL gửi ở dòng OS-OUT** (`E172`) — cùng ý tưởng với `E154` nhưng khác cặp bảng:
  `Σ quantity` mọi dòng OS-IN `POSTED` trỏ cùng một `outsourcingOrderItemId` không được vượt
  `outsourcing_order_items.quantity` của dòng đó. Kiểm một lần, **trước** khi mở transaction `create`
  OS-IN — không kiểm lại trong transaction (`docs/decisions/outsourcing-no-draft.md`).
- **OS-OUT không còn chặn gửi vượt định mức Job ở tầng server** (`E184` dự phòng) — dòng do client
  gửi thẳng từ popup `GET .../outsourceable-operations` (đã trả `plannedQuantity`/`sentQuantity`/
  `remainingQuantity`), server chỉ `INSERT` — không tự resolve/validate lại
  (`docs/decisions/outsourcing-no-draft.md`). Khác OS-IN: `E172` (chặn nhận vượt SL gửi) **vẫn**
  chạy phía server, hai module cố tình lệch nhau sau đợt đổi này.
- **Trọng lượng (`weight`, kg) và diện tích (`area`, m²) trên dòng OS-OUT/OS-IN không tham gia tính
  tồn kho hay bất kỳ validate nào** — thuần là số hiển thị/in phiếu, phục vụ cách một số NCC tính
  phí gia công theo kg/m² thay vì theo số lượng.
- **Bất biến "1 phiếu OS-IN = 1 NCC"** (`E187`) — mọi dòng OS-OUT được chọn vào một OS-IN phải cùng
  `supplierId` với header OS-IN đó. Cho phép gộp nhiều phiếu OS-OUT (kể cả khác đợt gửi) miễn cùng
  một NCC; khác NCC thì phải tách thành 2 phiếu OS-IN riêng.
- **Không ép NCC của OS-OUT phải thuộc nhóm "Gia công" (`supplier_groups.code = 'GC'`)** — nhóm đó
  chỉ là gợi ý lọc dropdown ở FE, backend nhận bất kỳ `supplierId` hợp lệ nào, cùng cách `items.
  supplierId` không ép nhóm.
- **Tiến độ OS-OUT/OS-IN tính lúc đọc, không lưu cột** — cùng khuôn `PurchaseOrderProgress`
  (`docs/domains/purchasing.md`): `DRAFT`/`CANCELLED` đọc thẳng `status` (`DRAFT` giờ chỉ còn khớp
  dữ liệu cũ trước khi bỏ nháp — không route nào tạo `DRAFT` nữa, nhưng nhánh này vẫn giữ lại, xem
  `docs/decisions/outsourcing-no-draft.md`); còn lại suy từ SL đã nhận (`Σ` OS-IN `POSTED`) so với
  SL gửi và (nếu `requiresIqc`) trạng thái các dòng IQC liên quan — `SENT` (0 đã nhận), `PARTIAL`
  (đã nhận một phần), `WAITING_QC` (đã nhận đủ nhưng còn IQC chưa `COMPLETED`), `COMPLETED` (đã
  nhận đủ, IQC xong hoặc không yêu cầu IQC).

## Invariants

- Mỗi dòng `inventory_balances`/bút toán/dòng phiếu mang một `itemId` NOT NULL (FK `restrict` tới
  `items`).
- `inventory_balances.quantity` không bao giờ âm (DB CHECK) — không thao tác nào qua API làm tồn
  một mặt hàng xuống dưới 0.
- Phiếu `POSTED` không sửa/xoá được qua API.
- Mọi dòng `quantity` trên dòng phiếu đều dương (DB CHECK); dấu chỉ nằm ở bút toán.

Không phải invariant dù dễ tưởng:

- **DB không ràng buộc loại kho ↔ loại hàng** — `warehouses.type` chỉ là nhãn (xem Core concepts),
  không phải một ràng buộc bị thiếu, là quyết định nghiệp vụ.
- **`reservedQuantity` trên `inventory_balances` luôn bằng 0** — cột có sẵn, chưa route nào ghi.
- **`bomDemand` trên `GET /inventory` luôn bằng 0, mọi loại item** — chưa nổ BOM đa cấp; khác
  `reserved` (tính thật, xem "Bốn field" ở Core concepts). Dòng chi tiết phiếu nhập/đề xuất mua
  (khối "Bốn số khác" ở Core concepts) tính `bomDemand` thật từ `production_job_materials` — không
  cùng công thức.
- **`SHORTAGE` trên `GET /inventory` không còn "chưa bao giờ xuất hiện thực tế"** như bản RM cũ —
  giờ có thể thật sự xảy ra ở dòng FG nếu `reserved > onHand` (đơn đã duyệt giữ chỗ nhiều hơn tồn
  thực tế), vì `available` trừ cả `reserved` chứ không chỉ `bomDemand`.

## Cross-domain dependencies

- **← Orders**: dòng đơn của đơn **đã duyệt** tạo ra `reserved`. Một chiều — Inventory đọc Orders,
  không ghi ngược.
- **→ Orders**: `OrdersService.getOrderItems` đọc thẳng `inventory_transactions` (lọc
  `orderItemId IS NOT NULL`, `src/api/orders/orders.query.ts`) để tính `issuedQty`/`remainingQty` —
  đọc thẳng bảng, không qua `InventoryModule`/DI, cùng tiền lệ
  `hasPendingIqcForItems`/`getJobOqcClearance`.
- **← Production**: chỉ đọc, qua `getStockLevels(excludeOrderId)`/`getMaterialStockLevels`.
  Production hiện **không** tự động lập phiếu kho — auto-post là feature ngoài phạm vi đợt này
  (`docs/decisions/stored-inventory-balances.md`). Phiếu vẫn có cột liên kết
  `productionOrderId`/`productionJobId` cho người dùng gắn thủ công — `productionJobId` trên
  `inventory_receipts` **bắt buộc** khi `receiptType = PRODUCTION` (khác `productionOrderId`, vẫn
  tuỳ chọn; khác `inventory_issues.productionJobId`, vẫn tuỳ chọn cho mọi `issueType`).
- **← Production (Gia công ngoài)**: mỗi dòng `outsourcing_order_items` mang snapshot
  `productionJobId`/`itemId`/`operationCode`/`operationName` do client gửi từ popup `GET
  .../outsourceable-operations` (đọc `production_job_operations`/`resolvePlannedQuantities`,
  `docs/domains/production.md`) — server không tự đọc lại `production_job_operations`/
  `production_jobs` lúc `create` (`docs/decisions/outsourcing-no-draft.md`). Một chiều — không ghi
  ngược vào `production_job_operations`/`production_jobs`, đợt này **không** có gating/block tiến độ
  Job hay công đoạn kế tiếp theo trạng thái OS-OUT/OS-IN.
- **→ Purchase Requests**: `inventory_receipts.purchaseRequestId` liên kết tuỳ chọn tới đề xuất mua
  đã sinh ra nhu cầu nhập — không đảo ngược `docs/decisions/no-procurement.md`.
- **→ Purchasing**: `inventory_receipts.purchaseOrderId` +
  `inventory_receipt_items.purchaseOrderItemId` liên kết tuỳ chọn tới đơn mua — validate mức cơ bản
  lúc tạo/sửa (PO phải `ORDERED`, dòng phải thuộc đúng PO) **và** chặn nhận vượt SL đặt (`E154`, xem
  Business rules) — vẫn không validate NCC/vật tư khớp 3 chiều. `purchase-orders`/`purchase-ledger`
  đọc lại hai cột này để tính tiến độ nhận hàng (`docs/domains/purchasing.md`); `GET
  /purchase-orders/:id` còn trả `receivedQuantity` theo dòng, tính từ cùng nguồn.
- **→ Quality**: `POST /inventory-receipts/:id/confirm` với `requiresIqc = true` gọi
  `IqcService.createInspectionsFromReceipt(tx, ...)` trong cùng transaction — đường ghi tự động duy
  nhất vào `iqc_inspections`, và `post` phiếu nhập đọc lại `status` các dòng IQC đó để quyết định
  cho ghi tồn hay không (`E153`). Xem `docs/domains/quality.md`.
- **← Quality (Gate xuất kho sản xuất)**: `InventoryIssuesService.postInventoryIssue`
  (`issueType = PRODUCTION`) đọc `hasPendingIqcForItems` (plain function,
  `src/api/iqc/iqc.query.ts`, không qua DI) để chặn (`E203`) xuất vật tư chưa qua IQC — xem "Gate
  xuất kho sản xuất" ở Lifecycle, `docs/decisions/qc-gates-on-stock-moves.md`.
- **→ Purchasing / Suppliers**: `supplier_returns.purchaseOrderId`/`supplierId` liên kết tuỳ chọn/bắt
  buộc tới đơn mua/NCC gốc — thuần để trace, không đọc ngược (chưa có logic gì đọc lại các cột này).
- **↔ Quality**: `supplier_returns` **tự sinh** từ `IqcService.confirmIqc` khi một dòng IQC chuyển
  `WAITING_RETURN` (`SupplierReturnsService.createFromIqcDisposition`, cùng transaction) — chiều
  ngược lại, `SupplierReturnsService.postSupplierReturn` gọi `completeIqcAfterSupplierReturn`
  (plain function, không qua DI — `IqcModule` đã import `SupplierReturnsModule` nên chiều ngược lại
  không thể đi qua DI mà không tạo vòng lặp module) hoàn tất dòng IQC đó. `iqc_inspections.
  inventoryReceiptId` là chiều trace riêng, tuỳ chọn. Xem `docs/domains/quality.md`,
  `docs/workflows/supplier-return.md`.
- **→ Quality (Gia công ngoài)**: `POST /outsourcing-receipts` với `requiresIqc = true` gọi
  `IqcService.createInspectionsFromOutsourcingReceipt(tx, ...)` cùng transaction — sinh **1 dòng
  `iqc_inspections` cho mỗi dòng phiếu OS-IN** (khác trước khi còn là phiếu phẳng, lúc đó luôn đúng
  1 dòng), đường tạo thứ ba vào `iqc_inspections` (`docs/domains/quality.md`). **Khác** phiếu nhập
  mua: IQC ở đây **không** gate `create` — cổng IQC (`E153`) chỉ tồn tại ở `inventory_receipts`,
  `outsourcing_receipts` luôn `POSTED` ngay lúc tạo, sinh IQC xong vẫn `POSTED`, và **không đụng
  `inventory_balances` ở bất kỳ bước nào** (`docs/decisions/wip-not-stocked.md`). Nếu QC sau đó FAIL
  + `SORT`/`RETURN`, dòng `supplier_returns` tự sinh có cả `inventoryReceiptId = null` lẫn
  `outsourcingReceiptId` khác null — `shouldPostStock` trả **`false`**: hàng OS-IN chưa từng vào tồn
  nên phiếu trả không trừ tồn, cùng lý do case "chưa từng vào tồn" của IQC-trên-phiếu-nhập-mua, chỉ
  khác là ở đây không có phiếu nhập nào để bù trừ ngược lại.
- **← Quality (OQC, gate nhập kho TP)**: `confirmInventoryReceipt` đọc `getJobOqcClearance` (plain
  function, `src/api/oqc/oqc.query.ts`, không qua DI — `InventoryReceiptsModule` không import
  `OqcModule`) để chặn (`E196`/`E197`) nhận khi Job chưa qua hết OQC/vượt SL kế hoạch. Một chiều —
  Inventory đọc `oqc_inspections`, không ghi ngược; OQC cũng không biết `inventory_receipts` có tồn
  tại. Xem "Gate nhập kho thành phẩm" ở Lifecycle, `docs/domains/quality.md`.
- **← Quality (OQC, gate giao hàng)**: `OutboundOrdersService.confirmOutboundOrder` cũng đọc
  `getJobOqcClearance` (tái dùng nguyên hàm trên) để chặn (`E205`) xác nhận DO khi còn Job nào chưa
  qua hết OQC — `outbound-orders` không import `OqcModule`. Xem "Giao hàng" bên dưới.
- **← Product Structure**: `GET /inventory` chỉ thấy item `ACTIVE` + chưa xoá mềm, mặc định lọc
  FG/RM khi bỏ trống `itemType` (`docs/decisions/wip-not-stocked.md`) — gửi tường minh `itemType=WIP`
  vẫn xem được (luôn `onHand: 0`), dù `minStock`/`supplierId` trên dòng WIP luôn `0`/`null` (chỉ RM
  dùng, xem `docs/decisions/items-merge.md`).
- **← Suppliers**: filter `supplierId` trên `GET /inventory` lọc theo NCC chính (`items.supplierId`)
  — chỉ có ý nghĩa với dòng RM, FG/WIP luôn `supplierId = null` nên filter này tự nhiên rỗng với
  chúng. `inventory_receipts.supplierId` liên kết tuỳ chọn NCC đã giao hàng, khái niệm khác.

## Common mistakes

1. **Đi tìm cột tồn kho để cập nhật trực tiếp.** Không có route nào ghi thẳng `inventory_balances`
   — muốn đổi tồn thì lập phiếu rồi `post`.
2. **Tưởng phiếu `DRAFT` đã đụng tồn kho.** Chỉ `post` mới sinh bút toán/cập nhật balance.
3. **Tưởng sửa/xoá được phiếu đã `POSTED`.** Bất biến — `cancel` rồi lập phiếu mới.
4. **Dùng `available` của màn Kho khi tính cho một PO cụ thể.** Sẽ trừ nhu cầu của chính PO đó hai
   lần — phải truyền `excludeOrderId`.
5. **Gắn `orderItemId` vào dòng vật tư (RM).** Chỉ hợp lệ trên dòng mà `itemId` là FG, ở phiếu xuất.
6. **Tưởng loại kho ràng buộc loại hàng.** Không — `warehouses.type` chỉ là nhãn, kho `RM`
   vẫn nhận được thành phẩm nếu người dùng lập phiếu như vậy.
7. **Tưởng `reserved` trên `GET /inventory` luôn là 0 như bản RM cũ.** Không còn — giờ tính thật
   cho mọi loại item (chỉ tự nhiên ra 0 với WIP/RM vì đơn hàng chỉ trỏ FG). Vẫn đúng cho `bomDemand`:
   **chỗ cắm sẵn**, giá trị 0 là do phạm vi hiện tại (chưa nổ BOM), không phải bug.
8. **Tưởng sản xuất tự động lập phiếu.** Chưa — `startJob`/hoàn thành Job không sinh phiếu kho nào
   ở đợt này, dù cột liên kết đã có sẵn trên phiếu.
9. **Tưởng phiếu nhập `DRAFT` `post` thẳng được như trước.** Không còn — phải qua `confirm` trước
   (`DRAFT → PENDING_RECEIPT`/`PENDING_IQC`), `post` một phiếu nhập còn `DRAFT` ném `E098`. Phiếu
   xuất không đổi, vẫn `post` thẳng từ `DRAFT`.
10. **Tưởng nhận dư SL đặt của PO vẫn hợp lệ như trước.** Đã đảo ngược — `E154` chặn ở `create`/
    `update`/`confirm` phiếu nhập nếu tổng SL các phiếu đã `confirm` cho cùng một dòng PO vượt SL đặt
    dòng đó. Mua dư qua PO (đặt nhiều hơn đề xuất) vẫn hợp lệ như cũ — chỉ *nhận qua phiếu kho* vượt
    *SL đã đặt của PO* mới bị chặn.
11. **Tưởng IQC sinh ra thì phiếu nhập tự động `POSTED` khi IQC xong.** Không có transition tự động
    — IQC `COMPLETED` chỉ là điều kiện cho `post` chạy được, người dùng vẫn phải tự bấm `post`.
12. **Tưởng `supplier_returns` có route tạo tay.** Không — chỉ tự sinh từ `IqcService.confirmIqc`
    khi disposition SORT/RETURN. Không có `POST /supplier-returns`.
13. **Tưởng `postSupplierReturn` luôn trừ tồn.** Không — bỏ qua nếu phiếu nhập gốc chưa `POSTED`
    **hoặc** phiếu trả sinh từ IQC của OS-IN (xem "`shouldPostStock` bỏ qua trừ tồn ở 2 ca" ở
    Business rules); `postInventoryReceipt` mới là nơi bù trừ thật cho ca đầu.
14. **Tưởng `create` OS-IN bị chặn (gate) bởi IQC như phiếu nhập mua.** Sai — `outsourcing_receipts`
    không có trạng thái `PENDING_IQC` nào, IQC (nếu `requiresIqc = true`) sinh ra **sau** khi đã
    `POSTED` trong cùng transaction `create`, không phải điều kiện để tạo được.
15. **Tưởng NCC của OS-OUT phải thuộc nhóm "Gia công".** Không bị ép ở backend — nhóm `GC` chỉ là
    gợi ý lọc FE.
16. **Tưởng công đoạn `OUTSOURCE` tự chặn/gate tiến độ Job hay công đoạn kế tiếp.** Đợt này chưa có
    cơ chế đó — `production_job_operations.completedQuantity` vẫn nhập tay độc lập với OS-OUT/OS-IN,
    xem `docs/domains/production.md`.
17. **Tưởng `productionJobId` trên `inventory_receipts` vẫn tuỳ chọn như trước.** Không còn — bắt
    buộc khi `receiptType = PRODUCTION` (`E179`), đổi hành vi so với thiết kế ban đầu (cột này vốn
    chỉ để trace, không validate chéo với `receiptType`). `inventory_issues.productionJobId` **không
    đổi** — vẫn tuỳ chọn, đừng nhầm hai cột cùng tên khác quy tắc.
18. **Tưởng xuất kho sản xuất không gate theo IQC, hoặc "giao hàng" không gate theo OQC.** Không
    còn đúng — cả hai đã có: `inventory_issues` (`issueType = PRODUCTION`) chặn (`E203`) ở `post`
    nếu còn IQC chưa `COMPLETED` cùng `(item, kho)`; `POST /outbound-orders/:id/confirm` chặn
    (`E205`) nếu còn Job nào chưa qua hết OQC. Lý do gốc từng cho là thừa ("hàng NG chưa từng vào
    tồn") có 3 lỗ hổng thật — xem `docs/decisions/qc-gates-on-stock-moves.md`. `outbound-orders`
    vẫn chưa trừ tồn/chưa "giao thật" — xem #22.
19. **Tưởng `outsourcing_orders`/`outsourcing_receipts` vẫn là bảng phẳng 1 phiếu = 1 dòng.** Không
    còn — header + nhiều dòng (`outsourcing_order_items`/`outsourcing_receipt_items`), cùng khuôn
    `inventory_receipts`/`inventory_receipt_items`. `itemId`/`quantity` không còn trên header.
20. **Tưởng một OS-IN chỉ nhận được từ một OS-OUT.** Không còn đúng — một OS-IN gộp được nhiều dòng
    từ nhiều phiếu OS-OUT khác nhau, miễn cùng một NCC (`E187`).
21. **Tưởng `createOutsourcingOrder` vẫn chặn gửi vượt định mức Job.** Không còn — dòng do client
    gửi thẳng, server không resolve/validate lại (`E166`/`E167`/`E168`/`E184` dự phòng, không route
    nào ném); `E172` bên OS-IN (chặn nhận vượt SL gửi) không đổi, hai module cố tình lệch nhau.
22. **Tưởng tạo `outbound_orders` (DO) đã trừ tồn kho thành phẩm.** Không — `create` chỉ tạo nháp
    (`status` luôn `DRAFT`); `POST :id/confirm` (`DRAFT → PENDING_DELIVERY`, gate OQC `E205`) cũng
    **không** đụng tồn — chỉ đổi `status`. Không có duyệt, không có "Xác nhận giao thật", không đụng
    `inventory_balances`/`inventory_transactions` ở đâu cả. Trừ tồn là việc của phase sau: DO tự
    sinh 1 `inventory_issues` (`issueType = SALES`) rồi `post` nó — tái dùng nguyên
    `InventoryPostingService`, không phải một đường ghi bút toán mới.
23. **Tưởng `outsourcing_orders`/`outsourcing_receipts` có bước nháp thật như phiếu nhập/xuất.**
    Không còn — `create` là `POSTED` ngay, không có `PATCH`/`DELETE`/`post` riêng nữa. `status` cột
    dùng enum riêng (`outsourcing_order_status`/`outsourcing_receipt_status`, default `POSTED`) —
    `DRAFT` không còn là giá trị hợp lệ ở DB nữa, không chỉ là "không route nào ghi", xem
    `docs/decisions/outsourcing-no-draft.md`.
24. **Tưởng gia công ngoài trừ/cộng tồn kho.** Không — `create` OS-OUT/OS-IN không gọi
    `InventoryPostingService` ở đâu cả, `E106` không thể xảy ra ở hai route này nữa. Mặt hàng gửi
    gia công ngoài luôn là WIP, kho không quản tồn WIP — xem `docs/decisions/wip-not-stocked.md`.
25. **Tưởng `outbound-orders` có giữ chỗ (reserve) hoặc chặn theo tồn kho khả dụng kiểu ATP.**
    Từng có (một đợt code ngắn), đã gỡ lại. **Cập nhật: `create` giờ không còn resolve/validate
    dòng phía server ở bất kỳ mức nào** — dòng do client gửi thẳng `itemId`/`productionJobId` từ
    popup `unfulfilled-order-items`, không chỉ mất phần "giữ chỗ theo tồn" mà cả `quantity ≤
    order_items.quantity` (`E193`, giờ dự phòng) cũng không còn ai kiểm. Vì vậy **nhiều DO có thể
    lần lượt trỏ cùng một `orderItemId`, với `quantity` bất kỳ**, cộng dồn vượt xa SL PO, hoặc trỏ
    tới dòng PO đã huỷ/đơn sai khách hàng — client hoàn toàn chịu trách nhiệm dữ liệu gửi lên. Đây
    là giới hạn có chủ ý của phase này (đổi lấy bỏ round-trip DB, dữ liệu client đã có sẵn từ đúng
    popup), không phải bug.

## Related docs

- `docs/decisions/stored-inventory-balances.md` — vì sao tồn kho đổi từ tính-lại sang lưu trữ.
- `docs/workflows/stock-movement.md` — trình tự lập/post/cancel phiếu.
- `docs/workflows/supplier-return.md` — luồng đầy đủ từ IQC FAIL tới hoàn tất phiếu trả NCC.
- `docs/workflows/outsourcing-round-trip.md` — luồng OS-OUT → OS-IN → QC tuỳ chọn.
- `docs/workflows/final-qc.md` — luồng OQC → 2 gate nhập kho thành phẩm/giao hàng.
- `docs/decisions/oqc-per-operation.md` — vì sao gate nhập kho TP đổi từ so SL sang so trạng thái.
- `docs/decisions/qc-gates-on-stock-moves.md` — vì sao thêm gate IQC/OQC vào xuất kho/giao hàng.
- `docs/domains/orders.md` — nguồn của `reserved`.
- `docs/domains/production.md` — nơi tiêu thụ `onHand`/`reserved`.
- `docs/domains/quality.md` — IQC/OQC, nguồn `hasPendingIqcForItems`/`getJobOqcClearance`.
- `docs/domains/purchase-requests.md` — `purchaseRequestId` trên phiếu nhập.
