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

`supplier_returns` (trả NCC) và `outsourcing_orders`/`outsourcing_receipts` (gia công ngoài) không
có `type` phân loại riêng, và **không thêm bút toán mới cho từng loại** — cả ba ánh xạ thẳng sang
`ISSUE` (xuất)/`RECEIPT` (nhận) đã có sẵn, phân biệt nguồn qua `inventory_transactions.referenceType`
(`SUPPLIER_RETURN`/`OUTSOURCING_ORDER`/`OUTSOURCING_RECEIPT`) — xem "Gia công ngoài" ở Entities.

**Mặt hàng là `items`, một bảng chung cho FG/WIP/RM.** Mọi bảng đụng tới mặt hàng
(`inventory_receipt_items`, `inventory_issue_items`, `inventory_transactions`, `inventory_balances`)
chỉ mang một `itemId` NOT NULL — không còn discriminator, không còn CHECK "đúng một trong hai FK
khớp `itemType`" (xem `docs/decisions/items-merge.md`). Loại mặt hàng (FG/WIP/RM) suy từ join sang
`items.type` khi cần lọc — `GetInventoryBalancesReqDto`/`GetInventoryTransactionsReqDto` vẫn nhận
tham số `itemType` (nay kiểu `ItemType`), nhưng service lọc bằng subquery `inArray` trên `items`,
không phải một cột thật trên các bảng kho.

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
này. Giữ hàng thật là một feature riêng, đụng module `orders`, ngoài phạm vi đợt này.

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
| `inventory_receipts` | Phiếu nhập — header, vòng đời 5 trạng thái (`DRAFT`/`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`/`CANCELLED`, xem Lifecycle); `purchaseOrderId` tuỳ chọn trỏ đơn mua (`docs/domains/purchasing.md`), validate PO phải `ORDERED` lúc tạo/sửa; `requiresIqc` quyết định nhánh `confirm` đi qua `PENDING_IQC` hay `PENDING_RECEIPT`; `productionJobId` **bắt buộc** khi `receiptType = PRODUCTION` (`E179`) — `confirm` chặn (`E180`) nếu SL các dòng vượt tổng SL các phiếu OQC `COMPLETED` (PASS) của Job đó, xem "Gate nhập kho thành phẩm" bên dưới |
| `inventory_receipt_items` | Dòng phiếu nhập — `itemId` + `quantity` + `unitPrice` tuỳ chọn; `purchaseOrderItemId` tuỳ chọn, phải thuộc đúng `purchaseOrderId` của header; SL cộng dồn qua các phiếu đã `confirm` không được vượt SL đặt của dòng PO đó (`E154`) |
| `inventory_issues` | Phiếu xuất — header, cùng vòng đời |
| `inventory_issue_items` | Dòng phiếu xuất — cùng khuôn dòng nhập, thêm `orderItemId` tuỳ chọn |
| `inventory_transactions` | Sổ cái — append-only, nguồn sự thật, `quantity` có dấu |
| `inventory_balances` | Tồn hiện tại — một dòng/(kho × mặt hàng), dựng lại được từ sổ cái |
| `supplier_returns` | Phiếu trả NCC — bảng phẳng (1 phiếu = 1 dòng vật tư), tái dùng `status` của phiếu nhập/xuất (chỉ `DRAFT`/`POSTED`/`CANCELLED` — 2 giá trị `PENDING_*` không bao giờ xuất hiện ở bảng này); **tự sinh** (`DRAFT`) từ `IqcService.confirmIqc` khi QC chọn `disposition = SORT`/`RETURN` (`docs/domains/quality.md`), `iqcId` trỏ ngược lại lần IQC đó; `post` (kho xác nhận xuất trả) trừ tồn + hoàn tất luôn IQC liên kết — **chưa có `cancel`** (huỷ một phiếu đã `POSTED` cần đường "un-complete" IQC, để đợt sau) |
| `outsourcing_orders` | Phiếu gửi gia công ngoài (OS-OUT) — bảng phẳng (1 phiếu = 1 dòng vật tư), cùng khuôn `supplier_returns`, tái dùng `status` phiếu nhập/xuất (chỉ `DRAFT`/`POSTED`/`CANCELLED`); **bắt buộc** gắn `productionJobOperationId` (Job đang `IN_PROGRESS`, công đoạn snapshot `type = OUTSOURCE`) — đây là chỗ nối vào luồng sản xuất, xem "Gia công ngoài" bên dưới |
| `outsourcing_receipts` | Phiếu nhận gia công ngoài (OS-IN) — bảng phẳng, luôn trỏ đúng 1 `outsourcingOrderId`; một OS-OUT nhận được nhiều lần (partial); `requiresIqc` tuỳ chọn tự sinh 1 dòng `iqc_inspections` lúc `post` |

