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

**Ba con số, ba ý nghĩa khác nhau** (không đổi so với trước, chỉ đổi nguồn tính `onHand`):

```
onHand    = SUM(inventory_balances.quantity) gộp mọi kho          (thực tế đang có)
reserved  = phần chưa giao của các dòng đơn đã duyệt (đã hứa với khách)
available = onHand − reserved                                      (còn bán được)
```

`reserved` chỉ tính đơn **đã được Giám đốc duyệt** (`AWAITING_PRODUCTION`/`IN_PROGRESS`), nguồn
"đã giao" đọc từ `inventory_transactions` qua `orderItemId` (dòng bút toán âm trên phiếu xuất) thay
vì `stock_receipt_items` cũ — công thức không đổi.

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
| `inventory_receipts` | Phiếu nhập — header, vòng đời `DRAFT`/`POSTED`/`CANCELLED`; `purchaseOrderId` tuỳ chọn trỏ đơn mua (`docs/domains/purchasing.md`), validate PO phải `ORDERED` lúc tạo/sửa |
| `inventory_receipt_items` | Dòng phiếu nhập — `itemId` + `quantity` + `unitPrice` tuỳ chọn; `purchaseOrderItemId` tuỳ chọn, phải thuộc đúng `purchaseOrderId` của header |
| `inventory_issues` | Phiếu xuất — header, cùng vòng đời |
| `inventory_issue_items` | Dòng phiếu xuất — cùng khuôn dòng nhập, thêm `orderItemId` tuỳ chọn |
| `inventory_transactions` | Sổ cái — append-only, nguồn sự thật, `quantity` có dấu |
| `inventory_balances` | Tồn hiện tại — một dòng/(kho × mặt hàng), dựng lại được từ sổ cái |
| `supplier_returns` | Phiếu trả NCC — bảng phẳng (1 phiếu = 1 dòng vật tư), tái dùng `status` của phiếu nhập/xuất; `iqcId` trỏ sang `iqc_inspections` (`docs/domains/quality.md`) khi phiếu trả sinh ra từ một lần IQC FAIL; hiện **chỉ có `GET` list**, chưa có route tạo/`post`/`cancel` nên bảng luôn rỗng |

`orderItemId` trên dòng phiếu xuất (và bút toán sinh ra từ nó) là **chỗ nối duy nhất sang Orders** —
vừa là cơ sở tính `reserved`, vừa chính là delivery tracking mà Orders chưa có. Chỉ hợp lệ trên dòng
mà `itemId` trỏ tới một item `type = FG` (service-enforced, `InventoryIssuesService.ensureItemsValid`).

## Lifecycle

Phiếu (cả nhập lẫn xuất), một chiều:

```
DRAFT ──post──> POSTED ──cancel──> CANCELLED
DRAFT ──cancel────────────────────> CANCELLED
```

- `DRAFT`: sửa (replace-all items)/xoá tự do, không đụng tồn kho.
- `post`: `DRAFT → POSTED`, sinh bút toán + cập nhật `inventory_balances` trong cùng transaction.
  Sau đó phiếu **bất biến** — không `PATCH`/`DELETE`.
- `cancel` từ `DRAFT`: chỉ đổi `status`, không sinh bút toán (chưa từng post thì chưa có gì để đảo).
- `cancel` từ `POSTED`: sinh bút toán **đảo dấu** cho từng dòng đã post (append-only — không xoá
  bút toán cũ), trả `inventory_balances` về như trước khi post.

Không có đường `CANCELLED → DRAFT`/`POSTED` — huỷ là điểm cuối.

`supplier_returns` tái dùng cùng cột `status`/enum nhưng **vòng đời trên chưa áp dụng được** — chưa
có route `post`/`cancel`, chỉ `GET` list. Xem Entities.

## Business rules

- `code` bất biến, unique toàn bảng, sinh theo năm: `PNK-{năm}-{đếm trong năm + 1, pad 5}` (nhập),
  `PXK-{năm}-{...}` (xuất).
- **Chặn tồn âm ở tầng DB**: CHECK `chk_inventory_balances_quantity_non_negative`
  (`quantity >= 0`), không chỉ kiểm ở service. `post` khoá đúng dòng balance bằng
  `SELECT … FOR UPDATE` trong transaction trước khi cộng/trừ — hai phiếu xuất post song song cùng
  một mặt hàng không còn race, khác giới hạn đã biết ở thiết kế cũ.
- Dấu bút toán luôn khớp `type`: CHECK `chk_inventory_transactions_quantity_sign` — `RECEIPT`/
  `TRANSFER_IN`/`PRODUCTION_IN`/`ADJUSTMENT_IN` dương, còn lại âm. Dòng phiếu (`quantity` trên
  `inventory_receipt_items`/`inventory_issue_items`) luôn dương — dấu chỉ xuất hiện ở bút toán,
  không ở dòng phiếu.
