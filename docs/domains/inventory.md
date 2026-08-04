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
theo `(warehouseId, productId|materialId)`. Bảng tồn không phải nguồn sự thật độc lập, chỉ là cache
có thể build lại.

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

**Item là `products` hoặc `materials`, không có bảng chung.** Mọi bảng đụng tới mặt hàng
(`inventory_receipt_items`, `inventory_issue_items`, `inventory_transactions`, `inventory_balances`)
đều mang `itemType` (`PRODUCT`/`MATERIAL`) + `productId`/`materialId` nullable, ràng buộc CHECK
"đúng một trong hai khớp `itemType`" — đúng khuôn `bom_items` (`chk_bom_items_item_type_target`).

**Loại kho không ràng buộc cứng loại hàng.** `warehouses.type` (`MATERIAL`/`FINISHED_GOODS`/`WIP`)
là nhãn phân loại/lọc — quyết định nghiệp vụ, không phải constraint kỹ thuật. Một kho `MATERIAL`
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

## Entities

| Entity | Vai trò |
| --- | --- |
| `warehouses` | Danh mục kho — `code`/`name`/`type`/`status`, không soft delete |
| `inventory_receipts` | Phiếu nhập — header, vòng đời `DRAFT`/`POSTED`/`CANCELLED` |
| `inventory_receipt_items` | Dòng phiếu nhập — `itemType` + `productId`/`materialId` + `quantity` + `unitPrice` tuỳ chọn |
| `inventory_issues` | Phiếu xuất — header, cùng vòng đời |
| `inventory_issue_items` | Dòng phiếu xuất — cùng khuôn dòng nhập, thêm `orderItemId` tuỳ chọn |
| `inventory_transactions` | Sổ cái — append-only, nguồn sự thật, `quantity` có dấu |
| `inventory_balances` | Tồn hiện tại — một dòng/(kho × mặt hàng), dựng lại được từ sổ cái |

`orderItemId` trên dòng phiếu xuất (và bút toán sinh ra từ nó) là **chỗ nối duy nhất sang Orders** —
vừa là cơ sở tính `reserved`, vừa chính là delivery tracking mà Orders chưa có. Chỉ hợp lệ trên dòng
`itemType = PRODUCT`.

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

- Mỗi dòng `inventory_balances`/bút toán trỏ đúng một trong `productId`/`materialId`, khớp
  `itemType` (DB CHECK).
- `inventory_balances.quantity` không bao giờ âm (DB CHECK) — không thao tác nào qua API làm tồn
  một mặt hàng xuống dưới 0.
- Phiếu `POSTED` không sửa/xoá được qua API.
- Mọi dòng `quantity` trên dòng phiếu đều dương (DB CHECK); dấu chỉ nằm ở bút toán.

Không phải invariant dù dễ tưởng:

- **DB không đảm bảo dòng phiếu khớp `itemType` của mọi ràng buộc nghiệp vụ khác** (vd loại kho ↔
  loại hàng) — CHECK chỉ đảm bảo "đúng một trong hai FK khớp `itemType`", không đảm bảo gì thêm.
  Loại kho không ràng buộc loại hàng là quyết định nghiệp vụ (xem Core concepts), không phải một
  ràng buộc bị thiếu.
- **`reservedQuantity` trên `inventory_balances` luôn bằng 0** — cột có sẵn, chưa route nào ghi.
- **`reserved`/`bomDemand` của vật tư hiện luôn bằng 0** — chưa có Phiếu lãnh vật tư tự động,
  chưa nổ BOM. `SHORTAGE` của vật tư **chưa bao giờ xuất hiện thực tế** qua đường đọc này (khác
  `ProductionJobsService.collectMaterialShortages`, tính riêng cho mục đích tạo đề xuất mua —
  `docs/domains/purchase-requests.md`).

## Cross-domain dependencies

- **← Orders**: dòng đơn của đơn **đã duyệt** tạo ra `reserved`. Một chiều — Inventory đọc Orders,
  không ghi ngược.
- **← Production**: chỉ đọc, qua `getStockLevels(excludeOrderId)`/`getMaterialStockLevels`.
  Production hiện **không** tự động lập phiếu kho — auto-post là feature ngoài phạm vi đợt này
  (`docs/decisions/stored-inventory-balances.md`). Phiếu vẫn có cột liên kết
  `productionOrderId`/`productionJobId` cho người dùng gắn thủ công.
- **→ Purchase Requests**: `inventory_receipts.purchaseRequestId` liên kết tuỳ chọn tới đề xuất mua
  đã sinh ra nhu cầu nhập — không đảo ngược `docs/decisions/no-procurement.md`.
- **← Product Structure**: chỉ thấy sản phẩm `FINISHED_GOOD` + `ACTIVE` trên `GET /inventory`. WIP
  không có mặt trên màn tồn kho thành phẩm dù có thể được nhập/xuất qua phiếu (loại kho không ràng
  buộc loại hàng).
- **← Materials / Suppliers**: màn tồn kho vật tư lọc theo nhóm vật tư và NCC chính;
  `inventory_receipts.supplierId` liên kết tuỳ chọn NCC đã giao hàng.

## Common mistakes

1. **Đi tìm cột tồn kho để cập nhật trực tiếp.** Không có route nào ghi thẳng `inventory_balances`
   — muốn đổi tồn thì lập phiếu rồi `post`.
2. **Tưởng phiếu `DRAFT` đã đụng tồn kho.** Chỉ `post` mới sinh bút toán/cập nhật balance.
3. **Tưởng sửa/xoá được phiếu đã `POSTED`.** Bất biến — `cancel` rồi lập phiếu mới.
4. **Dùng `available` của màn Kho khi tính cho một PO cụ thể.** Sẽ trừ nhu cầu của chính PO đó hai
   lần — phải truyền `excludeOrderId`.
5. **Gắn `orderItemId` vào dòng vật tư.** Chỉ hợp lệ trên dòng `itemType = PRODUCT` của phiếu xuất.
6. **Tưởng loại kho ràng buộc loại hàng.** Không — `warehouses.type` chỉ là nhãn, kho `MATERIAL`
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