`orderItemId` trên dòng phiếu xuất (và bút toán sinh ra từ nó) là **chỗ nối duy nhất sang Orders** —
vừa là cơ sở tính `reserved`, vừa chính là delivery tracking mà Orders chưa có. Chỉ hợp lệ trên dòng
mà `itemId` trỏ tới một item `type = FG` (service-enforced, `InventoryIssuesService.ensureItemsValid`).

## Lifecycle

Phiếu xuất (`inventory_issues`) giữ nguyên vòng đời 3 trạng thái, một chiều:

```
DRAFT ──post──> POSTED ──cancel──> CANCELLED
DRAFT ──cancel────────────────────> CANCELLED
```

Phiếu nhập (`inventory_receipts`) có thêm bước `confirm` xen giữa lập phiếu và `post`. Hai trạng
thái `PENDING_IQC`/`PENDING_RECEIPT` nằm chung enum `inventory_document_status` với phiếu xuất/
`supplier_returns`/`outsourcing_orders`/`outsourcing_receipts` nhưng **chỉ phiếu nhập phát ra** —
bốn bảng còn lại không bao giờ mang hai giá trị này. Không tách enum riêng cho phiếu nhập vì
`inventory_document_status` đang được **5 bảng** dùng chung (`inventory_receipts`,
`inventory_issues`, `supplier_returns`, `outsourcing_orders`, `outsourcing_receipts`) — đổi kiểu
cột nghĩa là migrate cả 5 bảng, trong khi chỉ một bảng cần 2 giá trị mới; đánh đổi (không tách
enum) đã cân nhắc và chọn khi thêm `confirm`, xem `docs/workflows/receipt-confirmation.md`:

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
  `receiptType = PRODUCTION`, cùng bước `confirm` còn chạy gate OQC (`E107`/`E180`, xem "Gate nhập
  kho thành phẩm" bên dưới) — chốt ở đây, không phải ở `post`.
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

**`outsourcing_orders`/`outsourcing_receipts` (gia công ngoài)** cũng đi vòng đời đơn giản
`DRAFT → POSTED → CANCELLED`, nhưng **có route tạo tay** (khác `supplier_returns` — không tự sinh
từ đâu cả) và **có `cancel`** cho cả hai:

```
(tạo tay) ──> DRAFT ──post──> POSTED ──cancel──> CANCELLED
DRAFT ──cancel──────────────────────────────────> CANCELLED
```

- `outsourcing_orders` (OS-OUT) tạo tay, bắt buộc `productionJobOperationId` của một Job đang
  `IN_PROGRESS`, công đoạn snapshot `type = OUTSOURCE` — validate ở `create`, không phải DB CHECK.
  `post` trừ tồn kho gửi (`ISSUE`, âm). `cancel` từ `POSTED` chặn (`E169`) nếu còn
  `outsourcing_receipts` nào chưa `CANCELLED` trỏ vào — phải huỷ hết OS-IN con trước.
- `outsourcing_receipts` (OS-IN) tạo tay, bắt buộc trỏ đúng 1 OS-OUT đã `POSTED`; **một OS-OUT nhận
  được nhiều OS-IN** (partial) — SL cộng dồn các OS-IN `DRAFT`/`POSTED` không được vượt SL gửi của
  OS-OUT (`E172`, kiểm lại lần hai trong transaction `post`, chỉ tính `POSTED`). `post` cộng tồn kho
  nhận (`RECEIPT`, dương); nếu `requiresIqc = true` thì cùng transaction sinh 1 dòng `iqc_inspections`
  (`NOT_INSPECTED`) — **khác** phiếu nhập mua, IQC ở đây **không** gate `post` (hàng đã về nhà máy
  vật lý ngay khi lập OS-IN, không phải chờ IQC mới cho nhập kho). `cancel` từ `POSTED` chặn
  (`E173`) nếu đã có dòng `iqc_inspections` trỏ vào — cùng lý do `supplier_returns` chưa có `cancel`.

Xem `docs/workflows/outsourcing-round-trip.md`.

**Gate nhập kho thành phẩm (OQC)** — `inventory_receipts` với `receiptType = PRODUCTION` là phiếu
duy nhất chịu thêm 2 kiểm tra tại `confirm` (không phải `post`), cùng chỗ `E154` đã chạy:

1. `productionJobId` **bắt buộc** (`E179`) — không còn tuỳ chọn-không-ép như trước; và mọi dòng
   phiếu phải có `itemId = job.itemId` (`E107`, tái dùng — cùng ngữ nghĩa `inventory_issues` dùng
   cho `orderItemId` lệch item).
2. Tổng `quantity` các dòng phiếu này, cộng dồn mọi phiếu `PRODUCTION` khác đã `confirm`
   (`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`) cùng `productionJobId`, không được vượt tổng
   `quantity` các dòng `oqc_inspections` đã `COMPLETED` (PASS) của Job đó — vượt thì `E180`
   (`getPassedOqcQuantityByJobId`, `src/api/oqc/oqc.query.ts`).

Đây là chốt chặn nhập kho thành phẩm **duy nhất** theo kết quả QC trong toàn hệ thống — không có
gate tương ứng ở phiếu xuất kho sản xuất (đã chặn sẵn từ đầu vào qua `E153`, hàng NG chưa từng vào
tồn) hay ở một luồng "giao hàng" nào (không tồn tại — `OrderStatus` không có
`DELIVERING`/`DELIVERED`). Xem `docs/domains/quality.md`, `docs/workflows/final-qc.md`.

## Business rules

- `code` bất biến, unique toàn bảng, sinh theo năm: `PNK-{năm}-{đếm trong năm + 1, pad 5}` (nhập),
  `PXK-{năm}-{...}` (xuất), `PTNCC-{năm}-{...}` (trả NCC).
- **Bù trừ SL đã trả trước khi ghi bút toán `RECEIPT`**: một IQC `FAIL` chạy **trước** khi phiếu
  nhập gốc `post` (cổng IQC nằm ở `confirm`, xem Lifecycle), nên tại thời điểm `disposition` ra
  `SORT`/`RETURN`, hàng chưa từng thật sự vào `inventory_balances` — nếu `postSupplierReturn` cứ
  trừ tồn ngay thì trừ vào tồn chưa từng có (`E106` giả, hoặc tệ hơn là trừ nhầm tồn của lô khác).
  Giải: `postSupplierReturn` chỉ trừ tồn khi phiếu nhập gốc đã `POSTED` (`shouldPostStock`); ngược
  lại bỏ qua — phiếu trả tự nó không tạo bút toán, chỉ là chứng từ + liên kết `iqcId`. Bù lại,
  `postInventoryReceipt` tự trừ SL đã trả **`POSTED`** khỏi từng dòng trước khi ghi `RECEIPT`
  (`buildReceiptPostingLines`/`getReturnedQuantityByReceiptItemId`) — dòng bị bù về 0 thì bỏ hẳn
  khỏi bút toán. Đúng đắn vì trình tự bị ép buộc: phiếu nhập chỉ `post` được sau khi **mọi** IQC
  liên quan `COMPLETED`, và một IQC `WAITING_RETURN` chỉ `COMPLETED` sau khi phiếu trả của nó đã
  `POSTED` — nên tại thời điểm `postInventoryReceipt` chạy, mọi phiếu trả liên quan chắc chắn đã
  `POSTED`, hàm bù trừ luôn thấy đúng số. Xem `docs/workflows/supplier-return.md`.
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
  `onHand: 0`. Bỏ trống `itemType` trả cả FG lẫn WIP lẫn RM.
- `asOfDate` của `GET /inventory` không đọc `inventory_balances` được (bảng đó là tồn **hiện tại**)
  — nhánh này cộng lại từ `inventory_transactions` với `transactionDate <= asOfDate`, đúng cách
  phiếu cũ từng làm.
- **Chặn nhận vượt SL đặt ở tầng dòng PO** (`E154`) — tính lúc `create`/`update`/`confirm` phiếu
  nhập: `Σ quantity` mọi dòng phiếu nhập đã `confirm` (`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`,
  không tính `DRAFT`/`CANCELLED`) trỏ cùng một `purchaseOrderItemId`, cộng SL của payload đang xét,
  không được vượt `purchaseOrderItems.quantity` của dòng đó. Đảo ngược quyết định cũ "không chặn" —
  xem Common mistakes.
- **Chặn nhận vượt SL gửi ở OS-OUT** (`E172`) — cùng ý tưởng với `E154` nhưng khác cặp bảng:
  `Σ quantity` mọi OS-IN trỏ cùng một `outsourcingOrderId` không được vượt `outsourcing_orders.
  quantity`. Kiểm hai lần — sớm ở `create` OS-IN (tính cả `DRAFT`+`POSTED`, chặn sai sót nhập liệu
  sớm) và lại ở `post` OS-IN trong transaction (chỉ tính `POSTED`, loại trừ chính dòng đang `post` —
  đây mới là chốt chặn thật, hai OS-IN cùng `DRAFT` có thể lọt qua lượt kiểm đầu).
- **Không ép NCC của OS-OUT phải thuộc nhóm "Gia công" (`supplier_groups.code = 'GC'`)** — nhóm đó
  chỉ là gợi ý lọc dropdown ở FE, backend nhận bất kỳ `supplierId` hợp lệ nào, cùng cách `items.
  supplierId` không ép nhóm.
- **Tiến độ OS-OUT tính lúc đọc, không lưu cột** — cùng khuôn `PurchaseOrderProgress`
  (`docs/domains/purchasing.md`): `DRAFT`/`CANCELLED` đọc thẳng `status`; còn lại suy từ SL đã nhận
  (`Σ` OS-IN `POSTED`) so với SL gửi — `SENT` (0 đã nhận), `PARTIAL` (đã nhận một phần), `COMPLETED`
  (đã nhận đủ).

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
- **← Production**: chỉ đọc, qua `getStockLevels(excludeOrderId)`/`getMaterialStockLevels`.
  Production hiện **không** tự động lập phiếu kho — auto-post là feature ngoài phạm vi đợt này
  (`docs/decisions/stored-inventory-balances.md`). Phiếu vẫn có cột liên kết
  `productionOrderId`/`productionJobId` cho người dùng gắn thủ công — `productionJobId` trên
  `inventory_receipts` **bắt buộc** khi `receiptType = PRODUCTION` (khác `productionOrderId`, vẫn
  tuỳ chọn; khác `inventory_issues.productionJobId`, vẫn tuỳ chọn cho mọi `issueType`).
- **← Production (Gia công ngoài)**: `outsourcing_orders` đọc `production_job_operations.type`
  (snapshot, không đọc `operations.type` sống) + `production_jobs.status` lúc `create` — validate
  công đoạn phải `OUTSOURCE` và Job phải `IN_PROGRESS` (`E166`/`E167`). Một chiều — không ghi
  ngược vào `production_job_operations`/`production_jobs`, đợt này **không** có gating/block tiến
  độ Job theo trạng thái OS-OUT/OS-IN (`docs/domains/production.md`).
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
- **→ Purchasing / Suppliers**: `supplier_returns.purchaseOrderId`/`supplierId` liên kết tuỳ chọn/bắt
  buộc tới đơn mua/NCC gốc — thuần để trace, không đọc ngược (chưa có logic gì đọc lại các cột này).
- **↔ Quality**: `supplier_returns` **tự sinh** từ `IqcService.confirmIqc` khi một dòng IQC chuyển
  `WAITING_RETURN` (`SupplierReturnsService.createFromIqcDisposition`, cùng transaction) — chiều
  ngược lại, `SupplierReturnsService.postSupplierReturn` gọi `completeIqcAfterSupplierReturn`
  (plain function, không qua DI — `IqcModule` đã import `SupplierReturnsModule` nên chiều ngược lại
  không thể đi qua DI mà không tạo vòng lặp module) hoàn tất dòng IQC đó. `iqc_inspections.
  inventoryReceiptId` là chiều trace riêng, tuỳ chọn. Xem `docs/domains/quality.md`,
  `docs/workflows/supplier-return.md`.
- **→ Quality (Gia công ngoài)**: `POST /outsourcing-receipts/:id/post` với `requiresIqc = true` gọi
  `IqcService.createInspectionFromOutsourcingReceipt(tx, ...)` cùng transaction — đường tạo thứ ba
  vào `iqc_inspections` (`docs/domains/quality.md`). **Khác** phiếu nhập mua: IQC ở đây **không**
  gate `post` — cổng IQC (`E153`) chỉ tồn tại ở `inventory_receipts`, `outsourcing_receipts` luôn
  `post` thẳng, sinh IQC xong vẫn `POSTED` ngay. Nếu QC sau đó FAIL + `SORT`/`RETURN`, dòng
  `supplier_returns` tự sinh có `inventoryReceiptId = null` nên `shouldPostStock` trả `true` đúng
  nghĩa (hàng OS-IN đã thật sự vào kho, không phải ca "chưa từng vào tồn" như IQC-trên-phiếu-nhập-
  mua) — không cần nhánh bù trừ nào khác.
- **← Quality (OQC)**: `confirmInventoryReceipt` đọc `getPassedOqcQuantityByJobId` (plain function,
  `src/api/oqc/oqc.query.ts`, không qua DI — `InventoryReceiptsModule` không import `OqcModule`) để
  chặn (`E180`) nhận vượt SL đã PASS OQC của Job. Một chiều — Inventory đọc `oqc_inspections`,
  không ghi ngược; OQC cũng không biết `inventory_receipts` có tồn tại. Xem "Gate nhập kho thành
  phẩm" ở Lifecycle, `docs/domains/quality.md`.
- **← Product Structure**: `GET /inventory` chỉ thấy item `ACTIVE` + chưa xoá mềm, mọi `type`
  (FG/WIP/RM) khi bỏ trống `itemType` — WIP **có** xuất hiện ở đây (khác trước, khi FG/RM là hai
  route tách biệt và WIP không route nào lọc tới) dù `minStock`/`supplierId` trên dòng WIP luôn
  `0`/`null` (chỉ RM dùng, xem `docs/decisions/items-merge.md`).
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
    (xem "Bù trừ SL đã trả" ở Business rules); `postInventoryReceipt` mới là nơi bù trừ thật.
14. **Tưởng `post` OS-IN bị chặn (gate) bởi IQC như phiếu nhập mua.** Sai — `outsourcing_receipts`
    không có trạng thái `PENDING_IQC` nào, IQC (nếu `requiresIqc = true`) sinh ra **sau** khi đã
    `POSTED`, không phải điều kiện để `post` được.
15. **Tưởng NCC của OS-OUT phải thuộc nhóm "Gia công".** Không bị ép ở backend — nhóm `GC` chỉ là
    gợi ý lọc FE.
16. **Tưởng công đoạn `OUTSOURCE` tự chặn/gate tiến độ Job hay công đoạn kế tiếp.** Đợt này chưa có
    cơ chế đó — `production_job_operations.completedQuantity` vẫn nhập tay độc lập với OS-OUT/OS-IN,
    xem `docs/domains/production.md`.
17. **Tưởng `productionJobId` trên `inventory_receipts` vẫn tuỳ chọn như trước.** Không còn — bắt
    buộc khi `receiptType = PRODUCTION` (`E179`), đổi hành vi so với thiết kế ban đầu (cột này vốn
    chỉ để trace, không validate chéo với `receiptType`). `inventory_issues.productionJobId` **không
    đổi** — vẫn tuỳ chọn, đừng nhầm hai cột cùng tên khác quy tắc.
18. **Tưởng chặn xuất kho sản xuất theo IQC, hoặc chặn "giao hàng" theo OQC, là việc còn thiếu.**
    Không — luật xuất kho sản xuất đã tự thoả mãn từ `E153` (hàng NG chưa từng vào tồn nên không
    xuất được), và không có luồng "giao hàng" nào tồn tại để mà chặn. Gate duy nhất cần thêm là ở
    nhập kho thành phẩm (`E179`/`E180`).

## Related docs

- `docs/decisions/stored-inventory-balances.md` — vì sao tồn kho đổi từ tính-lại sang lưu trữ.
- `docs/workflows/stock-movement.md` — trình tự lập/post/cancel phiếu.
- `docs/workflows/supplier-return.md` — luồng đầy đủ từ IQC FAIL tới hoàn tất phiếu trả NCC.
- `docs/workflows/outsourcing-round-trip.md` — luồng OS-OUT → OS-IN → QC tuỳ chọn.
- `docs/workflows/final-qc.md` — luồng OQC → gate nhập kho thành phẩm.
- `docs/domains/orders.md` — nguồn của `reserved`.
- `docs/domains/production.md` — nơi tiêu thụ `onHand`/`reserved`.
- `docs/domains/quality.md` — OQC, nguồn `getPassedOqcQuantityByJobId`.
- `docs/domains/purchase-requests.md` — `purchaseRequestId` trên phiếu nhập.