- `items` trên `PATCH` phiếu `DRAFT` là **replace-all**.
- Danh sách tồn kho (`GET /inventory`, `GET /inventory/materials`) chạy trên **danh mục**, không
  phải trên phiếu — một sản phẩm chưa từng nhập kho vẫn hiện với `onHand: 0`.
- `asOfDate` của `GET /inventory/materials` không đọc `inventory_balances` được (bảng đó là tồn
  **hiện tại**) — nhánh này cộng lại từ `inventory_transactions` với `transactionDate <= asOfDate`,
  đúng cách phiếu cũ từng làm.

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
- **`reserved`/`bomDemand` của vật tư trên `GET /inventory/materials` luôn bằng 0** — chưa có
  Phiếu lãnh vật tư tự động, chưa nổ BOM đa cấp. `SHORTAGE` **chưa bao giờ xuất hiện thực tế** qua
  đường đọc này. Chỉ đúng cho danh sách này — dòng chi tiết phiếu nhập/đề xuất mua (khối "Bốn số
  khác" ở Core concepts) tính `bomDemand` thật từ `production_job_materials`.

## Cross-domain dependencies

- **← Orders**: dòng đơn của đơn **đã duyệt** tạo ra `reserved`. Một chiều — Inventory đọc Orders,
  không ghi ngược.
- **← Production**: chỉ đọc, qua `getStockLevels(excludeOrderId)`/`getMaterialStockLevels`.
  Production hiện **không** tự động lập phiếu kho — auto-post là feature ngoài phạm vi đợt này
  (`docs/decisions/stored-inventory-balances.md`). Phiếu vẫn có cột liên kết
  `productionOrderId`/`productionJobId` cho người dùng gắn thủ công.
- **→ Purchase Requests**: `inventory_receipts.purchaseRequestId` liên kết tuỳ chọn tới đề xuất mua
  đã sinh ra nhu cầu nhập — không đảo ngược `docs/decisions/no-procurement.md`.
- **→ Purchasing**: `inventory_receipts.purchaseOrderId` +
  `inventory_receipt_items.purchaseOrderItemId` liên kết tuỳ chọn tới đơn mua — validate mức cơ bản
  lúc tạo/sửa (PO phải `ORDERED`, dòng phải thuộc đúng PO), không validate NCC/vật tư khớp 3 chiều
  hay chặn nhận vượt SL đặt. `purchase-orders`/`purchase-ledger` đọc lại hai cột này để tính tiến độ
  nhận hàng (`docs/domains/purchasing.md`).
- **→ Purchasing / Suppliers**: `supplier_returns.purchaseOrderId`/`supplierId` liên kết tuỳ chọn/bắt
  buộc tới đơn mua/NCC gốc — thuần để trace, không đọc ngược (chưa có logic gì đọc lại các cột này).
- **→ Quality**: `supplier_returns.iqcId` trỏ tới `iqc_inspections` — tuỳ chọn, thuần để trace phiếu
  trả nào sinh ra từ lần IQC nào; `iqc_inspections.inventoryReceiptId` là chiều ngược lại, cũng tuỳ
  chọn. Xem `docs/domains/quality.md`.
- **← Product Structure**: chỉ thấy item `type = FG` + `ACTIVE` trên `GET /inventory`, `type = RM`
  + `ACTIVE` trên `GET /inventory/materials`. WIP không có mặt trên màn tồn kho nào dù có thể được
  nhập/xuất qua phiếu (loại kho không ràng buộc loại hàng).
- **← Suppliers**: màn tồn kho vật tư lọc theo NCC chính (`items.supplierId`);
  `inventory_receipts.supplierId` liên kết tuỳ chọn NCC đã giao hàng.

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
7. **Tưởng vật tư đã có "đã giữ"/"tổng nhu cầu BOM" thật.** Hai field đó là **chỗ cắm sẵn**, giá
   trị 0 là do phạm vi hiện tại, không phải bug.
8. **Tưởng sản xuất tự động lập phiếu.** Chưa — `startJob`/hoàn thành Job không sinh phiếu kho nào
   ở đợt này, dù cột liên kết đã có sẵn trên phiếu.

## Related docs

- `docs/decisions/stored-inventory-balances.md` — vì sao tồn kho đổi từ tính-lại sang lưu trữ.
- `docs/workflows/stock-movement.md` — trình tự lập/post/cancel phiếu.
- `docs/domains/orders.md` — nguồn của `reserved`.
- `docs/domains/production.md` — nơi tiêu thụ `onHand`/`reserved`.
- `docs/domains/purchase-requests.md` — `purchaseRequestId` trên phiếu nhập.
