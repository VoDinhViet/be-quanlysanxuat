# Inventory (Kho)

## Purpose

Theo dõi tồn kho vật lý theo từng kho (`warehouses`), qua phiếu nhập/phiếu xuất có vòng đời và một
sổ cái ghi mọi biến động — `docs/decisions/stored-inventory-balances.md`.

## Core concepts

**Ba tầng:** `inventory_receipts`/`inventory_issues` (phiếu, có vòng đời) → `inventory_transactions`
(sổ cái, append-only, **nguồn sự thật**) → `inventory_balances` (tồn hiện tại, 1 dòng/(kho×mặt
hàng), **bản chiếu dựng lại được 100%** từ sổ cái). Chỉ `POSTED` mới đụng tồn kho; phiếu `POSTED`
bất biến, sai thì `cancel` (đảo dấu, append) rồi lập phiếu mới.

**Phiếu nhập/xuất là 2 bảng riêng**, mỗi `receiptType`/`issueType` ánh xạ đúng 1 loại bút toán:

| Phiếu | `receiptType`/`issueType` | Bút toán |
| --- | --- | --- |
| Nhập | `PURCHASE`, `RETURN` | `RECEIPT` |
| Nhập | `PRODUCTION` | `PRODUCTION_IN` |
| Nhập | `ADJUSTMENT` | `ADJUSTMENT_IN` |
| Xuất | `SALES`, `RETURN` | `ISSUE` |
| Xuất | `PRODUCTION` | `PRODUCTION_OUT` |
| Xuất | `ADJUSTMENT` | `ADJUSTMENT_OUT` |

`supplier_returns` (trả NCC) ánh xạ sang `ISSUE` có sẵn, phân biệt qua
`referenceType = SUPPLIER_RETURN`. Gia công ngoài (`outsourcing_orders`/`outsourcing_receipts`)
**không ghi bút toán nào** (WIP không quản tồn). `TRANSFER_IN`/`TRANSFER_OUT` có trong enum, chưa
route nào phát ra.

**Mọi bảng đụng mặt hàng chỉ mang một `itemId` NOT NULL** — loại (FG/WIP/RM) suy từ join `items.type`
khi cần lọc, không phải cột riêng. **Kho không thật sự quản tồn WIP** — không nguồn nào ghi
`inventory_balances`/`inventory_transactions` cho WIP, tồn WIP luôn 0
(`docs/decisions/wip-not-stocked.md`). `warehouses.type` chỉ là nhãn lọc, **không** ràng buộc loại
hàng được nhập/xuất — quyết định nghiệp vụ, không phải constraint.

**Công thức tồn — 3 bộ độc lập, đừng trộn:**

1. **`GET /inventory-products` (FG) / `GET /inventory-materials` (RM)** — màn danh mục, chạy trên
   mọi item `ACTIVE`, không chỉ item đã từng nhập kho:
   ```
   onHand    = Σ inventory_balances.quantity (mọi kho, hoặc lọc warehouseId nếu gửi)
   # FG:
   reserved = fgHeld = Σ SL dòng outbound_order_items của DO DRAFT/PENDING_APPROVAL/PENDING_DELIVERY
   bomDemand = max(orderDemand − fgHeld, 0)     orderDemand = phần chưa giao của đơn ĐÃ DUYỆT
   # RM:
   rmHeld         = Σ SL dòng inventory_requisition_items của phiếu lãnh APPROVED (mọi type)
   rmHeldForJobs  = rmHeld, lọc productionJobId IS NOT NULL (không phải lọc trực tiếp type=PRODUCTION
                    — trùng nhau trong thực tế vì E233 ép PRODUCTION phải có Job, nhưng OTHER gửi kèm
                    productionJobId vẫn lọt vào đây)
   bomDemand = max(remainingBomDemand − rmHeldForJobs, 0)  remainingBomDemand = Σ max(requiredQty − Đã lãnh, 0)
   available = onHand − reserved − bomDemand
   ```
   Không trả `status`/`minStock`/`type`/`supplier` trên response — FE tự suy hiển thị từ
   `available`/`minStock`; `status` vẫn dùng được để **lọc** (`stockStatusCondition` chạy ở SQL).
