# Gia công ngoài: OS-OUT → OS-IN → QC tuỳ chọn

Chặng nối `production` → `inventory` → `quality`: từ lúc lập phiếu gửi vật tư/WIP ra một NCC gia
công ngoài, tới lúc nhận hàng về, và (tuỳ chọn) kiểm chất lượng hàng nhận về giống hệt cách IQC xử
lý hàng nhập mua. Mô hình `outsourcing_orders`/`outsourcing_order_items`/`outsourcing_receipts`/
`outsourcing_receipt_items` ở `docs/domains/inventory.md`, mô hình `production_job_operations`
(anchor) + cột `plannedQuantity` ở `docs/domains/production.md`, mô hình QC (bảng gộp
`qc_requests`, `kind = INCOMING` cho IQC, `docs/decisions/qc-single-table.md`) ở
`docs/domains/quality.md`; đây là trình tự đầy đủ nối ba domain đó.

Cả hai chứng từ là **header + nhiều dòng** (khác thiết kế lần đầu — bảng phẳng 1 phiếu = 1 dòng vật
tư, xem lịch sử ở `docs/domains/inventory.md` Common mistakes #19). Một OS-OUT gom nhiều part/công
đoạn trong cùng một lượt gửi; một OS-IN gộp hàng về từ nhiều OS-OUT khác nhau miễn cùng một NCC.
**Không có bước nháp** — `create` là gửi/nhận luôn (`docs/decisions/outsourcing-no-draft.md`).
**Không đụng `inventory_balances`/`inventory_transactions`** ở bất kỳ bước nào trong luồng này —
mặt hàng gửi gia công ngoài luôn là WIP, kho không quản tồn WIP
(`docs/decisions/wip-not-stocked.md`).

## Trigger

- `GET /outsourcing-orders/outsourceable-operations` — popup "chọn part cần gia công": liệt kê công
  đoạn `OUTSOURCE` của các Job `IN_PROGRESS`, kèm định mức/đã gửi/còn được phép gửi (chỉ tính cho
  đúng trang đã phân trang, không tính rồi lọc như bản đầu).
- `POST /outsourcing-orders` — lập phiếu gửi gia công ngoài (OS-OUT), nhiều dòng, tay — `POSTED`
  ngay, không đụng tồn kho.
- `GET /outsourcing-receipts/pending-order-items` — popup "chọn hàng cần nhận": liệt kê dòng OS-OUT
  thuộc phiếu `POSTED`.
- `POST /outsourcing-receipts` — lập phiếu nhận gia công ngoài (OS-IN), nhiều dòng, mỗi dòng trỏ
  đúng 1 dòng OS-OUT (thuộc phiếu đã `POSTED`), tay. Một dòng OS-OUT nhận được nhiều lần (partial).
  `POSTED` ngay, không đụng tồn kho; nếu `requiresIqc = true`, cùng transaction sinh N dòng
  `qc_requests` (`kind = INCOMING`, 1/dòng phiếu).
- `POST /outsourcing-orders/:id/cancel` / `POST /outsourcing-receipts/:id/cancel` — huỷ phiếu đã
  `POSTED`, không có bút toán nào để đảo.
- (Nếu có IQC) `POST /iqc/:iqcId/confirm` với `result = FAIL` + `disposition = SORT`/`RETURN` — tự
  sinh `supplier_returns`, tiếp tục đúng luồng đã có ở `docs/workflows/supplier-return.md`.

## Actor

`outsourcing:create` để lập (và do đó gửi/nhận luôn) OS-OUT/OS-IN, `outsourcing:update` cho `cancel`
cả hai. `PRODUCTION` giữ đủ cả 4 quyền; `WAREHOUSE` có `create` (bên thực tế nhận hàng OS-IN) cộng
`update`/`delete` (`delete` không còn route nào dùng tới sau khi bỏ nháp, giữ lại vô hại). `iqc:update`
cho bước `confirm` IQC (nếu có nhánh QC) — không khác gì luồng IQC trên phiếu nhập mua từ điểm này
trở đi.

## Preconditions

| Điều kiện                                                                        | OS-OUT `create`                                                            | OS-IN `create`                                               |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Kho `ACTIVE`                                                                     | — (`warehouseId` vẫn lưu ở header, không còn validate active lúc `create`) | — (OS-IN không gắn kho, `docs/decisions/wip-not-stocked.md`) |
| NCC tồn tại, chưa xoá mềm                                                        | `E019`                                                                     | — (đã xác định ở header)                                     |
| `items[]` không rỗng                                                             | `E182`                                                                     | `E185`                                                       |
| Không trùng dòng trong payload                                                   | `E183` (`productionJobOperationId`)                                        | `E186` (`outsourcingOrderItemId`)                            |
| `productionJobOperationId` hợp lệ, `itemId`/`operationCode`/`operationName` khớp | — (client gửi, server không resolve/validate lại)                          | —                                                            |
| OS-OUT nguồn tồn tại, đang `POSTED`                                              | —                                                                          | `E165`/`E171` (mỗi dòng)                                     |
| NCC của dòng OS-OUT khớp `supplierId` header                                     | —                                                                          | `E187` (mỗi dòng)                                            |
| SL nhận (cộng dồn theo dòng OS-OUT) không vượt SL gửi                            | —                                                                          | `E172` (trước khi mở transaction)                            |
| Còn OS-IN chưa `CANCELLED` (chặn `cancel` OS-OUT)                                | _(xem `cancel`)_                                                           | —                                                            |
| Đã có IQC trỏ vào (chặn `cancel` OS-IN)                                          | —                                                                          | _(xem `cancel`)_                                             |

## Flow

### Lập + gửi OS-OUT

1. (Tuỳ chọn) `GET /outsourcing-orders/outsourceable-operations` — dựng popup chọn part: mỗi dòng
   là một `production_job_operations.type = OUTSOURCE` của Job `IN_PROGRESS`, trả `itemId` top-level
   cùng `job`/`bomItem`/`operation`/`unit` gom nhóm, đủ để client gửi thẳng lại ở bước 2 mà không
   resolve riêng. `plannedQuantity` đọc thẳng cột
   `production_job_bom_items.plannedQuantity`, `sentQuantity`/`remainingQuantity` là SUM
   `outsourcing_order_items` cùng `productionJobOperationId` trạng thái `POSTED` — tất cả trong cùng
   một `.select()`, chỉ tính cho đúng trang đã phân trang.
2. `createOutsourcingOrder` — validate shape thuần (`items[]` không rỗng, không trùng
   `productionJobOperationId`, bảng Preconditions); mỗi dòng mang sẵn `itemId`/`productionJobId`/
   `operationCode`/`operationName` do client gửi (lấy từ bước 1), server không resolve/validate lại
   (`docs/decisions/outsourcing-no-draft.md`). Trong **một** transaction: sinh mã `OS-OUT-xxxx` qua
   `document_sequences` (`docs/architecture.md`, mục "Bất biến xuyên module") + `INSERT` header
   thẳng `status = POSTED` (`postedBy`/`postedAt` set ngay) + `INSERT` mọi dòng. Hết — không gọi
   `InventoryPostingService` ở đâu cả (`docs/decisions/wip-not-stocked.md`).

### Lập + nhận OS-IN (lặp lại nếu nhận nhiều đợt)

3. (Tuỳ chọn) `GET /outsourcing-receipts/pending-order-items` — dựng popup chọn hàng cần nhận: mỗi
   dòng là một `outsourcing_order_items` thuộc phiếu `POSTED`, kèm `weight`/`area` của dòng gốc làm
   giá trị mặc định cho form nhập.
4. `createOutsourcingReceipt` — validate từng dòng **trước** khi mở transaction: OS-OUT nguồn tồn
   tại + `POSTED` (`E165`/`E171`), NCC của dòng khớp `supplierId` header (`E187`), trần SL theo từng
   dòng (`Σ` OS-IN `POSTED` hiện có + SL mới ≤ SL gửi của dòng OS-OUT, `E172`). `itemId` copy từ dòng
   OS-OUT. Trong **một** transaction: sinh mã `OS-IN-xxxx` qua `document_sequences` + `INSERT` header
   thẳng `status = POSTED` + `INSERT` mọi dòng (`.returning()` — dùng để sinh IQC ngay dưới) → nếu
   `requiresIqc`, gọi `IqcService.createInspectionsFromOutsourcingReceipt(tx, {...})` — sinh **N dòng**
   `qc_requests` (`kind = INCOMING`, `NOT_INSPECTED`, 1/dòng phiếu OS-IN), kèm neo
   `outsourcingReceiptItemId`/`productionJobId`/`productionJobOperationId` suy thẳng từ dòng OS-OUT
   nguồn (không phải join mờ theo `(outsourcingReceiptId, itemId)` như thiết kế cũ,
   `docs/decisions/qc-single-table.md`), **không** gate transaction này (hàng đã về nhà máy vật lý
   ngay khi lập phiếu, không phải ghi tồn — gia công ngoài không gọi `InventoryPostingService`,
   `docs/decisions/wip-not-stocked.md`).

### QC (chỉ khi `requiresIqc = true`)

5. Từ đây đúng luồng `POST /iqc/:iqcId/confirm` đã có, chạy **độc lập cho từng dòng IQC** — QC chọn
   `result`/`disposition` riêng cho mỗi dòng. `result = PASS` hoặc `disposition = CONCESSION` →
   `COMPLETED` ngay. `result = FAIL` + `disposition = SORT`/`RETURN` → `WAITING_RETURN`, tự sinh
   `supplier_returns` (`DRAFT`, `outsourcingReceiptId` trỏ về header OS-IN — **không** trỏ dòng cụ
   thể, `iqcId` mới là chỗ trace về đúng dòng) — nhưng `outsourcing_receipts` không còn cột
   `warehouseId` (`docs/decisions/wip-not-stocked.md`), nên dòng IQC xuất phát từ OS-IN **luôn**
   rơi vào `E163` ở bước suy kho trả (`resolveReturnWarehouseId`, xem `docs/domains/quality.md`) —
   chấp nhận là hạn chế đã biết cho tới khi có điểm nhập kho khác cho nhánh này.
6. `postSupplierReturn` — đúng khuôn `docs/workflows/supplier-return.md`, nhưng
   **`shouldPostStock` luôn `false`** ở nhánh này: hàng OS-IN chưa từng vào `inventory_balances`
   (`docs/decisions/wip-not-stocked.md`), trừ tồn sẽ ra âm giả — `shouldPostStock` nhận diện qua
   `outsourcingReceiptId` (không null) của dòng `supplier_returns` sinh ra từ OS-IN, kiểm **trước**
   cả điều kiện `inventoryReceiptId`. Phiếu trả trong nhánh này không bao giờ sinh bút toán, chỉ là
   chứng từ + hoàn tất IQC liên kết.

## State changes

| Entity                                                                 | Trigger                            | Trước       | Sau                                   |
| ---------------------------------------------------------------------- | ---------------------------------- | ----------- | ------------------------------------- |
| `outsourcing_orders` + `outsourcing_order_items`                       | `create`                           | _(chưa có)_ | 1 header `POSTED` + N dòng            |
| `outsourcing_orders.status`                                            | `cancel`                           | `POSTED`    | `CANCELLED`                           |
| `outsourcing_receipts` + `outsourcing_receipt_items`                   | `create`                           | _(chưa có)_ | 1 header `POSTED` + N dòng            |
| `qc_requests` (`kind = INCOMING`)                              | `create` OS-IN (nếu `requiresIqc`) | _(chưa có)_ | N dòng `NOT_INSPECTED` (1/dòng phiếu) |
| `outsourcing_receipts.status`                                          | `cancel`                           | `POSTED`    | `CANCELLED`                           |
| ...(từ đây giống `docs/workflows/supplier-return.md`, "State changes") |                                    |             |                                       |

## Side effects

- `create` OS-OUT: không side effect nào khác — chỉ header + N dòng, không đụng module nào khác.
- `create` OS-IN với `requiresIqc = true`: thêm N dòng `qc_requests` (`kind = INCOMING`,
  bằng số dòng phiếu OS-IN), mã `IQC-{năm}-xxxxx` — dùng chung bộ đếm với IQC sinh từ phiếu nhập mua
  (cùng bảng, cùng hàm `generateIqcCodes`, sinh N mã liên tiếp trong một lượt).
- Nhánh QC (nếu FAIL + SORT/RETURN): xem "Side effects" ở `docs/workflows/supplier-return.md` —
  không có gì khác nguồn OS-IN so với nguồn phiếu nhập mua từ bước `confirm` IQC trở đi.

## Transaction boundary

Các transaction rời theo từng route, không transaction nào bắc cầu quá 2 module:

1. `createOutsourcingOrder` — chỉ `outsourcing_orders`/`outsourcing_order_items`, không đụng module
   nào khác. Validate chạy **trước** khi mở transaction, không kiểm lại trong transaction.
2. `createOutsourcingReceipt` — `outsourcing_receipts`/`outsourcing_receipt_items` + (tuỳ chọn)
   `IqcService.createInspectionsFromOutsourcingReceipt` (module `iqc`, gọi trực tiếp qua DI —
   `OutsourcingReceiptsModule` import `IqcModule`; chiều ngược lại không tồn tại, `IqcService` đọc
   bảng `outsourcing_receipts` thẳng qua `tx`, không cần DI ngược nên **không** phát sinh vòng lặp
   module như cặp `IqcModule`/`SupplierReturnsModule`).
3. `confirmIqc` — `qc_requests` + `SupplierReturnsService.createFromIqcDisposition` (đã có
   từ trước, không đổi cơ chế).
4. `postSupplierReturn` — `supplier_returns` + `InventoryPostingService` +
   `completeIqcAfterSupplierReturn` (plain function, như luồng gốc).

Sinh mã (`OS-OUT-xxxx`/`OS-IN-xxxx`) nằm **trong** transaction `create`, qua `document_sequences` —
cùng khuôn mọi module sinh mã chứng từ khác trong repo (`docs/architecture.md`, mục "Bất biến xuyên
module"), atomic thật (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`), không còn giới hạn
đếm-rồi-cộng: hai lượt `create` song song không thể ra cùng mã. Transaction `create` của OS-IN dài
hơn OS-OUT một chút (thêm bước sinh IQC khi `requiresIqc = true`).

## Failure cases

`E019` (NCC không tồn tại), `E098` (`cancel` gọi trên phiếu đã
`CANCELLED` — không còn xảy ra ở `create` vì không còn trạng thái nguồn nào để sai). **`E106`
(thiếu tồn kho) không bao giờ xảy ra ở `create` OS-OUT/OS-IN** — hai route này không gọi
`InventoryPostingService` (`docs/decisions/wip-not-stocked.md`), khác `inventory_receipts`/
`inventory_issues`/`supplier_returns`. `E165`/`E170` (không tìm thấy OS-OUT/OS-IN), `E169`
(huỷ OS-OUT còn OS-IN chưa `CANCELLED`), `E171` (tạo dòng OS-IN khi OS-OUT nguồn đã `CANCELLED`),
`E172` (SL nhận vượt SL gửi của dòng), `E173` (huỷ OS-IN đã có IQC trỏ vào), `E182`/`E185`
(`items[]` rỗng), `E183`/`E186` (trùng dòng trong payload), `E187`
(dòng OS-OUT khác NCC với header OS-IN). Nhánh QC (nếu có) dùng lại nguyên bộ lỗi ở
`docs/workflows/supplier-return.md`.

## Business rules

- Vì sao OS-OUT bắt buộc mỗi dòng gắn `productionJobOperationId` của một Job `IN_PROGRESS`, vì sao
  chặn gửi vượt định mức, và vì sao không ép nhóm NCC → `docs/domains/inventory.md`.
- Vì sao IQC trên OS-IN không gate `create` (khác phiếu nhập mua), và vì sao `shouldPostStock` luôn
  `false` cho nhánh này → `docs/domains/inventory.md`, "Gia công ngoài" ở Cross-domain dependencies.
- Quy tắc suy `status`/`disposition` của một dòng IQC, không đổi gì cho nguồn OS-IN →
  `docs/domains/quality.md`.
- Vì sao không còn bước nháp, route nào bị bỏ, và điều gì không nên hoàn lại →
  `docs/decisions/outsourcing-no-draft.md`.
- Vì sao gia công ngoài không đụng `inventory_balances`/`inventory_transactions` →
  `docs/decisions/wip-not-stocked.md`.
- **Chưa có** gating/block tiến độ Job hay công đoạn kế tiếp theo trạng thái OS-OUT/OS-IN — để đợt
  sau, xem `docs/domains/production.md`.
- **Chưa có** xuất Excel, in PDF/QR, hay endpoint dữ liệu in phiếu — chỉ có `GET` list/detail trả
  JSON đầy đủ cột; in phiếu (nếu làm) là việc của đợt sau.

## Related domains

`inventory` (chủ cả hai chứng từ) ↔ `production` (đọc-một-chiều, anchor, cả `production_job_operations`
lẫn cột `plannedQuantity`) ↔ `quality` (tuỳ chọn, tự sinh N dòng khi `requiresIqc`). Không đụng
`purchasing`/`suppliers` ngoài việc `outsourcing_orders.supplierId`/`outsourcing_receipts.supplierId`
trỏ `suppliers` (thuần FK, không validate nhóm).

Bước trước: `production_job_operations` snapshot `type = OUTSOURCE` đã có sẵn từ lúc duyệt LSX
(`docs/domains/production.md`) — không phải bước của luồng này, chỉ là điều kiện cần.
Bước sau: nếu có nhánh QC FAIL + SORT/RETURN, tiếp tục đúng
`docs/workflows/supplier-return.md` từ bước `post` phiếu trả.

Code: `OutsourcingOrdersService`, `OutsourcingReceiptsService`,
`src/api/outsourcing-receipts/outsourcing-receipts.query.ts#getReceivedQuantityByOrderItemIds`,
`IqcService.createInspectionsFromOutsourcingReceipt`.