2. **Dòng chi tiết phiếu nhập / đề xuất mua** (`item-stock.query.ts`, dùng chung 2 nơi):
   ```
   bomDemand = Σ production_job_issues.requiredQty của Job/LSX liên kết
   available = onHand − bomDemand              (có thể âm, cố ý)
   fromStock = min(onHand, bomDemand)          (không lưu, tính lại mỗi lần đọc)
   ```
3. **Phiếu lãnh vật tư** (`docs/workflows/inventory-requisition.md`) — công thức **duy nhất chặn
   thao tác** (không chỉ hiển thị):
   ```
   Đã giữ   = Σ SL lãnh phiếu khác đang APPROVED, cùng (warehouseId, itemId)
   Có thể lãnh = Tồn thực tế − Đã giữ                     (chặn tạo/duyệt vượt số này)
   Đã lãnh  = Σ SL lãnh phiếu ISSUED, cùng (productionJobId, itemId)
   Khả dụng = Tồn thực tế − Σ max(requiredQty − Đã lãnh, 0) mọi Job   (chỉ tham khảo)
   ```

`reservedQuantity` trên `inventory_balances` **luôn 0 dưới DB** — không route nào ghi; mọi `reserved`
ở trên đều tính động lúc đọc.

**Thẻ kho thành phẩm** (`GET /inventory-products/:itemId/ledger`) — sổ cái 1 item, tồn luỹ kế:
```
balanceAfter = SUM(quantity) OVER (ORDER BY transactionDate, createdAt, id)   -- toàn bộ lịch sử,
                                                                                trước khi lọc ngày
```
Response **không trả sẵn** "loại giao dịch"/"diễn giải" — FE tự suy từ dấu `quantity` +
`receiptType`/`issueType` (cố ý, cùng chủ trương với việc bỏ `status` ở công thức #1). Chưa có bản
RM. `inventory_issues.outboundOrderId` (chỉ `deliver` DO ghi, không backfill dữ liệu cũ) nối dòng
xuất SALES về đúng mã DO.

## Entities

| Entity | Vai trò |
| --- | --- |
| `warehouses` | Danh mục kho — không soft delete |
| `inventory_receipts` | Phiếu nhập — 5 trạng thái; `purchaseOrderId`/`clientId`/`productionJobId` tuỳ theo `receiptType` |
| `inventory_receipt_items` | Dòng — `purchaseOrderItemId` tuỳ chọn, SL cộng dồn ≤ SL đặt dòng PO (`E154`) |
| `inventory_issues` | Phiếu xuất — cùng vòng đời 3 trạng thái; `outboundOrderId` chỉ `deliver` DO ghi |
| `inventory_issue_items` | Dòng — thêm `orderItemId` tuỳ chọn (chỉ hợp lệ khi `itemId` là FG) |
| `inventory_transactions` | Sổ cái append-only, `quantity` có dấu |
| `inventory_balances` | Tồn hiện tại, dựng lại được từ sổ cái |
| `inventory_requisitions` | Phiếu lãnh — 6 trạng thái riêng; `type=PRODUCTION` bắt buộc `productionJobId` (`E233`) |
| `inventory_requisition_items` | Dòng — luôn RM, unique `(requisitionId, itemId)` |
| `supplier_returns` | Trả NCC — bảng phẳng, tự sinh `DRAFT` từ IQC `WAITING_RETURN`; chưa có tạo tay/`cancel` |
| `outsourcing_orders`/`_items` | OS-OUT — không nháp, `POSTED` ngay; không đụng tồn (WIP) |
| `outsourcing_receipts`/`_items` | OS-IN — cùng khuôn OS-OUT; 1 phiếu = 1 NCC, gộp nhiều OS-OUT |
| `outbound_orders`/`_items` | DO — 6 trạng thái; `clientId` bắt buộc, bất biến 1 phiếu = 1 khách hàng |

`orderItemId` trên dòng phiếu xuất là chỗ nối **duy nhất** sang Orders — vừa tính `reserved`, vừa là
delivery tracking. Chi tiết vòng đời DO: `docs/workflows/outbound-delivery.md`.

## Lifecycle

**Phiếu xuất**: `DRAFT →(post)→ POSTED →(cancel)→ CANCELLED`, hoặc `DRAFT →(cancel)→ CANCELLED`.
`post` với `issueType=PRODUCTION` chạy gate IQC (`E203`, xem Cross-domain).

**Phiếu nhập** — có thêm `confirm` xen giữa lập phiếu và `post`:
```
DRAFT ──confirm (requiresIqc=false)──> PENDING_RECEIPT ──post───────────────> POSTED
DRAFT ──confirm (requiresIqc=true)───> PENDING_IQC ──post (mọi IQC COMPLETED)─> POSTED
{DRAFT, PENDING_IQC, PENDING_RECEIPT, POSTED} ──cancel──> CANCELLED
```
`confirm`: rỗng dòng → `E151`; `requiresIqc=true` sinh N dòng IQC (`kind=INCOMING`) cùng transaction,
nguồn suy từ `receipt.supplierId ?? receipt.clientId ?? purchaseOrder.supplierId` (không suy được →
`E152`); `receiptType=PRODUCTION` chạy thêm gate OQC ngay ở bước này (xem "Gate nhập kho TP").
`post`: **không** còn nhận thẳng từ `DRAFT` — chỉ từ `PENDING_RECEIPT`, hoặc từ `PENDING_IQC` khi mọi
IQC liên quan đã `COMPLETED` (thiếu → `E153`, kể cả chưa có IQC nào).

**Gate nhập kho TP (OQC)** — `receiptType=PRODUCTION`, chạy ở `confirm`:
1. `productionJobId` bắt buộc (`E179`); mọi dòng phải `itemId = job.itemId` (`E107`).
2. Job không còn dòng QC nào (IQC công đoạn `OUTSOURCE` + OQC công đoạn `INHOUSE`, gộp qua
   `getJobQcCoverage`) chưa `COMPLETED` (dòng `SCRAP` không tính) → `E196`; thiếu OQC `COMPLETED`
   của node Cấp 0 → `E209` (tách khỏi `E196`).
3. Σ `quantity` cộng dồn mọi phiếu `PRODUCTION` khác đã `confirm`, cùng Job, ≤ `production_jobs.quantity`
   → `E197`.

**Gate xuất kho sản xuất (IQC)** — `issueType=PRODUCTION`, chạy ở `post`: còn IQC (`kind=INCOMING`)
chưa `COMPLETED` cùng `(itemId, warehouseId)` → `E203` (`hasPendingIqcForItems`, bỏ qua nếu IQC
không suy được kho). Lý do có gate này dù hàng NG "chưa từng vào tồn":
`docs/decisions/qc-gates-on-stock-moves.md`.

**`supplier_returns`** — vòng đời riêng: `(tự sinh, IqcService.confirmIqc) → DRAFT →(post)→ POSTED`.
`post` trừ tồn **chỉ khi** phiếu nhập gốc đã `POSTED` (nếu có) và phiếu không sinh từ OS-IN (hàng
gia công ngoài chưa từng vào tồn) — bù lại, `postInventoryReceipt` tự trừ SL đã trả `POSTED` khỏi
từng dòng trước khi ghi `RECEIPT` (`buildReceiptPostingLines`). Cùng tx gọi
`completeIqcAfterSupplierReturn` (`WAITING_RETURN → COMPLETED`). Chưa có `cancel` (cần đường
"un-complete" IQC, để đợt sau).

**OS-OUT/OS-IN** — không nháp: `(tạo tay, POSTED ngay) →(cancel)→ CANCELLED`. `create` OS-OUT chỉ
kiểm `E019` (NCC tồn tại) + `E182`/`E183` (rỗng dòng/trùng `productionJobOperationId`) rồi `INSERT`
thẳng — **không** validate lại cấu trúc dòng phía server (client gửi thẳng từ popup, `E166`-`E168`
dự phòng). `cancel` OS-OUT chặn `E169` nếu còn OS-IN con chưa `CANCELLED`. `create` OS-IN kiểm
`E185`/`E186` (rỗng dòng/không cùng NCC) + `E172` (SL nhận cộng dồn ≤ SL gửi dòng OS-OUT, trước tx)
+ `E187` (mọi dòng OS-OUT phải cùng NCC với header); `requiresIqc=true` sinh N dòng IQC sau khi đã
`POSTED`, **không gate** việc tạo. `cancel` OS-IN chặn `E173` nếu đã có IQC trỏ vào.

**Phiếu lãnh vật tư** — vòng đời riêng 6 trạng thái, tách khỏi `inventory_document_status`:
```
DRAFT ──send──> PENDING_APPROVAL ──approve──> APPROVED ──issue──> ISSUED  (điểm cuối)
  │                   │                            │
  │                   └──reject──> REJECTED ──send─┘
  └──cancel───────────┴────────────────────────────┴──> CANCELLED
```
Giữ chỗ bắt đầu từ `approve` (không phải `create`) — `create`/`update` chỉ cảnh báo, chặn thật
(`E231`/`E232`) ở `approve`. `issue` (điểm cuối) sinh 1 `inventory_issues POSTED` + trừ tồn, chạy
cùng gate IQC (`E203`). `POST`/`PATCH /inventory-issues` với `issueType=PRODUCTION` bị chặn (`E234`);
`cancel` một `inventory_issues` do phiếu lãnh sinh ra cũng bị chặn (`E235`).

**DO (`outbound_orders`)** — vòng đời riêng 6 trạng thái:
```
DRAFT ──send──> PENDING_APPROVAL ──approve──> PENDING_DELIVERY ──deliver──> DELIVERED  (điểm cuối)
  │                   │                             │
  │                   └──reject──> REJECTED ──send──┘
  └──cancel───────────┴─────────────────────────────┴──> CANCELLED  (điểm cuối)
DRAFT ──delete──> (xoá hẳn, không qua CANCELLED)
```
Chi tiết đầy đủ (giữ chỗ FG từ `create`, gate `E194`/`E205`, side effect `deliver`):
`docs/workflows/outbound-delivery.md`.

## Business rules

- `code` bất biến, unique toàn bảng, tự sinh qua `document_sequences`:
  `PNK-{năm}-{5}`/`PXK-{năm}-{5}` (nhập/xuất), `MR-{năm}-{5}` (lãnh), `PTNCC-{năm}-{5}` (trả NCC),
  `DO-{yyMMdd}-{3}` (giao hàng, reset theo **ngày** — mượn cột `year` encode YYMMDD),
  `OS-OUT-`/`OS-IN-{năm}-{5}` (gia công ngoài).
- **Nhập từ khách hàng** (`receiptType=RETURN` gắn `clientId`) — tách khỏi luồng mua hàng;
  `supplierId`/`clientId` loại trừ lẫn nhau (`E253`). Dòng IQC sinh ra không có `supplierId` nên
  không chọn được `disposition=SORT`/`RETURN` (`E254`) — chỉ còn `CONCESSION`. `inventory_balances`
  chưa phân biệt hàng khách với hàng công ty (giới hạn đã biết).
- **`assetType`** (`COMPANY`/`CLIENT`) — nhãn hiển thị/truy vết tự do trên phiếu nhập, không ràng
  buộc chéo với `clientId`/`receiptType`, không tách tồn theo chủ sở hữu.
- **Nhập từ khác** (`receiptType=ADJUSTMENT`) — không `supplierId`/`clientId`/`purchaseOrderId`;
  `requiresIqc=true` vẫn hợp lệ, dòng IQC sinh ra có cả hai cột null (không phải lỗi).
- **Chặn tồn âm ở DB** (`chk_inventory_balances_quantity_non_negative`); `post` khoá dòng balance
  bằng `SELECT … FOR UPDATE` trước khi cộng/trừ. Dấu bút toán khớp `type`
  (`chk_inventory_transactions_quantity_sign`) — dòng phiếu luôn dương, dấu chỉ ở bút toán.
- `items` trên `PATCH` phiếu `DRAFT` là replace-all, bắt buộc ≥1 dòng.
- `asOfDate` của 2 route danh mục cộng lại từ `inventory_transactions` (không đọc `inventory_balances`,
  bảng đó là tồn hiện tại).
- `E154` (chặn nhận vượt SL đặt PO) và `E172` (chặn nhận vượt SL gửi OS-OUT) tính lúc `create`/
  `update`/`confirm`, cộng dồn mọi phiếu đã xác nhận (không tính `DRAFT`/`CANCELLED`).
- `weight`/`area` trên dòng OS-OUT/OS-IN thuần hiển thị/tính phí NCC — không tham gia validate.
- NCC của OS-OUT không bị ép thuộc nhóm "Gia công" — chỉ là gợi ý lọc FE.

## Invariants

- Mọi dòng balance/bút toán/dòng phiếu mang `itemId` NOT NULL (FK restrict).
- `inventory_balances.quantity` không bao giờ âm (CHECK); phiếu `POSTED` không sửa/xoá qua API;
  `inventory_requisitions.status=ISSUED` là điểm cuối, không sửa/xoá/huỷ.
- `warehouses.type` không ràng buộc loại hàng (nhãn, không phải constraint) — đừng tưởng là bug.
- `reservedQuantity`/`bomDemand`/`status` trên các route danh mục: xem Core concepts — đều tính
  động, không phải cột chết luôn trả 0 như tên gợi ý.

## Cross-domain dependencies

- **← Orders**: dòng đơn đã duyệt tạo `orderDemand` (vào `bomDemand` FG hoặc `reserved` của
  `getStockLevels` — 2 định nghĩa khác nhau, xem Common mistakes). Một chiều.
- **→ Orders**: `OrdersService.getOrderItems` đọc thẳng `inventory_transactions`
  (`orderItemId IS NOT NULL`) tính `issuedQty`/`remainingQty`, không qua DI.
- **← Production**: chỉ đọc qua `getStockLevels`/`getMaterialStockLevels`. Production không tự lập
  phiếu **nhập**. Phiếu **xuất** thì có: `inventory_requisitions.issue` là auto-post duy nhất.
- **→ Production (ghi)**: `postInventoryReceipt` (`receiptType=PRODUCTION`, đủ SL kế hoạch) gọi
  `closeJobIfFullyReceived` → `production_jobs.status = COMPLETED`, cascade
  `production_orders.status = COMPLETED` nếu mọi Job xong — cùng transaction `post`.
- **→ Purchasing (ghi)**: `postInventoryReceipt` gắn `purchaseOrderId` gọi thêm
  `PaymentRequestsService.createIfOrderCompleted(tx, ...)` cùng transaction — tự sinh
  `payment_requests` nếu PO vừa đạt đủ hàng.
- **↔ Production (Phiếu lãnh)**: đọc `production_job_issues.requiredQty` chặn vượt định mức
  (`E230`/`E232`), không ghi ngược. `GET /production-jobs/:jobId/bom` đọc ngược dòng `ISSUED` để
  hiển thị "Đã lãnh".
- **← Production (Gia công ngoài)**: dòng OS-OUT mang snapshot do client gửi từ popup
  `outsourceable-operations` (đọc `production_job_operations`) — server không đọc lại lúc `create`.
  Không gate tiến độ Job/công đoạn theo OS-OUT/OS-IN.
- **→ Orders (ghi, qua DO)**: `deliver` DO → `closeOrdersIfFullyDelivered` (`orders.status =
  COMPLETED` nếu đơn đã giao hết) — cùng transaction. Xem `docs/workflows/outbound-delivery.md`.
- **↔ Quality**: `inventory-receipts confirm`/`outsourcing-receipts create` tạo IQC; `post`
  phiếu nhập đọc lại status IQC (`E153`); `inventory-issues post` đọc `hasPendingIqcForItems`
  (`E203`); `confirmInventoryReceipt` đọc `getJobQcCoverage` (`E196`/`E197`/`E209`); `send` DO đọc
  cùng hàm (`E205`); `supplier_returns` tự sinh/hoàn tất theo IQC. Chi tiết:
  `docs/domains/quality-iqc.md`, `docs/domains/quality-oqc.md`.
- **→ Purchasing/Suppliers**: `inventory_receipts.purchaseOrderId`, `supplier_returns.purchaseOrderId`/
  `supplierId` — trace, `purchase-orders`/`purchase-ledger` đọc lại tính tiến độ nhận hàng.
- **← Product Structure**: 2 route danh mục chỉ item `ACTIVE` chưa xoá mềm.

## Common mistakes

1. Không có route ghi thẳng `inventory_balances` — phải lập phiếu rồi `post`.
2. `reserved` của `GET /inventory-products` (đã có chứng từ giữ — DO) khác `reserved` của
   `getStockLevels` (nhu cầu đơn hàng mở, chỉ `ProductionOrdersService` dùng) — hai định nghĩa
   khác nhau, đừng trộn.
3. Sản xuất không tự lập phiếu **nhập**; phiếu **xuất** thì có qua phiếu lãnh (`issue`).
4. Phiếu nhập `DRAFT` không `post` thẳng được nữa — phải `confirm` trước (`E098` nếu còn `DRAFT`).
   Phiếu xuất không đổi, vẫn `post` thẳng từ `DRAFT`.
5. `E154` chặn nhận vượt SL **đặt của PO** — mua dư qua PO vẫn hợp lệ, chỉ *nhận qua phiếu kho* vượt
   *SL đã đặt* mới bị chặn.
6. `supplier_returns` không có route tạo tay/`cancel`; `postSupplierReturn` không phải lúc nào cũng
   trừ tồn (xem Lifecycle).
7. `POST /inventory-issues` với `issueType=PRODUCTION` bị chặn (`E234`) — đường duy nhất là
   `inventory_requisitions.issue`.
8. Phiếu lãnh giữ chỗ từ `APPROVED`, DO giữ chỗ từ `create` — hai module cố tình lệch mốc.
9. `GET /inventory` (list gộp) đã xoá — tách `GET /inventory-products`/`GET /inventory-materials`;
   `GET /inventory/balances`/`GET /inventory/transactions` không đổi.
10. `rmDemand` trừ `rmHeldForJobs` (chỉ phần có `productionJobId`), không phải `rmHeld` toàn bộ —
    trộn chung sẽ khai khống `available` bằng đúng SL các phiếu `type=OTHER` đang `APPROVED`.
11. `create` DO đã trừ tồn kho? Không — `create`/`send`/`approve` chỉ **kiểm** (`E194`/`E205`),
    không sinh bút toán. Chỉ `deliver` mới thật sự trừ tồn.

## Related docs

- `docs/decisions/stored-inventory-balances.md` — vì sao tồn kho đổi từ tính-lại sang lưu trữ.
- `docs/workflows/stock-movement.md`, `docs/workflows/receipt-confirmation.md`,
  `docs/workflows/inventory-requisition.md`, `docs/workflows/outbound-delivery.md`,
  `docs/workflows/outsourcing-round-trip.md`, `docs/workflows/supplier-return.md`,
  `docs/workflows/outgoing-qc.md`.
- `docs/decisions/qc-gates-on-stock-moves.md`, `docs/decisions/qc-data-model.md`,
  `docs/decisions/oqc-per-operation.md`.
- `docs/domains/orders.md`, `docs/domains/production.md`, `docs/domains/quality-iqc.md`,
  `docs/domains/quality-oqc.md`, `docs/domains/purchase-requests.md`.
